/**
 * Products and their pricing.
 *
 * A ThriveCart product is the thing being sold; its prices are a separate
 * record because one product can carry several price points (one-time, split
 * pay, subscription) and they change independently of the product itself.
 */

import { z } from "zod";
import { accountArg, defineTool, type AnyToolSpec } from "./kit.js";

const listProducts = defineTool({
  name: "list_products",
  title: "List products",
  description:
    "List every product on a ThriveCart account, with ids and names. Start here when you need a product id for another tool, or to see what a cart actually sells.",
  schema: { ...accountArg },
  risk: "read" as const,
  handler: async ({ account }, ctx) =>
    ctx.client.get(ctx.account(account), "products"),
});

const getProduct = defineTool({
  name: "get_product",
  title: "Get a product",
  description:
    "Get the full details of one product by id. Use list_products first if you do not have the id.",
  schema: {
    product_id: z.string().describe("Product id, from list_products."),
    ...accountArg,
  },
  risk: "read" as const,
  handler: async ({ product_id, account }, ctx) =>
    ctx.client.get(ctx.account(account), `products/${encodeURIComponent(product_id)}`),
});

const getProductPricing = defineTool({
  name: "get_product_pricing",
  title: "Get product pricing",
  description:
    "Get every price point configured on a product: one-time, split pay and subscription. A product's headline price is not the only thing customers can pay, so read this before quoting what something costs.",
  schema: {
    product_id: z.string().describe("Product id, from list_products."),
    ...accountArg,
  },
  risk: "read" as const,
  handler: async ({ product_id, account }, ctx) =>
    ctx.client.get(ctx.account(account), `products/${encodeURIComponent(product_id)}/prices`),
});

export const productTools: AnyToolSpec[] = [
  listProducts,
  getProduct,
  getProductPricing,
] as unknown as AnyToolSpec[];
