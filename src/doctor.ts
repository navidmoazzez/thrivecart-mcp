/**
 * `thrivecart-mcp doctor`. Say what is wrong, in the order it will break.
 *
 * The failures people actually hit here are dull and specific: pointing at
 * api.thrivecart.com instead of thrivecart.com, pasting an account password
 * where an API key belongs, or configuring a second cart with a key that turns
 * out to be the first cart's. All three surface as an unexplained 401 or an
 * empty product list, so each check below reports the fix rather than the
 * status code, and every configured cart is checked separately.
 */

import { ThriveCartClient } from "./api/client.js";
import { loadConfig } from "./config.js";
import { ThriveCartError } from "./api/errors.js";
import { VERSION } from "./server.js";

type Check = { ok: boolean; label: string; detail?: string };

function line(check: Check): string {
  return `${check.ok ? "  ok  " : " FAIL "} ${check.label}${check.detail ? `\n       ${check.detail}` : ""}`;
}

export async function runDoctor(): Promise<number> {
  const config = loadConfig();
  const client = new ThriveCartClient(config);
  const checks: Check[] = [];

  process.stdout.write(`thrivecart-mcp ${VERSION}\n\n`);

  if (config.accounts.length === 0) {
    process.stdout.write(
      line({
        ok: false,
        label: "no account configured",
        detail:
          "Set THRIVECART_API_KEY to an API key from ThriveCart Settings > API & Webhooks, or THRIVECART_ACCOUNTS to a JSON array for several carts. Nothing in this server works without one.",
      }) + "\n",
    );
    return 1;
  }

  checks.push({
    ok: true,
    label: `${config.accounts.length} account${config.accounts.length === 1 ? "" : "s"} configured: ${config.accounts.map((a) => a.name).join(", ")}`,
  });

  // The wrong host is the single most common setup error, and it fails in a way
  // that looks exactly like a bad key, so name it before testing credentials.
  for (const account of config.accounts) {
    if (!account.baseUrl.startsWith("https://thrivecart.com")) {
      checks.push({
        ok: false,
        label: `${account.name}: unexpected base URL ${account.baseUrl}`,
        detail:
          "ThriveCart's external API lives at https://thrivecart.com/api/external. The api.thrivecart.com host resolves but refuses everything, which looks like a bad key.",
      });
    }
  }

  // Each cart is checked on its own. A key that works for one says nothing
  // about another, and a second cart configured with the first cart's key is a
  // real mistake that otherwise shows up as duplicated revenue.
  const seenAccounts = new Map<string, string>();

  for (const account of config.accounts) {
    try {
      // `ping` is the endpoint that identifies a key, and it is the one
      // `whoami` uses. This called `account`, which ThriveCart answers 501 to,
      // so a perfectly good key was reported as "check failed".
      const data = (await client.get(account, "ping")) as Record<string, unknown>;
      // `account_id` is what decides whether two configured carts are really
      // one, because it is the only field guaranteed unique per cart. The name
      // is only for the human reading the line.
      const str = (v: unknown): string => (typeof v === "string" && v ? v : "");
      const identity = str(data.account_id);
      const label =
        [str(data.account_name), identity && `#${identity}`].filter(Boolean).join(" ") ||
        str(data.user_username) ||
        identity;

      checks.push({
        ok: true,
        label: `${account.name}: key valid${label ? ` (${label})` : ""}`,
      });

      if (identity) {
        const clash = seenAccounts.get(identity);
        if (clash) {
          checks.push({
            ok: false,
            label: `${account.name} and ${clash} are the same cart`,
            detail: `Both keys resolve to ThriveCart account ${identity}. One of them is wrong, and leaving it will double-count revenue when both are queried.`,
          });
        } else {
          seenAccounts.set(identity, account.name);
        }
      }
    } catch (error) {
      const e = error as ThriveCartError;
      checks.push({
        ok: false,
        label: `${account.name}: ${e.status === 401 || e.status === 403 ? "key rejected" : "check failed"}`,
        detail: e.message,
      });
      continue;
    }

    // A valid key that reads nothing is a permissions problem, not a auth one.
    try {
      const products = await client.get(account, "products");
      const count = Array.isArray(products)
        ? products.length
        : Array.isArray((products as Record<string, unknown>)?.products)
          ? ((products as Record<string, unknown>).products as unknown[]).length
          : undefined;
      checks.push({
        ok: true,
        label: `${account.name}: products readable${count === undefined ? "" : ` (${count})`}`,
      });
    } catch (error) {
      checks.push({
        ok: false,
        label: `${account.name}: cannot read products`,
        detail: (error as Error).message,
      });
    }
  }

  if (config.readOnly) {
    checks.push({
      ok: true,
      label: "read-only mode: every write is hidden from the tool list",
    });
  } else if (!config.allowDestructive) {
    checks.push({
      ok: true,
      label: "destructive tools disabled: cancel_subscription and refund_transaction will refuse",
    });
  }

  if (config.auditPath) {
    checks.push({ ok: true, label: `audit log: ${config.auditPath}` });
  }

  process.stdout.write(checks.map(line).join("\n") + "\n");
  return checks.every((c) => c.ok) ? 0 : 1;
}
