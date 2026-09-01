# Versions

## 2.0.1

Documentation only. Removed em dashes throughout, numbered the FAQ section, and corrected the authorship line and its placement. No code or tool changes.

## 2.0.0

Complete rewrite in TypeScript. The 1.x server was a single `index.mjs` holding one API key.

**Several carts at once.** `THRIVECART_ACCOUNTS` takes a JSON array and every tool gained an `account` argument. ThriveCart licenses per account, so most people run more than one, and 1.x meant restarting the server to look at a different cart. Exact name beats prefix match, duplicate names are refused at load, and `doctor` catches two carts configured with the same key, which otherwise shows up as doubled revenue.

**Writes are guarded.** `cancel_subscription` and `refund_transaction` refuse without `confirm: true`, and the refusal names the order and what will happen. `THRIVECART_READ_ONLY=1` removes all five write tools from the list. `THRIVECART_AUDIT_LOG` records every attempted write. 1.x would refund on a single unguarded call.

**Money is exact.** Amounts are summed in integer cents. 1.x used `parseFloat` and accumulated floats, so totals drifted, and a row with an unreadable amount produced `NaN` that silently poisoned the whole figure.

**A page is no longer mistaken for a period.** `get_transactions` reports its `scope`, and walking every page stops at `THRIVECART_MAX_PAGES` with a truncation warning rather than returning partial figures as if complete.

**Errors say what to fix.** Typed errors that name the likely cause (wrong host, account password instead of an API key, a record belonging to another cart) instead of `ThriveCart API error 401`.

**New:** `list_accounts`, `whoami`, `doctor`, HTTP transport, three resources, three prompts, 44 tests, CI on Linux, macOS and Windows against Node 20 and 22, and a Dockerfile.

**Renamed on npm.** The package is now `@thenavidm/thrivecart-mcp`. The unscoped `thrivecart-mcp` name was unpublished and cannot be reused.

## 1.0.0

Initial release. Single-file JavaScript server, 20 tools, one API key, AGPL-3.0.
