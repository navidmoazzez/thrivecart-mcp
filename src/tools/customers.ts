/**
 * Customers.
 *
 * ThriveCart has no customer listing endpoint. Verified against their PHP SDK
 * (thrivecart/php-api, src/Api.php): the only customer method is
 * `POST /customer`, which takes an email. There is no id and no way to page
 * through everyone, so a request like "list my customers" cannot be answered
 * from this API and get_transactions is the closest honest substitute.
 */

import { z } from "zod";
import { accountArg, defineTool, type AnyToolSpec } from "./kit.js";

const getCustomer = defineTool({
  name: "get_customer",
  title: "Get a customer",
  description:
    "Get one customer's full record by email address: their purchases, subscriptions and order ids. This is where an order_id comes from for pause_subscription, resume_subscription, cancel_subscription and refund_transaction. Email is the only way ThriveCart identifies a customer, and there is no endpoint that lists customers, so use get_transactions when you need to see many at once.",
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

export const customerTools: AnyToolSpec[] = [getCustomer] as unknown as AnyToolSpec[];
