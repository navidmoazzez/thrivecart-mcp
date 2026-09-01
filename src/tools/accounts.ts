/**
 * Which carts are configured, and who each one belongs to.
 *
 * With several carts connected, the first question a model should ask is which
 * one a request means. list_accounts answers it without spending a network
 * call; whoami confirms the key actually reaches the cart the name claims.
 */

import { accountArg, defineTool, type AnyToolSpec } from "./kit.js";

const listAccounts = defineTool({
  name: "list_accounts",
  title: "List accounts",
  description:
    "List every ThriveCart account configured on this server. Use a returned name as the `account` argument on any other tool to choose which cart it reads or acts on. Costs no network call. Call this first whenever a request could plausibly mean more than one cart — revenue, customers and affiliates are entirely separate per cart, and a figure from one never includes another.",
  schema: {},
  risk: "read" as const,
  handler: async (_args, ctx) => {
    const preferred = ctx.config.preferred;
    const names = ctx.config.accounts.map((a) => a.name);
    // The default is whatever selectAccount would pick, rather than "the first
    // one", so this cannot disagree with what the tools actually do.
    const fallback =
      preferred
        .map((want) => names.find((n) => n === want) ?? names.find((n) => n.startsWith(want)))
        .find(Boolean) ?? names[0];

    return {
      count: ctx.config.accounts.length,
      accounts: ctx.config.accounts.map((a) => ({
        name: a.name,
        base_url: a.baseUrl,
      })),
      default: fallback ?? null,
      read_only: ctx.config.readOnly,
    };
  },
});

const whoami = defineTool({
  name: "whoami",
  title: "Show the connected cart",
  description:
    "Fetch the ThriveCart account this key belongs to — the owner email and account details. Use it to confirm a configured name actually points at the cart you think it does before reporting money against it, and to check a key still works.",
  schema: { ...accountArg },
  risk: "read" as const,
  handler: async ({ account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.get(target, "account");
    return { account: target.name, details: data };
  },
});

export const accountTools: AnyToolSpec[] = [listAccounts, whoami] as unknown as AnyToolSpec[];

// Referenced so the zod import is not flagged when this module gains a
// schema-carrying tool; kept explicit rather than removed and re-added.
export type { z };
