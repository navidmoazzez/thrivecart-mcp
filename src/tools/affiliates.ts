/**
 * Affiliates.
 *
 * Like customers, ThriveCart identifies an affiliate by email over POST rather
 * than by id over GET. Creating one is a write but a harmless one: an affiliate
 * who never promotes anything costs nothing and can be ignored, so it is not
 * gated behind a confirmation.
 */

import { z } from "zod";
import { accountArg, clamp, defineTool, pageArgs, type AnyToolSpec } from "./kit.js";

const searchAffiliates = defineTool({
  name: "search_affiliates",
  title: "List affiliates",
  description:
    "List affiliates on a ThriveCart account, one page at a time. Use get_affiliate for one affiliate's full stats. This listing is for browsing and counting.",
  schema: { ...pageArgs, ...accountArg },
  risk: "read" as const,
  handler: async ({ page, per_page, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.get(target, "affiliates", {
      page: page ?? 1,
      perPage: clamp(per_page, 25),
    });
    return { account: target.name, page: page ?? 1, affiliates: data };
  },
});

const getAffiliate = defineTool({
  name: "get_affiliate",
  title: "Get an affiliate",
  description:
    "Get one affiliate's full record by email: their referrals, commissions and payout details. Email is the only way ThriveCart identifies an affiliate.",
  schema: {
    email: z.string().describe("The affiliate's email address."),
    ...accountArg,
  },
  risk: "read" as const,
  handler: async ({ email, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.post(target, "affiliate", { email });
    return { account: target.name, affiliate: data };
  },
});

const createAffiliate = defineTool({
  name: "create_affiliate",
  title: "Create an affiliate",
  description:
    "Register a new affiliate on a ThriveCart account. Check with get_affiliate first, because creating one that already exists is not a no-op and ThriveCart may reject it or duplicate the record.",
  schema: {
    email: z.string().describe("The affiliate's email address. This becomes their identity."),
    first_name: z.string().optional().describe("First name."),
    last_name: z.string().optional().describe("Last name."),
    ...accountArg,
  },
  risk: "write" as const,
  summary: ({ email, account }) => `create affiliate ${email}${account ? ` on ${account}` : ""}`,
  handler: async ({ email, first_name, last_name, account }, ctx) => {
    const target = ctx.account(account);
    const body: Record<string, unknown> = { email };
    if (first_name) body.first_name = first_name;
    if (last_name) body.last_name = last_name;
    const data = await ctx.client.post(target, "affiliates", body);
    return { account: target.name, email, action: "created", result: data };
  },
});

export const affiliateTools: AnyToolSpec[] = [
  searchAffiliates,
  getAffiliate,
  createAffiliate,
] as unknown as AnyToolSpec[];
