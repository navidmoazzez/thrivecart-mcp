/**
 * Assembling the server.
 *
 * Tools, plus the two things most MCP servers skip and clients genuinely use:
 * resources, so a client can pull the context it needs without spending a tool
 * call, and prompts, so the workflows this server is good at are one click
 * rather than something the user has to know to ask for.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ThriveCartClient } from "./api/client.js";
import { loadConfig, type Config } from "./config.js";
import { WriteGuard } from "./safety.js";
import { ALL_TOOLS } from "./tools/index.js";
import { makeContext, register } from "./tools/kit.js";

export const VERSION = "2.1.0";

export const INSTRUCTIONS = `Tools for ThriveCart: products and their pricing, bumps, upsells and downsells, transactions and revenue, customers, subscriptions and affiliates.

5 things worth knowing before calling anything:

1. More than one cart can be configured, and they share nothing. Every tool takes an \`account\` argument; omit it to use the default. Call list_accounts when it is not obvious which cart a request means, and never present one cart's revenue as the whole business unless you have checked there is only one.

2. ThriveCart's own \`product_id\` filter on transactions is unreliable. It returns rows for other products, silently. Filter with \`item_name\` and a date range instead. get_transactions and get_revenue_summary already do.

3. get_transactions returns a single page unless you pass \`fetch_all\`. A page total is not a period total, and the result says which one you are looking at. get_revenue_summary always walks every page, which makes it the expensive call here, so give it a date range rather than asking for all time.

4. cancel_subscription ends a customer's access and refund_transaction moves real money. Neither can be undone from here, so both refuse to run without \`confirm: true\`. Pass it when the person you are working for has actually asked for that action, not to get past the refusal. pause_subscription is reversible with resume_subscription and needs no confirmation, so prefer pausing whenever the customer might come back.

5. Order ids come from get_customer or get_transactions. Customers and affiliates are identified by email; there are no ids for them.

Start with list_accounts to see which carts are configured, get_revenue_summary for how a cart is doing, or list_products for what it sells.`;

export type BuiltServer = {
  server: McpServer;
  client: ThriveCartClient;
  config: Config;
  toolCount: number;
};

export function buildServer(config: Config = loadConfig()): BuiltServer {
  const client = new ThriveCartClient(config);
  const guard = new WriteGuard(config);
  const ctx = makeContext(client, config, guard);

  const server = new McpServer(
    { name: "thrivecart", version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  // A read-only server should not advertise writes it will refuse.
  const tools = ALL_TOOLS.filter((tool) => !guard.readOnly || tool.risk === "read");
  for (const tool of tools) {
    register(server, () => ctx, tool);
  }

  registerResources(server, config);
  registerPrompts(server);

  return { server, client, config, toolCount: tools.length };
}

/**
 * Resources: the context a model needs about ThriveCart itself.
 *
 * The configured carts are here so a client can see what is available without
 * spending a tool call, and the concepts document exists because ThriveCart's
 * vocabulary (bump versus upsell, order versus transaction) is where a model
 * otherwise guesses and gets it subtly wrong.
 */
function registerResources(server: McpServer, config: Config): void {
  server.resource("thrivecart-accounts", "thrivecart://accounts", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            count: config.accounts.length,
            accounts: config.accounts.map((a) => ({ name: a.name, base_url: a.baseUrl })),
            read_only: config.readOnly,
          },
          null,
          2,
        ),
      },
    ],
  }));

  server.resource("thrivecart-concepts", "thrivecart://concepts", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: `# ThriveCart, for an agent

## Accounts are islands
ThriveCart licenses per account, so one person often runs several. Products, customers, affiliates
and revenue are entirely separate per account. Nothing joins across them, and adding two carts'
revenue together is a decision, not a default.

## The API host
The external API is \`https://thrivecart.com/api/external\`. **Not** \`api.thrivecart.com\`, which
exists, resolves, and refuses everything, so getting it wrong looks exactly like a bad key.
Auth is a bearer API key from Settings > API & Webhooks.

## Products and prices
A **product** is the thing sold. Its **prices** are a separate record, because one product can carry
several price points at once: one-time, split pay, subscription. The headline price is not
necessarily what a given customer paid.

## The three add-on types
- **Bump.** A checkbox on the checkout page itself, before payment.
- **Upsell.** An offer shown after the main purchase completes.
- **Downsell.** The fallback shown when an upsell is declined.

They are separate record types. An "upsell" in casual speech is often a bump.

## Transactions
A transaction is one payment event, so a split-pay product produces several. Field names are not
consistent across endpoints or account vintages: an amount arrives as \`amount\` or \`total\`, a date
as \`date\` or \`created_at\`, a product name as \`item_name\` or \`product_name\`. These tools normalise
all of that and sum money in integer cents, so totals are exact.

## The product_id filter is broken
ThriveCart's \`product_id\` query parameter on transactions returns rows for other products. It fails
silently, which is worse than failing loudly. Filter on \`item_name\` instead.

## Identity
Customers and affiliates have **no id**. Email is the identity, and lookups are POST, not GET.
Orders and subscriptions do have ids, and those come from get_customer or get_transactions.

## What cannot be undone
Cancelling a subscription ends access; the customer must buy again. A refund moves real money and
there is no reverse. Pausing is the reversible option and usually the right one.`,
      },
    ],
  }));
}

/** Prompts: the workflows worth having one click away. */
function registerPrompts(server: McpServer): void {
  server.prompt("revenue-report", "Report revenue for a period, across every cart", () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Give me a revenue report. Ask me for the period if I have not named one.

1. list_accounts first. If more than one cart is configured, run the rest per cart and keep the figures separate.
2. get_revenue_summary for the period, per account.
3. Compare against the previous period of the same length.

Report: total revenue and sales per cart, the products driving it, what moved versus last period, and anything that looks like an anomaly rather than a trend. Give exact figures, and say plainly if a cart returned a truncation warning, because that means the totals are incomplete. Do not add carts together unless I ask.`,
        },
      },
    ],
  }));

  server.prompt("customer-lookup", "Find a customer and explain their history", () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Look up a customer for me. Ask for their email if I have not given it.

1. list_accounts. If several carts are configured, check each one, because a customer may exist on only one, and "not found" on the first cart does not mean they are not a customer.
2. get_customer on each.

Tell me: what they bought and when, what they are paying now, whether any subscription is active, paused or cancelled, and the order ids. Do not pause, cancel or refund anything. If I ask you to, show me the amount first and wait for me to confirm.`,
        },
      },
    ],
  }));

  server.prompt("product-performance", "Work out which products actually carry the cart", () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Tell me which products actually carry this cart. Ask which account if several are configured.

1. list_products, then list_bumps, list_upsells and list_downsells so you know the full offer surface.
2. get_revenue_summary over the last 12 months.

Then tell me: the products earning most, the ones earning almost nothing, and how much of the total comes from bumps and upsells rather than the main products. Rank by revenue, not by sales count. A cheap product with many sales and an expensive one with few are different businesses. Quote exact figures and say when the sample is too small to support a claim instead of making one.`,
        },
      },
    ],
  }));
}
