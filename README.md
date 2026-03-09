# ThriveCart MCP

MCP server for [ThriveCart](https://navid.me/go/thrivecart/), the checkout and sales platform. Manage products, transactions, customers, subscriptions, affiliates, and revenue analytics. Works with Claude Code, Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## What you can do

- List products with pricing, bumps, upsells, and downsells
- Pull transaction history with date and product filtering
- Generate revenue summaries grouped by product
- Look up customer details and purchase history by email
- Pause, resume, and cancel subscriptions
- Issue refunds on transactions
- Search and create affiliates

## What you get

This repo contains two things:

1. **MCP server** (`index.mjs`) — connects your AI tools to ThriveCart's API
2. **Skill** (`SKILL.md` + `references/`) — teaches Claude how to use the server effectively (workflows, gotchas, tips)

## Prerequisites

- A [ThriveCart](https://navid.me/go/thrivecart/) account
- Node.js 18+
- Your API key (from ThriveCart Settings > API & Webhooks)

## Authentication

ThriveCart uses API key authentication. Get your key from **Settings > API & Webhooks** in the ThriveCart dashboard.

**Base URL:** `https://thrivecart.com/api/external` (NOT `api.thrivecart.com`)

## Installation

```bash
git clone https://github.com/thenavidm/thrivecart-mcp.git
cd thrivecart-mcp
npm install
```

## Configuration

Replace `/path/to/thrivecart-mcp` with the actual path where you cloned the repo.

### Claude Code

Add to `~/.claude.json` under `mcpServers`:

```json
"thrivecart": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-api-key>"
  }
}
```

### Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
"thrivecart": {
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-api-key>"
  }
}
```

### Cursor

Add to `.cursor/mcp.json` or `~/.cursor/mcp.json`:

```json
"thrivecart": {
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-api-key>"
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
"thrivecart": {
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-api-key>"
  }
}
```

### Other MCP clients

- **Command:** `node /path/to/thrivecart-mcp/index.mjs`
- **Environment:** `THRIVECART_API_KEY` with your API key
- **Transport:** stdio

## Installing the skill (recommended)

The repo includes a `SKILL.md` file and `references/` folder that teach Claude the best way to use ThriveCart. Copy them into your skills directory:

```bash
mkdir -p ~/.claude/skills/thrivecart/references
cp /path/to/thrivecart-mcp/SKILL.md ~/.claude/skills/thrivecart/
cp /path/to/thrivecart-mcp/references/* ~/.claude/skills/thrivecart/references/
```

For Claude Desktop, upload the skill through the Desktop interface.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `THRIVECART_API_KEY` | Yes | API key from Settings > API & Webhooks |

## Tools

### Products

| Tool | Description |
|------|-------------|
| `list_products` | List all products in your account |
| `get_product` | Get details for a specific product |
| `get_product_pricing` | Get price details and pricing options |

### Bumps, upsells, downsells

| Tool | Description |
|------|-------------|
| `list_bumps` | List all bump offers (checkout page add-ons) |
| `get_bump` | Get details for a specific bump |
| `list_upsells` | List all upsell offers (post-purchase) |
| `get_upsell` | Get details for a specific upsell |
| `list_downsells` | List all downsell offers (fallback if upsell declined) |
| `get_downsell` | Get details for a specific downsell |

### Transactions

| Tool | Description |
|------|-------------|
| `get_transactions` | Get transactions with date, product, and status filtering |
| `get_revenue_summary` | Revenue grouped by product for a date range |

### Customers

| Tool | Description |
|------|-------------|
| `get_customers` | List customers (paginated) |
| `get_customer` | Get customer details by email |

### Subscriptions

| Tool | Description |
|------|-------------|
| `pause_subscription` | Pause an active subscription |
| `resume_subscription` | Resume a paused subscription |
| `cancel_subscription` | Cancel a subscription |
| `refund_transaction` | Refund a transaction (irreversible) |

### Affiliates

| Tool | Description |
|------|-------------|
| `search_affiliates` | List affiliates (paginated) |
| `get_affiliate` | Get affiliate details by email |
| `create_affiliate` | Create a new affiliate |

## Key concepts

**Transaction filtering** uses client-side `item_name` matching because ThriveCart's `product_id` filter is unreliable. Use `fetch_all: true` with date ranges for complete data pulls.

**Customer and affiliate lookup** is by email, not by ID.

**Refunds are irreversible.** Always confirm before calling `refund_transaction`.

## Rate limits

Not publicly documented. Avoid excessive `fetch_all` calls in quick succession.

## Claude skill

A Claude skill is available for this MCP server. Skills teach Claude how to use the tools effectively with workflows, key concepts, and best practices specific to ThriveCart.

Get the skill from the [claude-skills](https://github.com/thenavidm/claude-skills) repo. Copy the skill folder into your project:

```
.claude/skills/thrivecart/
  SKILL.md
  references/
```

Claude will automatically pick up the skill and use it when working with ThriveCart.

## License

AGPL-3.0 - Copyright (C) 2026 [Navid Moazzez](https://navid.me) | [CreatorSchool.ai](https://creatorschool.ai)
