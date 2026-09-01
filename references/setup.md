# Setup, the long version

The README covers the happy path. This is for when it does not go that way.

## Getting an API key

1. Sign in to ThriveCart.
2. **Settings** → **API & Webhooks**.
3. Create an API key, or copy the existing one.

There is no OAuth flow, no refresh, and no expiry. The key works until you regenerate it, at which point every client using the old one starts failing at once.

## The host, which is the mistake everyone makes

```
https://thrivecart.com/api/external     correct
https://api.thrivecart.com              resolves, refuses everything
```

The `api.` subdomain exists. DNS answers. TLS completes. Then every request comes back rejected, which reads as a credential problem and sends people to regenerate a perfectly good key. This server uses the correct host; the note is here because you will hit it writing anything else against ThriveCart.

## What the key can do

Everything the account can, including refunding transactions and cancelling subscriptions. ThriveCart has no read-only key and no scopes.

If you are handing this to an agent you are not watching, set `THRIVECART_READ_ONLY=1`. The write tools stop existing rather than failing when called, and a model cannot call what it cannot see.

## Several carts

ThriveCart licenses per account, so a personal cart, a business cart and a client's cart are three separate logins with three separate keys and no relationship between them.

```json
{
  "env": {
    "THRIVECART_ACCOUNTS": "[{\"name\":\"navid-media\",\"api_key\":\"key1\"},{\"name\":\"students\",\"api_key\":\"key2\"}]",
    "THRIVECART_DEFAULT_ACCOUNT": "navid-media"
  }
}
```

Escaping that JSON inside JSON is fiddly. 2 things that go wrong:

- **Unescaped inner quotes.** Every `"` inside the array needs `\"`. A JSON config file with a broken value usually stops the whole client loading its servers, not just this one.
- **A shell export instead.** `export THRIVECART_ACCOUNTS='[{"name":"a","api_key":"k"}]'` with single quotes outside needs no escaping and is easier to get right when testing.

Both `api_key` and `apiKey` are accepted, because the same JSON gets pasted between shells and config files and the conventions do not survive the trip.

### The failure worth naming

Configuring a second cart with the first cart's key. Both work, both return data, and the revenue looks twice as good as it is. `doctor` catches it by resolving each key to its owning account and comparing:

```
 FAIL  navid-media and students are the same cart
       Both keys resolve to hello@navid.media. One of them is wrong, and
       leaving it will double-count revenue when both are queried.
```

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `THRIVECART_API_KEY` | (none) | One key, the simple case |
| `THRIVECART_ACCOUNT_NAME` | `default` | What to call that single cart |
| `THRIVECART_ACCOUNTS` | (none) | JSON array. Wins over the single key |
| `THRIVECART_DEFAULT_ACCOUNT` | first | Which cart answers when none is named |
| `THRIVECART_READ_ONLY` | `0` | `1` removes every write tool |
| `THRIVECART_ALLOW_DESTRUCTIVE` | `1` | `0` blocks cancel and refund only |
| `THRIVECART_AUDIT_LOG` | (none) | Path for a write log, mode `0600` |
| `THRIVECART_REQUEST_TIMEOUT_MS` | `30000` | Per-request deadline |
| `THRIVECART_MIN_REQUEST_INTERVAL_MS` | `120` | Spacing between requests |
| `THRIVECART_MAX_RETRIES` | `3` | Retries on 429 and 5xx |
| `THRIVECART_MAX_PAGES` | `100` | Ceiling when walking transactions |
| `THRIVECART_HTTP_PORT` | `8788` | For `--http` |
| `THRIVECART_HTTP_HOST` | `127.0.0.1` | For `--http` |
| `THRIVECART_HTTP_TOKEN` | (none) | Bearer token required by `--http` |

## Raising the page ceiling

`get_revenue_summary` walks every page of transactions. On a cart with more than 10,000 transactions it stops at `THRIVECART_MAX_PAGES` and says so:

```
warning: Stopped after 100 pages of transactions. These figures are
incomplete. Narrow the date range or raise THRIVECART_MAX_PAGES.
```

Narrowing the date range is almost always the better answer. Raising the ceiling means more requests and a slower call, and ThriveCart will rate limit eventually.

## Verifying

```bash
THRIVECART_API_KEY=your-key npx -y @thenavidm/thrivecart-mcp@latest doctor
```

Exit code 0 means every check passed. Anything else and the output names what to fix.
