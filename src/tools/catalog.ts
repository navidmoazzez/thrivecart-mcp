/**
 * Bumps, upsells and downsells.
 *
 * These are the three ways ThriveCart adds revenue to a cart after the main
 * product is chosen: a bump is a checkbox on the checkout page, an upsell is
 * the offer after the purchase, and a downsell is what runs when the upsell is
 * declined. They are separate record types with the same shape, so they get one
 * module and a shared factory rather than six near-identical definitions.
 */

import { z } from "zod";
import { accountArg, defineTool, type AnyToolSpec } from "./kit.js";

type OfferKind = {
  /** Endpoint segment and plural noun, e.g. "bumps". */
  endpoint: "bumps" | "upsells" | "downsells";
  /** Singular, for the id argument and tool names. */
  singular: "bump" | "upsell" | "downsell";
  what: string;
};

const KINDS: OfferKind[] = [
  {
    endpoint: "bumps",
    singular: "bump",
    what: "a bump offer, the checkbox add-on shown on the checkout page itself",
  },
  {
    endpoint: "upsells",
    singular: "upsell",
    what: "an upsell, the offer shown after the main purchase completes",
  },
  {
    endpoint: "downsells",
    singular: "downsell",
    what: "a downsell, the fallback offer shown when an upsell is declined",
  },
];

function listTool(kind: OfferKind) {
  return defineTool({
    name: `list_${kind.endpoint}`,
    title: `List ${kind.endpoint}`,
    description: `List every ${kind.singular} across all products on a ThriveCart account. Each is ${kind.what}. Use this to see what a cart offers beyond its main products, and to get an id for get_${kind.singular}.`,
    schema: { ...accountArg },
    risk: "read" as const,
    handler: async ({ account }: { account?: string }, ctx) =>
      ctx.client.get(ctx.account(account), kind.endpoint),
  });
}

function getTool(kind: OfferKind) {
  return defineTool({
    name: `get_${kind.singular}`,
    title: `Get a ${kind.singular}`,
    description: `Get the full details of one ${kind.singular} by id, including what it offers and at what price. Use list_${kind.endpoint} first if you do not have the id.`,
    schema: {
      [`${kind.singular}_id`]: z
        .string()
        .describe(`${kind.singular} id, from list_${kind.endpoint}.`),
      ...accountArg,
    },
    risk: "read" as const,
    handler: async (args: Record<string, string | undefined>, ctx) => {
      const id = args[`${kind.singular}_id`];
      if (!id) throw new Error(`${kind.singular}_id is required.`);
      return ctx.client.get(
        ctx.account(args.account),
        `${kind.endpoint}/${encodeURIComponent(id)}`,
      );
    },
  });
}

function pricingTool(kind: OfferKind) {
  return defineTool({
    name: `get_${kind.singular}_pricing`,
    title: `Get ${kind.singular} pricing`,
    description: `Get every price point configured on one ${kind.singular}. Its headline price is not necessarily what a buyer paid, so read this before quoting what it costs.`,
    schema: {
      [`${kind.singular}_id`]: z
        .string()
        .describe(`${kind.singular} id, from list_${kind.endpoint}.`),
      ...accountArg,
    },
    risk: "read" as const,
    handler: async (args: Record<string, string | undefined>, ctx) => {
      const id = args[`${kind.singular}_id`];
      if (!id) throw new Error(`${kind.singular}_id is required.`);
      return ctx.client.get(
        ctx.account(args.account),
        `${kind.endpoint}/${encodeURIComponent(id)}/pricing_options`,
      );
    },
  });
}

export const offerTools: AnyToolSpec[] = KINDS.flatMap((kind) => [
  listTool(kind),
  getTool(kind),
  pricingTool(kind),
]) as unknown as AnyToolSpec[];
