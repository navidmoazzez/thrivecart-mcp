# Versions

## 2.2.0

**A CLI, alongside the MCP server.** Every one of the 24 tools is now a shell command under the same name with dashes, generated from the same `ALL_TOOLS` array the server registers, through the same handlers and the same write guard. Nothing is described twice, so a tool added tomorrow is a command tomorrow.

```bash
thrivecart-cli                                   # every command, one line each
thrivecart-cli get-revenue-summary --date-from 2026-01-01
thrivecart-cli refund-transaction --order-id 9999 --confirm
thrivecart-cli schema get-transactions           # the JSON Schema an MCP client sees
```

`--json`, `--compact`, `--select a,b.c` and `--agent` shape the output. `thrivecart-cli <command> --help` derives its flags from the Zod schema, so help cannot drift from validation.

**Renamed to `@thenavidm/thrivecart-mcp-cli`**, on npm and on GitHub, because the package is no longer only an MCP server. `@thenavidm/thrivecart-mcp` is deprecated with a pointer to the new name.

**A Claude Desktop extension.** `desktop-extension/build.sh` produces a `.mcpb` that vendors its own dependencies, so it installs on a double click with nothing present first. It asks for the API token, a name for the cart, and whether to run read only or without refunds and cancellations.

**Four fixes to the CLI adapter.**

- Nothing configured exits **10**, not 4. The message names an API key, so matching auth first sent someone who had configured nothing hunting for a revoked credential. Config is tested first now, and only when there is no HTTP status, so a real 401 still exits 4.
- A refused write exits **2**, not 5. No `--confirm`, `THRIVECART_READ_ONLY=1`, or destructive writes switched off are all the caller getting the invocation wrong, not the API failing. Retrying unchanged was never going to work.
- An array of enums is a repeatable word, not JSON. `--status refunded` was rejected and you had to write `--status '"refunded"'`.
- `doctor` and `help` are reachable from `thrivecart-cli`. They were rejected as unknown commands, which sent someone diagnosing the CLI over to the server binary.

**`--select` no longer drops fields.** Two paths under one head overwrote each other, so `--select orders.id,orders.total` quietly returned only the total. Paths are grouped by their first segment before recursing. Silent data loss in a flag whose whole purpose is choosing what you keep, on a connector where the dropped field might be the amount.

**`--version` and `doctor` report the real version.** `VERSION` was a hardcoded constant that had drifted to 2.1.0 while `package.json` moved on. It is read from `package.json` now, and a test asserts they match.

**Two documentation claims were unsourced and are corrected.** This server said ThriveCart's `product_id` filter on transactions "is unreliable and silently returns rows for other products". ThriveCart documents no product filter on `/transactions` at all: the parameters are `page`, `perPage`, `query`, `transactionType` and `currency`. Filtering still happens here on `item_name`, for a better reason than the one previously given. The corrected wording is in the tool description, the `thrivecart://concepts` resource, and the README.

**A refund does not cancel a subscription**, which is ThriveCart's own documented behaviour and was nowhere in this server's descriptions. Refund a subscription payment and that subscription keeps billing. `refund_transaction` now says so, and so do the README and SKILL.md.

**The README carries the measured context cost.** A real `initialize` plus `tools/list` handshake against the built server, tokenised: **~5,100 tokens every turn** for all 24 tools, ~3,900 for the 19 that survive `THRIVECART_READ_ONLY=1`. 53% of that is the protocol serialising JSON Schema and nothing can write it away. The CLI costs nothing standing and about 280 tokens to list its commands.

Also: a publish workflow that fires on a tag, an exit-code table in the README with every row produced by running the binary against a server returning that status, and an environment variable reference split into credentials, safety, tuning and HTTP.

80 tests, up from 69.

## 2.1.0

**Six endpoints were wrong and are now fixed.** Every path in this server was inherited from the 1.x release and had never been checked against ThriveCart's own SDK. Verified against [thrivecart/php-api](https://github.com/thrivecart/php-api) `src/Api.php`:

| Tool | Was calling | Correct endpoint |
|---|---|---|
| `get_product_pricing` | `products/{id}/prices` | `products/{id}/pricing_options` |
| `cancel_subscription` | `cancel` | `cancelSubscription` |
| `pause_subscription` | `pause` | `pauseSubscription` |
| `resume_subscription` | `resume` | `resumeSubscription` |
| `create_affiliate` | `affiliate/create` | `POST /affiliates` |
| `whoami` | `account` | `ping` |

Every one of those returned an error before this release.

**`get_customers` is removed.** ThriveCart has no endpoint that lists customers. The tool called `/customers`, which does not exist. Use `get_transactions` to see many buyers at once.

**Rate limiting corrected.** ThriveCart documents 60 requests per minute per account. The client paced at 120ms, which is 500 per minute, so `get_revenue_summary` would rate limit almost immediately. The default is now 1000ms.

**Added:** `get_bump_pricing`, `get_upsell_pricing` and `get_downsell_pricing`, which ThriveCart exposes and this server did not.

24 tools, up from 22.

Documentation corrected throughout to match the API rather than assumption, including the exact key location (Settings, then API & webhooks, then API tokens) and a FAQ with no unverifiable claims in it.

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

**Renamed on npm.** The package became `@thenavidm/thrivecart-mcp` at this release, and `@thenavidm/thrivecart-mcp-cli` at 2.2.0. The unscoped `thrivecart-mcp` name was unpublished and cannot be reused.

## 1.0.0

Initial release. Single-file JavaScript server, 20 tools, one API key, AGPL-3.0.
