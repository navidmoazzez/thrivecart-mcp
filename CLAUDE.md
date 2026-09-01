# thrivecart-mcp, for agents working on this repo

TypeScript, ESM, Node >= 20. Published to npm as `@thenavidm/thrivecart-mcp`. Source on GitHub at `navidmoazzez/thrivecart-mcp`. The npm scope and the GitHub owner differ; that is correct, not a typo.

## Before changing anything

```bash
npm run typecheck && npm test && npm run build
```

Then prove the server actually starts, which the build does not tell you:

```bash
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"x","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | THRIVECART_API_KEY=x node dist/index.js
```

22 tools. If that number changes, update it in `README.md`, `package.json` description, and `.github/workflows/ci.yml`, which asserts it.

## Layout

| Path | Holds |
|---|---|
| `src/config.ts` | Credentials and the multi-account model |
| `src/safety.ts` | Whether a write is allowed to happen |
| `src/api/` | HTTP client and typed errors |
| `src/format/` | Normalising ThriveCart's inconsistent fields |
| `src/tools/` | One module per group; `kit.ts` is the shared plumbing |
| `src/transport/http.ts` | The `--http` server |

A new tool goes in the matching `src/tools/` module via `defineTool`, then into `ALL_TOOLS`. `kit.ts` handles annotations, guarding and error shaping, so do not hand-roll those.

## Things that are decided

- **Base URL is `thrivecart.com/api/external`.** Never `api.thrivecart.com`, which resolves and refuses everything.
- **Never filter transactions by `product_id`.** ThriveCart's filter returns other products' rows, silently. Filter on `item_name`.
- **Money is integer cents.** Never accumulate floats. `src/format/transactions.ts` owns this.
- **Field names vary.** `amount`/`total`, `date`/`created_at`, `item_name`/`product_name`. Read them through `format/transactions.ts`, never inline.
- **Only `cancel_subscription` and `refund_transaction` are `destructive`.** Pausing is reversible. Do not add `confirm` to reversible tools; it trains the reflex the guard exists to prevent.
- **Errors are returned, not thrown.** A thrown MCP error reaches the model as a protocol failure with no structure.

## House rules

MIT, `Copyright (c) 2026 Navid Moazzez`. No AI attribution in commits, no `Co-Authored-By` trailers, no CONTRIBUTING file, no PR invitations. Never name another repo or project in anything published.
