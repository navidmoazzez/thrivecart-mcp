#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.THRIVECART_API_KEY;
const BASE_URL = "https://thrivecart.com/api/external";

if (!API_KEY) {
  console.error("THRIVECART_API_KEY environment variable is required");
  process.exit(1);
}

async function apiGet(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ThriveCart API error ${response.status}: ${text}`);
  }
  return response.json();
}

async function apiPost(endpoint, body = {}) {
  const response = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ThriveCart API error ${response.status}: ${text}`);
  }
  return response.json();
}

async function getAllTransactions(params = {}) {
  let all = [];
  let page = 1;
  while (true) {
    const data = await apiGet("transactions", { ...params, page, perPage: 100 });
    const items = data.transactions || data.data || [];
    if (items.length === 0) break;
    all = all.concat(items);
    if (items.length < 100) break;
    page++;
  }
  return all;
}

function filterByDate(transactions, date_from, date_to) {
  let result = transactions;
  if (date_from) {
    const from = new Date(date_from);
    result = result.filter((t) => new Date(t.date || t.created_at) >= from);
  }
  if (date_to) {
    const to = new Date(date_to);
    to.setHours(23, 59, 59, 999);
    result = result.filter((t) => new Date(t.date || t.created_at) <= to);
  }
  return result;
}

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

const server = new McpServer({ name: "thrivecart", version: "1.0.0" });

// ── Products ──

server.tool("list_products", "List all ThriveCart products", {}, async () => {
  return json(await apiGet("products"));
});

server.tool("get_product", "Get details for a specific product", {
  product_id: z.string().describe("Product ID"),
}, async ({ product_id }) => {
  return json(await apiGet(`products/${product_id}`));
});

server.tool("get_product_pricing", "Get price details for a product", {
  product_id: z.string().describe("Product ID"),
}, async ({ product_id }) => {
  return json(await apiGet(`products/${product_id}/prices`));
});

// ── Bumps, Upsells, Downsells ──

server.tool("list_bumps", "List all bump offers across products", {}, async () => {
  return json(await apiGet("bumps"));
});

server.tool("get_bump", "Get details for a specific bump offer", {
  bump_id: z.string().describe("Bump ID"),
}, async ({ bump_id }) => {
  return json(await apiGet(`bumps/${bump_id}`));
});

server.tool("list_upsells", "List all upsell offers", {}, async () => {
  return json(await apiGet("upsells"));
});

server.tool("get_upsell", "Get details for a specific upsell", {
  upsell_id: z.string().describe("Upsell ID"),
}, async ({ upsell_id }) => {
  return json(await apiGet(`upsells/${upsell_id}`));
});

server.tool("list_downsells", "List all downsell offers", {}, async () => {
  return json(await apiGet("downsells"));
});

server.tool("get_downsell", "Get details for a specific downsell", {
  downsell_id: z.string().describe("Downsell ID"),
}, async ({ downsell_id }) => {
  return json(await apiGet(`downsells/${downsell_id}`));
});

// ── Transactions ──

server.tool(
  "get_transactions",
  "Get transactions with optional filtering. ThriveCart's product_id filter is unreliable — use item_name and date filters instead.",
  {
    date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    item_name: z.string().optional().describe("Filter by product name (case-insensitive contains match)"),
    status: z.string().optional().describe("Transaction status filter"),
    page: z.number().optional().describe("Page number (default 1)"),
    per_page: z.number().optional().describe("Results per page (default 25, max 100)"),
    fetch_all: z.boolean().optional().describe("Fetch ALL pages (ignores page/per_page). Use for complete data pulls."),
  },
  async ({ date_from, date_to, item_name, status, page, per_page, fetch_all }) => {
    const params = {};
    if (status) params.status = status;

    let transactions;
    if (fetch_all) {
      transactions = await getAllTransactions(params);
    } else {
      const data = await apiGet("transactions", { ...params, page: page || 1, perPage: per_page || 25 });
      transactions = data.transactions || data.data || [];
    }

    transactions = filterByDate(transactions, date_from, date_to);

    if (item_name) {
      const needle = item_name.toLowerCase();
      transactions = transactions.filter((t) => {
        const name = (t.item_name || t.product_name || "").toLowerCase();
        return name.includes(needle);
      });
    }

    return json({
      total_transactions: transactions.length,
      total_revenue: transactions.reduce((sum, t) => sum + parseFloat(t.amount || t.total || 0), 0),
      transactions,
    });
  }
);

server.tool(
  "get_revenue_summary",
  "Revenue summary grouped by product for a date range. Fetches all transactions and aggregates.",
  {
    date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
  },
  async ({ date_from, date_to }) => {
    let transactions = filterByDate(await getAllTransactions({}), date_from, date_to);

    const byProduct = {};
    for (const t of transactions) {
      const name = t.item_name || t.product_name || "Unknown";
      if (!byProduct[name]) byProduct[name] = { product: name, sales: 0, revenue: 0 };
      byProduct[name].sales++;
      byProduct[name].revenue += parseFloat(t.amount || t.total || 0);
    }

    const products = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue);
    return json({
      date_range: { from: date_from || "all time", to: date_to || "now" },
      total_sales: products.reduce((sum, p) => sum + p.sales, 0),
      total_revenue: Math.round(products.reduce((sum, p) => sum + p.revenue, 0) * 100) / 100,
      products,
    });
  }
);

// ── Customers ──

server.tool("get_customers", "Get customer list", {
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
}, async ({ page, per_page }) => {
  return json(await apiGet("customers", { page: page || 1, perPage: per_page || 25 }));
});

server.tool("get_customer", "Get detailed info for a specific customer", {
  email: z.string().describe("Customer email address"),
}, async ({ email }) => {
  return json(await apiPost("customer", { email }));
});

// ── Subscription Management ──

server.tool("cancel_subscription", "Cancel a customer's subscription", {
  order_id: z.string().describe("Order/subscription ID to cancel"),
}, async ({ order_id }) => {
  return json(await apiPost("cancel", { order_id }));
});

server.tool("pause_subscription", "Pause a customer's subscription", {
  order_id: z.string().describe("Order/subscription ID to pause"),
}, async ({ order_id }) => {
  return json(await apiPost("pause", { order_id }));
});

server.tool("resume_subscription", "Resume a paused subscription", {
  order_id: z.string().describe("Order/subscription ID to resume"),
}, async ({ order_id }) => {
  return json(await apiPost("resume", { order_id }));
});

server.tool("refund_transaction", "Refund a transaction", {
  order_id: z.string().describe("Order ID to refund"),
}, async ({ order_id }) => {
  return json(await apiPost("refund", { order_id }));
});

// ── Affiliates ──

server.tool("search_affiliates", "Search affiliates", {
  page: z.number().optional().describe("Page number"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
}, async ({ page, per_page }) => {
  return json(await apiGet("affiliates", { page: page || 1, perPage: per_page || 25 }));
});

server.tool("get_affiliate", "Get detailed info for a specific affiliate", {
  email: z.string().describe("Affiliate email address"),
}, async ({ email }) => {
  return json(await apiPost("affiliate", { email }));
});

server.tool("create_affiliate", "Create a new affiliate", {
  email: z.string().describe("Affiliate email"),
  first_name: z.string().optional().describe("First name"),
  last_name: z.string().optional().describe("Last name"),
}, async ({ email, first_name, last_name }) => {
  const body = { email };
  if (first_name) body.first_name = first_name;
  if (last_name) body.last_name = last_name;
  return json(await apiPost("affiliate/create", body));
});

const transport = new StdioServerTransport();
await server.connect(transport);
