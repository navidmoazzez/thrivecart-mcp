/** Every tool, in the order they appear in the README. */

import type { AnyToolSpec } from "./kit.js";

import { accountTools } from "./accounts.js";
import { productTools } from "./products.js";
import { offerTools } from "./catalog.js";
import { transactionTools } from "./transactions.js";
import { customerTools } from "./customers.js";
import { subscriptionTools } from "./subscriptions.js";
import { affiliateTools } from "./affiliates.js";

export const ALL_TOOLS: AnyToolSpec[] = [
  ...accountTools,
  ...productTools,
  ...offerTools,
  ...transactionTools,
  ...customerTools,
  ...subscriptionTools,
  ...affiliateTools,
];
