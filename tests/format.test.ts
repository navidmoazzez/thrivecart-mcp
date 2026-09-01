import { describe, expect, it } from "vitest";
import {
  amountCents,
  centsToAmount,
  filterByDate,
  filterByItemName,
  itemName,
  summariseByProduct,
  transactionDate,
  transactionsFrom,
} from "../src/format/transactions.js";

describe("itemName", () => {
  it("reads whichever name field ThriveCart used", () => {
    expect(itemName({ item_name: "Course" })).toBe("Course");
    expect(itemName({ product_name: "Course" })).toBe("Course");
  });

  it("labels a nameless row rather than returning undefined into a group key", () => {
    expect(itemName({})).toBe("Unknown");
    expect(itemName({ item_name: "" })).toBe("Unknown");
  });
});

describe("amountCents", () => {
  it("reads whichever amount field ThriveCart used", () => {
    expect(amountCents({ amount: "19.99" })).toBe(1999);
    expect(amountCents({ total: 19.99 })).toBe(1999);
  });

  it("returns 0 for an unreadable amount, so one odd row cannot poison a total", () => {
    expect(amountCents({})).toBe(0);
    expect(amountCents({ amount: "n/a" })).toBe(0);
    expect(amountCents({ amount: null })).toBe(0);
  });

  it("strips currency symbols", () => {
    expect(amountCents({ amount: "$1,0" })).toBe(1000);
  });

  it("sums exactly, where floats would not", () => {
    const cents = amountCents({ amount: "0.1" }) + amountCents({ amount: "0.2" });
    expect(centsToAmount(cents)).toBe(0.3);
    expect(0.1 + 0.2).not.toBe(0.3);
  });
});

describe("transactionDate", () => {
  it("parses ISO strings and unix seconds alike", () => {
    expect(transactionDate({ date: "2026-03-01" })?.getUTCFullYear()).toBe(2026);
    expect(transactionDate({ created_at: 1772323200 })?.getUTCFullYear()).toBe(2026);
  });

  it("returns undefined rather than an Invalid Date", () => {
    expect(transactionDate({})).toBeUndefined();
    expect(transactionDate({ date: "not a date" })).toBeUndefined();
  });
});

describe("transactionsFrom", () => {
  it("unwraps every envelope ThriveCart uses", () => {
    expect(transactionsFrom([{ a: 1 }])).toHaveLength(1);
    expect(transactionsFrom({ transactions: [{ a: 1 }] })).toHaveLength(1);
    expect(transactionsFrom({ data: [{ a: 1 }] })).toHaveLength(1);
    expect(transactionsFrom(null)).toEqual([]);
  });
});

describe("filterByDate", () => {
  const rows = [
    { date: "2026-01-15", amount: "10" },
    { date: "2026-02-15", amount: "20" },
    { date: "2026-03-15", amount: "30" },
  ];

  it("includes the end date itself, not just up to its midnight", () => {
    expect(filterByDate(rows, "2026-02-15", "2026-02-15")).toHaveLength(1);
  });

  it("filters inclusively at both ends", () => {
    expect(filterByDate(rows, "2026-02-01", "2026-03-01")).toHaveLength(1);
  });

  it("keeps undated rows, because dropping them would understate revenue silently", () => {
    expect(filterByDate([...rows, { amount: "40" }], "2026-01-01", "2026-01-31")).toHaveLength(2);
  });

  it("rejects an unparseable date instead of returning nothing", () => {
    expect(() => filterByDate(rows, "last tuesday", undefined)).toThrow(/not a date/);
  });
});

describe("filterByItemName", () => {
  it("matches case-insensitively on a substring", () => {
    const rows = [{ item_name: "AI Course" }, { item_name: "Bundle" }];
    expect(filterByItemName(rows, "course")).toHaveLength(1);
    expect(filterByItemName(rows, "")).toHaveLength(2);
  });
});

describe("summariseByProduct", () => {
  it("groups, sums and sorts by revenue", () => {
    const { products, totalSales, totalRevenue } = summariseByProduct([
      { item_name: "A", amount: "10.00" },
      { item_name: "B", amount: "25.50" },
      { item_name: "A", amount: "10.00" },
    ]);
    expect(totalSales).toBe(3);
    expect(totalRevenue).toBe(45.5);
    expect(products[0]).toEqual({ product: "B", sales: 1, revenue: 25.5 });
    expect(products[1]).toEqual({ product: "A", sales: 2, revenue: 20 });
  });

  it("returns zeroes for no rows rather than NaN", () => {
    expect(summariseByProduct([])).toEqual({ products: [], totalSales: 0, totalRevenue: 0 });
  });

  it("counts a row with an unreadable amount as a sale worth nothing", () => {
    const { totalSales, totalRevenue } = summariseByProduct([{ item_name: "A" }]);
    expect(totalSales).toBe(1);
    expect(totalRevenue).toBe(0);
  });
});
