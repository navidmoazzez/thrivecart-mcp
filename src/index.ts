#!/usr/bin/env node
/**
 * Entry point.
 *
 * `thrivecart-mcp`             stdio, which is what MCP clients launch
 * `thrivecart-mcp --http`      HTTP, for running it somewhere always on
 * `thrivecart-mcp doctor`      check the setup and say what is wrong
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, VERSION } from "./server.js";
import { loadConfig } from "./config.js";
import { httpOptionsFromEnv, startHttpServer } from "./transport/http.js";

const HELP = `thrivecart-mcp ${VERSION}

  thrivecart-mcp                     Run over stdio. This is what an MCP client launches.
  thrivecart-mcp --http [--port=N]   Run over HTTP, for a machine that is always on.
  thrivecart-mcp doctor              Check the setup and report what is wrong.
  thrivecart-mcp --version           Print the version.

Credentials, in priority order:
  THRIVECART_ACCOUNTS       JSON array, for several carts at once:
                            [{"name":"main","api_key":"..."},{"name":"clients","api_key":"..."}]
  THRIVECART_API_KEY        one API key, from Settings > API & Webhooks
  THRIVECART_ACCOUNT_NAME   what to call that single cart, default "default"

Options:
  THRIVECART_DEFAULT_ACCOUNT        which cart answers when a tool names none
  THRIVECART_READ_ONLY=1            hide every write from the tool list
  THRIVECART_ALLOW_DESTRUCTIVE=0    keep writes, block cancelling and refunding
  THRIVECART_REQUEST_TIMEOUT_MS     per-request deadline, default 30000
  THRIVECART_MIN_REQUEST_INTERVAL_MS  spacing between requests, default 120
  THRIVECART_MAX_PAGES              ceiling when walking transactions, default 100
  THRIVECART_AUDIT_LOG              append-only log of every attempted write
  THRIVECART_HTTP_PORT / _HOST / _TOKEN  for --http

https://github.com/navidmoazzez/thrivecart-mcp
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === "doctor") {
    const { runDoctor } = await import("./doctor.js");
    process.exitCode = await runDoctor();
    return;
  }

  const config = loadConfig();
  const built = buildServer(config);

  // Warn, never block. A network check at startup would delay the handshake,
  // and the failure is more actionable on the tool call that hits it.
  if (config.accounts.length === 0) {
    process.stderr.write(
      "[thrivecart-mcp] No credentials configured. Every tool will report the missing setup. Run `thrivecart-mcp doctor` for details.\n",
    );
  }

  const shutdown = async (close?: () => Promise<void>): Promise<void> => {
    if (close) await close().catch(() => undefined);
    process.exit(0);
  };

  if (argv.includes("--http")) {
    const { close } = await startHttpServer(built, httpOptionsFromEnv(argv));
    process.on("SIGTERM", () => void shutdown(close));
    process.on("SIGINT", () => void shutdown(close));
    return;
  }

  const transport = new StdioServerTransport();
  await built.server.connect(transport);

  // Handled so `docker stop` and a client shutting down return promptly rather
  // than waiting out a grace period.
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((error: unknown) => {
  process.stderr.write(`[thrivecart-mcp] ${(error as Error).message}\n`);
  process.exit(1);
});
