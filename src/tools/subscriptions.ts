/**
 * Subscriptions and refunds.
 *
 * These four tools are the only ones in this server that change anything at a
 * cart, and they split cleanly by whether the change can be walked back.
 *
 * Pausing and resuming are the same lever in two directions, so neither is
 * gated. Cancelling ends a customer's access and the only route back is asking
 * them to buy again; refunding moves real money and there is no un-refund. Both
 * of those are marked destructive, which means they refuse to run without
 * `confirm: true` and are hidden entirely under THRIVECART_READ_ONLY=1.
 *
 * Every order_id here comes from get_customer.
 */

import { z } from "zod";
import { accountArg, confirmArg, defineTool, type AnyToolSpec } from "./kit.js";

const orderIdArg = {
  order_id: z
    .string()
    .describe("The order or subscription id, from get_customer or get_transactions."),
};

const pauseSubscription = defineTool({
  name: "pause_subscription",
  title: "Pause a subscription",
  description:
    "Pause a customer's subscription, stopping future billing while keeping the subscription itself. Reversible with resume_subscription, which is why this needs no confirmation. Prefer this over cancel_subscription whenever the customer might come back.",
  schema: { ...orderIdArg, ...accountArg },
  risk: "write" as const,
  idempotent: true,
  summary: ({ order_id, account }) =>
    `pause subscription ${order_id}${account ? ` on ${account}` : ""}`,
  handler: async ({ order_id, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.post(target, "pauseSubscription", { order_id });
    return { account: target.name, order_id, action: "paused", result: data };
  },
});

const resumeSubscription = defineTool({
  name: "resume_subscription",
  title: "Resume a subscription",
  description:
    "Resume a paused subscription, restarting billing. The counterpart to pause_subscription. This cannot revive a cancelled subscription. Once cancelled, the customer has to buy again.",
  schema: { ...orderIdArg, ...accountArg },
  risk: "write" as const,
  idempotent: true,
  summary: ({ order_id, account }) =>
    `resume subscription ${order_id}${account ? ` on ${account}` : ""}`,
  handler: async ({ order_id, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.post(target, "resumeSubscription", { order_id });
    return { account: target.name, order_id, action: "resumed", result: data };
  },
});

const cancelSubscription = defineTool({
  name: "cancel_subscription",
  title: "Cancel a subscription",
  description:
    "Cancel a customer's subscription permanently. This ends their access and cannot be undone from here. The only way back is for them to purchase again, so pause_subscription is the right tool whenever the customer might return. Refuses to run without confirm: true. Set that only when the person you are working for has actually asked for this cancellation, not to clear the refusal.",
  schema: { ...orderIdArg, ...confirmArg, ...accountArg },
  risk: "destructive" as const,
  summary: ({ order_id, account }) =>
    `CANCEL subscription ${order_id}${account ? ` on ${account}` : ""}, ending the customer's access permanently`,
  handler: async ({ order_id, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.post(target, "cancelSubscription", { order_id });
    return { account: target.name, order_id, action: "cancelled", result: data };
  },
});

const refundTransaction = defineTool({
  name: "refund_transaction",
  title: "Refund a transaction",
  description:
    "Refund a transaction, returning the money to the customer. This moves real funds and cannot be undone. Refuses to run without confirm: true. Check the amount with get_transactions or get_customer before calling, because the order id alone does not tell you how much is about to move.",
  schema: { ...orderIdArg, ...confirmArg, ...accountArg },
  risk: "destructive" as const,
  summary: ({ order_id, account }) =>
    `REFUND transaction ${order_id}${account ? ` on ${account}` : ""}, moving real money back to the customer`,
  handler: async ({ order_id, account }, ctx) => {
    const target = ctx.account(account);
    const data = await ctx.client.post(target, "refund", { order_id });
    return { account: target.name, order_id, action: "refunded", result: data };
  },
});

export const subscriptionTools: AnyToolSpec[] = [
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  refundTransaction,
] as unknown as AnyToolSpec[];
