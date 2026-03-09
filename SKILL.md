---
name: thrivecart
description: |
  Manage ThriveCart products, transactions, customers, subscriptions, affiliates, and revenue analytics inside Claude Code and Claude Desktop using a custom MCP server. Use when the user says "ThriveCart", "sales", "transactions", "revenue", "refund", "subscription", "affiliate", "bump", "upsell", "downsell", "order", "customer purchases", or wants to look up sales data, manage subscriptions, check revenue, or work with affiliate programs. Also use when the user mentions product sales analytics, payment history, or e-commerce operations.
---

# ThriveCart

Manage ThriveCart products, transactions, customers, subscriptions, affiliates, and revenue analytics inside Claude Code and Claude Desktop using a custom MCP server.

**ThriveCart:** [thrivecart.com](https://navid.me/go/thrivecart/)
**Help docs:** [support.thrivecart.com](https://support.thrivecart.com)
**API docs:** [developers.thrivecart.com](https://developers.thrivecart.com)
**API reference:** [apidocs.thrivecart.com](https://apidocs.thrivecart.com)
**MCP server:** `~/.local/share/mcp-servers/thrivecart/`

## How it works

A custom MCP server wraps ThriveCart's REST API into 20 tools. Unlike Kit (which has a docs-only MCP + direct API calls), all ThriveCart operations go through the MCP tools directly — no need for curl.

The server handles authentication, pagination, and client-side filtering automatically.

## Authentication (already configured)

Auth is handled automatically. Do NOT ask the user for an API key. Just use the MCP tools directly.

**Base URL:** `https://thrivecart.com/api/external` (NOT `api.thrivecart.com`)

For setup instructions, see `references/setup.md`.

## MCP tools reference

### Products

| Tool | What it does | Parameters |
|------|-------------|------------|
| `list_products` | List all products in your account | None |
| `get_product` | Get details for a specific product | `product_id` |
| `get_product_pricing` | Get price details and pricing options | `product_id` |

### Bumps, upsells, downsells

These are add-on offers attached to products. A **bump** is shown on the checkout page itself. An **upsell** is offered after purchase. A **downsell** is offered if the customer declines the upsell.

| Tool | What it does | Parameters |
|------|-------------|------------|
| `list_bumps` | List all bump offers across products | None |
| `get_bump` | Get details for a specific bump | `bump_id` |
| `list_upsells` | List all upsell offers | None |
| `get_upsell` | Get details for a specific upsell | `upsell_id` |
| `list_downsells` | List all downsell offers | None |
| `get_downsell` | Get details for a specific downsell | `downsell_id` |

### Transactions

| Tool | What it does | Parameters |
|------|-------------|------------|
| `get_transactions` | Get transactions with filtering | `date_from`, `date_to`, `item_name`, `status`, `page`, `per_page`, `fetch_all` |
| `get_revenue_summary` | Revenue grouped by product for a date range | `date_from`, `date_to` |

#### Transaction filtering

ThriveCart's API `product_id` filter is unreliable. The MCP server works around this with client-side filtering:

- **`item_name`** — case-insensitive contains match against the product name. Use this instead of `product_id` to filter by product.
- **`date_from` / `date_to`** — date range filtering (YYYY-MM-DD format). Applied client-side after fetching.
- **`status`** — passed to the API directly.
- **`fetch_all`** — set to `true` to auto-paginate and fetch every transaction. Use for complete data pulls and revenue reports. Without this, you get one page of results.

#### Revenue summary

`get_revenue_summary` automatically fetches all transactions, groups them by product name, and returns totals. The response includes:

```json
{
  "date_range": { "from": "2026-01-01", "to": "2026-03-01" },
  "total_sales": 142,
  "total_revenue": 12450.00,
  "products": [
    { "product": "AI Creator OS", "sales": 89, "revenue": 8900.00 },
    { "product": "Prompt Library", "sales": 53, "revenue": 3550.00 }
  ]
}
```

### Customers

| Tool | What it does | Parameters |
|------|-------------|------------|
| `get_customers` | List customers (paginated) | `page`, `per_page` |
| `get_customer` | Get detailed info for a specific customer | `email` |

Customer lookup is by email address, not by ID.

### Subscription management

| Tool | What it does | Parameters |
|------|-------------|------------|
| `pause_subscription` | Pause an active subscription | `order_id` |
| `resume_subscription` | Resume a paused subscription | `order_id` |
| `cancel_subscription` | Cancel a subscription | `order_id` |
| `refund_transaction` | Refund a transaction | `order_id` |

All subscription tools require the `order_id`. To find it, look up the customer first with `get_customer` using their email, then get the order ID from their transaction history.

**Refunds are irreversible** — always confirm with the user before calling `refund_transaction`.

### Affiliates

| Tool | What it does | Parameters |
|------|-------------|------------|
| `search_affiliates` | List affiliates (paginated) | `page`, `per_page` |
| `get_affiliate` | Get detailed info for an affiliate | `email` |
| `create_affiliate` | Create a new affiliate | `email`, `first_name` (optional), `last_name` (optional) |

Affiliate lookup is by email. The `create_affiliate` tool is one of the few write operations available.

## Common workflows

### Check revenue for a period

```
get_revenue_summary
  date_from: "2026-01-01"
  date_to: "2026-03-01"
```

### Find all transactions for a specific product

```
get_transactions
  item_name: "AI Creator OS"
  fetch_all: true
```

### Look up a customer and manage their subscription

1. `get_customer` with their email
2. Find the `order_id` from their transaction data
3. Use `pause_subscription`, `resume_subscription`, or `cancel_subscription` with that order ID

### Check what add-ons exist for your products

```
list_bumps     → checkout page add-ons
list_upsells   → post-purchase offers
list_downsells → fallback offers when upsell is declined
```

## What the API can and can't do

### What you can do

- **Read** all product data (products, pricing, bumps, upsells, downsells)
- **Read** transaction history with filtering and aggregation
- **Read** customer and affiliate data
- **Manage subscriptions** (pause, resume, cancel)
- **Refund** transactions
- **Create** affiliates

### What you can't do

- **Create or edit products** — products, bumps, upsells, and downsells are created in the ThriveCart dashboard only
- **Create checkout pages or carts** — dashboard only
- **Modify pricing** — read-only via API
- **Create or send invoices** — not available
- **Access funnel analytics** — conversion rates, funnel steps, A/B test results are dashboard only
- **Manage coupons** — not exposed in the API
- **Bulk operations** — no batch endpoints
- **Webhook management** — configured in the dashboard

The API is primarily for reading sales data and managing existing subscriptions. All product creation and configuration happens in the ThriveCart dashboard.

## Integration with Kit

ThriveCart has a direct integration with Kit via API — you configure it inside ThriveCart's settings for each product. When a purchase completes, ThriveCart uses Kit's API to add the subscriber and apply tags like `[Sales] Purchased: <Product Name>`. The `thrivecart_affiliate_id` custom field in Kit tracks affiliate attribution.

You can cross-reference data: use ThriveCart tools for revenue/transaction details, and Kit tools for subscriber engagement on purchasers.

## Quick stats

A bundled script can fetch recent sales data:

```bash
python3 ~/navid-workspace/.claude/skills/thrivecart/scripts/tc_stats.py <api-key>
```

Returns charges, refunds, top products, and monthly revenue breakdown.

Returns charges, refunds, top products, and monthly revenue breakdown. The script counts both `charge` and `rebill` transaction types to match the dashboard's gross revenue figure.

## Important notes

- **Include `rebill` transactions** — payment plan installments use `transaction_type: "rebill"`, not `"charge"`. Count both for accurate revenue totals
- **Base URL is `thrivecart.com/api/external`** — NOT `api.thrivecart.com`
- **`product_id` filter is unreliable** — always use `item_name` for filtering transactions by product
- **Customer lookup is by email** — not by customer ID
- **Affiliate lookup is by email** — not by affiliate ID
- **`fetch_all` can be slow** — it paginates through every transaction (100 per page). For large accounts, use date filters to narrow the range
- **Refunds are irreversible** — always confirm before calling `refund_transaction`
- **Pagination** — `get_transactions`, `get_customers`, and `search_affiliates` support `page` and `per_page` (max 100)
- **No rate limit documented** — but avoid excessive `fetch_all` calls in quick succession

## Cost

| Component | Cost |
|-----------|------|
| ThriveCart Standard | $495 one-time ([lifetime deal](https://navid.me/go/thrivecart/)) |
| ThriveCart Pro+ (optional) | $295/year — adds affiliate management, sales tax calculation, custom domains, conditional checkout logic |
| MCP server | Free (custom, self-hosted) |
| API access | Included with ThriveCart account |

ThriveCart is a one-time purchase with no monthly fees. Pro+ is an annual add-on for advanced features like running your own affiliate program and automatic tax calculation.
