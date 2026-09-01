/**
 * Customers.
 *
 * ThriveCart looks a customer up by email over POST rather than by id over GET,
 * which is unusual enough to be worth naming: there is no customer id to hold
 * onto, so email is the identity everywhere in this module.
 */

import { z } from "zod";
import { accountArg, clamp, defineTool, pageArgs, type AnyToolSpec } from "./kit.js";

const getCustomers = defineTool({
  name: "get_customers",
  title: "List customers",
  description:
    "List customers on a ThriveCart account, one page at a time. Use get_customer for one person's full history. This listing is for browsing and counting, and a page of it is not the whole customer base.",
  schema: { ...pageArgs, ...accountArg },
  risk: "read" as const,
  handler: async ({ page, per_page, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.get(target, "customers", {
      page: page ?? 1,
      perPage: clamp(per_page, 25),
    });
    return { account: target.name, page: page ?? 1, customers: data };
  },
});

const getCustomer = defineTool({
  name: "get_customer",
  title: "Get a customer",
  description:
    "Get one customer's full record by email address: their purchases, subscriptions and order ids. This is where an order_id comes from for pause_subscription, resume_subscription, cancel_subscription and refund_transaction. Email is the only way ThriveCart identifies a customer; there is no customer id.",
  schema: {
    email: z.string().describe("The customer's email address, exactly as they bought with."),
    ...accountArg,
  },
  risk: "read" as const,
  handler: async ({ email, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.post(target, "customer", { email });
    return { account: target.name, customer: data };
  },
});

export const customerTools: AnyToolSpec[] = [
  getCustomers,
  getCustomer,
] as unknown as AnyToolSpec[];
