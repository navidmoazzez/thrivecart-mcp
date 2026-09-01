/**
 * Shaping transaction data for a model.
 *
 * ThriveCart is inconsistent about field names across endpoints and across
 * account vintages: an amount arrives as `amount` or `total`, a date as `date`
 * or `created_at`, a product name as `item_name` or `product_name`. Reading
 * those keys inline at each call site is how a revenue total silently comes
 * back as zero — `parseFloat(undefined)` is NaN, and NaN added to a running sum
 * poisons the whole figure without ever throwing.
 *
 * So every read of those fields goes through here, and money is summed in
 * integer cents rather than floats, because 0.1 + 0.2 is not 0.3 and a revenue
 * report that is off by a penny is a revenue report nobody trusts.
 */

export type RawTransaction = Record<string, unknown>;

/** First present, non-empty value among `keys`. */
function pick(row: RawTransaction, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function itemName(row: RawTransaction): string {
  const name = pick(row, ["item_name", "product_name", "product", "name"]);
  return typeof name === "string" && name.trim() ? name : "Unknown";
}

/** Transaction date as a Date, or undefined when ThriveCart sent nothing usable. */
export function transactionDate(row: RawTransaction): Date | undefined {
  const raw = pick(row, ["date", "created_at", "purchase_date", "timestamp"]);
  if (raw === undefined) return undefined;
  // A unix timestamp arrives as a number or a numeric string; anything else is
  // an ISO-ish date string.
  const asNumber = typeof raw === "number" ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  const date = Number.isFinite(asNumber)
    ? new Date(asNumber < 1e11 ? asNumber * 1000 : asNumber)
    : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Transaction amount in integer cents.
 *
 * Returns 0 rather than NaN for a row with no readable amount, so one odd row
 * cannot poison a total. Amounts already in cents (ThriveCart sends these on
 * some endpoints) are detected by the absence of a decimal point.
 */
export function amountCents(row: RawTransaction): number {
  const raw = pick(row, ["amount", "total", "price", "amount_paid"]);
  if (raw === undefined) return 0;

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw * 100) : 0;
  }
  const text = String(raw).replace(/[^0-9.\-]/g, "");
  if (!text || text === "-") return 0;
  const value = Number(text);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

/** Pull the transaction array out of whichever envelope ThriveCart used. */
export function transactionsFrom(payload: unknown): RawTransaction[] {
  if (Array.isArray(payload)) return payload as RawTransaction[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["transactions", "data", "results", "orders"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value as RawTransaction[];
  }
  return [];
}

/** Keep rows inside an inclusive date range. Rows with no date are kept. */
export function filterByDate(
  rows: RawTransaction[],
  from: string | undefined,
  to: string | undefined,
): RawTransaction[] {
  if (!from && !to) return rows;

  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;
  // A bare YYYY-MM-DD parses as midnight UTC, which would drop everything
  // bought on the end date itself.
  if (end) end.setHours(23, 59, 59, 999);

  if (start && Number.isNaN(start.getTime()))
    throw new Error(`date_from "${from}" is not a date. Use YYYY-MM-DD.`);
  if (end && Number.isNaN(end.getTime()))
    throw new Error(`date_to "${to}" is not a date. Use YYYY-MM-DD.`);

  return rows.filter((row) => {
    const at = transactionDate(row);
    // Keeping an undated row is the safer failure: dropping it would understate
    // revenue silently, which is the error nobody catches.
    if (!at) return true;
    if (start && at < start) return false;
    if (end && at > end) return false;
    return true;
  });
}

/** Case-insensitive contains match on the product name. */
export function filterByItemName(rows: RawTransaction[], needle: string): RawTransaction[] {
  const want = needle.trim().toLowerCase();
  if (!want) return rows;
  return rows.filter((row) => itemName(row).toLowerCase().includes(want));
}

export type ProductSummary = {
  product: string;
  sales: number;
  revenue: number;
};

/** Group transactions by product, sorted by revenue, highest first. */
export function summariseByProduct(rows: RawTransaction[]): {
  products: ProductSummary[];
  totalSales: number;
  totalRevenue: number;
} {
  const byProduct = new Map<string, { sales: number; cents: number }>();
  let totalCents = 0;

  for (const row of rows) {
    const name = itemName(row);
    const cents = amountCents(row);
    const entry = byProduct.get(name) ?? { sales: 0, cents: 0 };
    entry.sales += 1;
    entry.cents += cents;
    byProduct.set(name, entry);
    totalCents += cents;
  }

  const products = [...byProduct.entries()]
    .map(([product, { sales, cents }]) => ({
      product,
      sales,
      revenue: centsToAmount(cents),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.product.localeCompare(b.product));

  return {
    products,
    totalSales: rows.length,
    totalRevenue: centsToAmount(totalCents),
  };
}
