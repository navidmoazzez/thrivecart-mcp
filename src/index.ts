#!/usr/bin/env node
/**
 * Entry point.
 *
 * `thrivecart-mcp`             stdio, which is what MCP clients launch
 * `thrivecart-mcp --http`      HTTP, for running it somewhere always on
 * `thrivecart-mcp doctor`      check the setup and say what is wrong
 * `thrivecart-cli <command>`   the same tools as shell commands
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, VERSION } from "./server.js";
import { loadConfig } from "./config.js";
import { httpOptionsFromEnv, startHttpServer } from "./transport/http.js";
import { runCli, isCliCommand } from "./cli.js";

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
  THRIVECART_MIN_REQUEST_INTERVAL_MS  spacing between requests, default 1000
  THRIVECART_MAX_RETRIES            retries on rate limits and 5xx, default 3
  THRIVECART_MAX_PAGES              ceiling when walking transactions, default 100
  THRIVECART_AUDIT_LOG              append-only log of every attempted write
  THRIVECART_BASE_URL               override the API host, for a proxy or a test
  THRIVECART_USER_AGENT             override the User-Agent sent to ThriveCart
  THRIVECART_HTTP_PORT / _HOST / _TOKEN  for --http

https://github.com/thenavidm/thrivecart-mcp
`;

/**
 * One entry point, two programs. `thrivecart-mcp` is the server and must stay
 * silent on stdout; `thrivecart-cli` is the one a person types. Running the CLI
 * binary with no arguments is someone asking what they can type, so it lists
 * the commands rather than hanging on a transport that will never speak.
 */
function invokedAsCli(): boolean {
  const name = (process.argv[1] ?? "").split("/").pop() ?? "";
  return name.startsWith("thrivecart-cli");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (invokedAsCli() && argv.length === 0) {
    process.exitCode = await runCli(["tools"]);
    return;
  }

  // Checked before --help and --version so `<tool> --help` reaches the tool.
  // A bare `--help` starts with a dash, so it falls through to the block below.
  if (isCliCommand(argv)) {
    process.exitCode = await runCli(argv);
    return;
  }

  // An unknown word used to fall through and start the server, which then sat
  // waiting on stdin: a typo looked like a hang, and scripts saw exit code 0.
  if (invokedAsCli() && command !== undefined && !command.startsWith("-")) {
    process.stderr.write(
      `${JSON.stringify({ error: `Unknown command '${command}'. Run \`thrivecart-cli\` to list them.` }, null, 2)}\n`,
    );
    process.exitCode = 1;
    return;
  }

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
