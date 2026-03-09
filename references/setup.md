# ThriveCart MCP setup

ThriveCart is a checkout and sales platform for digital products.

This MCP server lets you pull sales data, look up customers, manage subscriptions, and check revenue directly from Claude Code, Claude Desktop, Cursor, Windsurf, or any MCP-compatible client.

Instead of logging into the ThriveCart dashboard, you can ask Claude "how much revenue did I make this month?" and get an instant answer.

- [ThriveCart](https://navid.me/go/thrivecart/)
- [ThriveCart API docs](https://developers.thrivecart.com)
- [ThriveCart API reference](https://apidocs.thrivecart.com)

## What you get

This repo contains two things:

1. **MCP server** (`index.mjs`) — connects your AI tools to ThriveCart's API
2. **Skill** (`SKILL.md` + `references/`) — teaches Claude how to use the server effectively (workflows, gotchas, tips)

You'll install the MCP server (step 2) and optionally install the skill (step 5) for the best experience.

## Prerequisites

- Node.js 18+ installed
- ThriveCart account (one-time purchase at [thrivecart.com](https://navid.me/go/thrivecart/))

## Step 1: Get your API key

1. Log in to your [ThriveCart dashboard](https://thrivecart.com/dashboard)
2. Go to **Settings > API & Webhooks**
3. Copy your API key

## Step 2: Install the MCP server

```bash
git clone https://github.com/thenavidm/thrivecart-mcp.git
cd thrivecart-mcp
npm install
```

## Step 3: Add to your client

Pick the client you use and add the config. Replace `/path/to/thrivecart-mcp` with the actual path where you cloned the repo.

### Claude Code

In `~/.claude.json` under `mcpServers`:

```json
"thrivecart": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-thrivecart-api-key>"
  }
}
```

### Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Under `mcpServers`:

```json
"thrivecart": {
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-thrivecart-api-key>"
  }
}
```

Note: Desktop config does NOT use a `type` field.

### Cursor

In `.cursor/mcp.json` or `~/.cursor/mcp.json`:

```json
"thrivecart": {
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-thrivecart-api-key>"
  }
}
```

### Windsurf

In `~/.codeium/windsurf/mcp_config.json`:

```json
"thrivecart": {
  "command": "node",
  "args": ["/path/to/thrivecart-mcp/index.mjs"],
  "env": {
    "THRIVECART_API_KEY": "<your-thrivecart-api-key>"
  }
}
```

### Other MCP clients

- **Command:** `node /path/to/thrivecart-mcp/index.mjs`
- **Environment:** `THRIVECART_API_KEY` with your API key
- **Transport:** stdio

## Step 4: Verify

Restart your client, then try:

```
list_products
```

If it returns your ThriveCart products, the MCP server is working.

## Step 5: Install the skill (recommended)

The skill teaches Claude the best way to use ThriveCart — workflows, parameter defaults, gotchas, and tips. Without it, the MCP tools still work, but Claude won't know things like "use `item_name` instead of `product_id` for filtering" or "always set `fetch_all: true` for revenue reports."

Copy the skill files from the repo into your skills directory:

**Claude Code:**

```bash
mkdir -p ~/.claude/skills/thrivecart/references
cp /path/to/thrivecart-mcp/SKILL.md ~/.claude/skills/thrivecart/
cp /path/to/thrivecart-mcp/references/* ~/.claude/skills/thrivecart/references/
```

**Claude Desktop:** Upload the `SKILL.md` file as a skill through the Desktop interface, or place it in your project's `.claude/skills/thrivecart/` directory.

The skill is optional but makes a big difference in how well Claude uses the tools.

## Troubleshooting

If the MCP server doesn't connect, check that Node.js 18+ is installed (`node --version`).

If you get authentication errors, double-check your API key in the ThriveCart dashboard under Settings > API & Webhooks. Make sure you copied the full key.

If tools return empty results, verify your ThriveCart account has products and transactions. A brand new account with no data will return empty arrays.

## Important notes

- **Base URL:** The API uses `https://thrivecart.com/api/external/` — NOT `api.thrivecart.com`
- The API key goes in the `THRIVECART_API_KEY` environment variable — the MCP server reads it automatically
- The MCP server handles all authentication via `Authorization: Bearer` header internally
