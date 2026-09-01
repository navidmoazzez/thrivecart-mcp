/**
 * Transactions and revenue.
 *
 * Two things shape this module.
 *
 * ThriveCart's own `product_id` filter on the transactions endpoint is
 * unreliable — it returns rows for other products, and it does so silently, so
 * a revenue figure built on it looks plausible and is wrong. Filtering happens
 * here instead, on the product name, after the rows are fetched.
 *
 * And a revenue summary has to see every transaction, not the first page, so it
 * walks the cursor itself. That is the one genuinely expensive call in this
 * server, which is why it is separated from get_transactions rather than being
 * a flag on it.
 */

import { z } from "zod";
import { accountArg, defineTool, clamp, type AnyToolSpec } from "./kit.js";
import type { Account } from "../config.js";
import type { ThriveCartClient } from "../api/client.js";
import type { Config } from "../config.js";
import {
  filterByDate,
  filterByItemName,
  summariseByProduct,
  transactionsFrom,
  type RawTransaction,
} from "../format/transactions.js";

const dateArgs = {
  date_from: z.string().optional().describe("Start date, inclusive. YYYY-MM-DD."),
  date_to: z.string().optional().describe("End date, inclusive. YYYY-MM-DD."),
};

/**
 * Walk every page of transactions.
 *
 * Stops at `config.maxPages` so a server that keeps returning a full page
 * cannot spin here forever, and reports when it hit that ceiling rather than
 * quietly returning a partial total as if it were complete.
 */
async function fetchAll(
  client: ThriveCartClient,
  config: Config,
  account: Account,
  query: Record<string, unknown>,
): Promise<{ rows: RawTransaction[]; truncated: boolean }> {
  const rows: RawTransaction[] = [];
  const perPage = 100;

  for (let page = 1; page <= config.maxPages; page++) {
    const payload = await client.get(account, "transactions", { ...query, page, perPage });
    const batch = transactionsFrom(payload);
    if (batch.length === 0) return { rows, truncated: false };
    rows.push(...batch);
    // A short page is the last page. ThriveCart sends no total count.
    if (batch.length < perPage) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

const getTransactions = defineTool({
  name: "get_transactions",
  title: "Get transactions",
  description:
    "Get transactions from a ThriveCart account, with optional date and product-name filtering. ThriveCart's own product_id filter is unreliable and silently returns rows for other products, so filter with item_name instead — it is a case-insensitive contains match on the product name. Set fetch_all only when you need complete figures; it walks every page.",
  schema: {
    ...dateArgs,
    item_name: z
      .string()
      .optional()
      .describe("Filter by product name, case-insensitive contains match."),
    status: z.string().optional().describe("ThriveCart transaction status filter."),
    page: z.number().int().min(1).optional().describe("Page number. Ignored when fetch_all is true."),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Results per page, 1-100. Defaults to 25. Ignored when fetch_all is true."),
    fetch_all: z
      .boolean()
      .optional()
      .describe(
        "Walk every page instead of returning one. Use for complete figures; it costs one request per 100 transactions.",
      ),
    ...accountArg,
  },
  risk: "read" as const,
  handler: async (
    { date_from, date_to, item_name, status, page, per_page, fetch_all, account },
    ctx,
  ) => {
    const target = ctx.account(account);
    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    let rows: RawTransaction[];
    let truncated = false;

    if (fetch_all) {
      const all = await fetchAll(ctx.client, ctx.config, target, query);
      rows = all.rows;
      truncated = all.truncated;
    } else {
      const payload = await ctx.client.get(target, "transactions", {
        ...query,
        page: page ?? 1,
        perPage: clamp(per_page, 25),
      });
      rows = transactionsFrom(payload);
    }

    const fetched = rows.length;
    rows = filterByDate(rows, date_from, date_to);
    if (item_name) rows = filterByItemName(rows, item_name);

    const { totalRevenue } = summariseByProduct(rows);

    return {
      account: target.name,
      // Without fetch_all these figures describe one page, not the cart. Saying
      // so stops a page total being reported as the period total.
      scope: fetch_all ? "all matching transactions" : `page ${page ?? 1} only`,
      ...(truncated
        ? {
            warning: `Stopped after ${ctx.config.maxPages} pages. Figures are incomplete. Narrow the date range or raise THRIVECART_MAX_PAGES.`,
          }
        : {}),
      fetched,
      matched: rows.length,
      total_revenue: totalRevenue,
      transactions: rows,
    };
  },
});

const getRevenueSummary = defineTool({
  name: "get_revenue_summary",
  title: "Get revenue summary",
  description:
    "Revenue for a date range, grouped by product and sorted highest first, for one ThriveCart account. Walks every page of transactions, so it is the expensive call in this server — give it a date range rather than asking for all time. Money is summed in integer cents, so the totals are exact. Figures cover one cart only; run it per account and never add the results together unless asked to.",
  schema: { ...dateArgs, ...accountArg },
  risk: "read" as const,
  handler: async ({ date_from, date_to, account }, ctx) => {
    const target = ctx.account(account);
    const { rows, truncated } = await fetchAll(ctx.client, ctx.config, target, {});
    const inRange = filterByDate(rows, date_from, date_to);
    const { products, totalSales, totalRevenue } = summariseByProduct(inRange);

    return {
      account: target.name,
      date_range: { from: date_from ?? "all time", to: date_to ?? "now" },
      ...(truncated
        ? {
            warning: `Stopped after ${ctx.config.maxPages} pages of transactions. These figures are incomplete. Narrow the date range or raise THRIVECART_MAX_PAGES.`,
          }
        : {}),
      total_sales: totalSales,
      total_revenue: totalRevenue,
      products,
    };
  },
});

export const transactionTools: AnyToolSpec[] = [
  getTransactions,
  getRevenueSummary,
] as unknown as AnyToolSpec[];
