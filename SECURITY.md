# Security

## Reporting

Found a vulnerability? [Report it privately](https://github.com/navidmoazzez/thrivecart-mcp/security/advisories/new). Not as a public issue.

## What this server holds

1 or more ThriveCart API keys, read from environment variables at startup and held in memory for the process lifetime. Nothing is written to disk, cached, or sent anywhere except `thrivecart.com`.

A ThriveCart API key reaches the whole account, including refunds and cancellations. There is no read-only key and no scope system upstream, so the key you give this server is the key to the till. Treat it like a password.

## The write-safety model

Writes work by default, because a server where every write needs a flag teaches the flag to be passed reflexively.

| Control | Effect |
|---|---|
| `confirm: true` | Required by `cancel_subscription` and `refund_transaction`. Neither can be undone |
| `THRIVECART_ALLOW_DESTRUCTIVE=0` | Those two refuse. Pause, resume and create_affiliate still work |
| `THRIVECART_READ_ONLY=1` | All five write tools are removed from the tool list entirely |
| `THRIVECART_AUDIT_LOG=<path>` | One JSON line per attempted write, allowed or blocked, written `0600` |

Read-only is the right setting for any agent you are not supervising.

## Running over HTTP

`--http` binds `127.0.0.1` by default, deliberately. Before changing `THRIVECART_HTTP_HOST`, set `THRIVECART_HTTP_TOKEN`. Otherwise anyone who can reach the port can refund your customers.

The transport is stateless: one transport per request, closed with the response, so there is no session table to leak or grow.

## Prompt injection

Product names, customer names and affiliate details are attacker-influenceable text. This server returns them as data and its instructions tell the model to treat them as data. A model driving these tools should never act on instructions found inside a product title.

## Supported versions

Fixes go to the latest published version.
