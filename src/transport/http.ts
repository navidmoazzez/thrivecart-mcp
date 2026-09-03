/**
 * HTTP transport, for running the server somewhere always on.
 *
 * Streamable HTTP per the 2025-03-26 spec, stateless: every request builds its
 * own transport and tears it down. No session map means no session leak, which
 * matters far more here than the reconnect support a stateful server would buy.
 *
 * Bound to 127.0.0.1 by default. A ThriveCart API key can refund money and
 * cancel subscriptions, so a server that binds 0.0.0.0 without being asked is a
 * mistake that only needs making once; THRIVECART_HTTP_HOST is there for people
 * who mean it, and THRIVECART_HTTP_TOKEN should be set whenever it is.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { BuiltServer } from "../server.js";

export type HttpOptions = {
  port: number;
  host: string;
  /** When set, every request must send `Authorization: Bearer <token>`. */
  token?: string;
};

export function httpOptionsFromEnv(argv: string[] = []): HttpOptions {
  // Both spellings, and neither silently. `--port=8790` and `--port 8790` are
  // what people type; accepting only the first meant the second fell through to
  // the default with no complaint, which is indistinguishable from the flag
  // being ignored. A trailing `--port` with nothing after it, `--portable`, and
  // a non-positive number all fall back rather than producing NaN.
  const i = argv.findIndex((a) => a === "--port" || a.startsWith("--port="));
  const raw =
    i === -1
      ? undefined
      : (argv[i] as string).includes("=")
        ? (argv[i] as string).split("=").slice(1).join("=")
        : argv[i + 1];
  const fromFlag = raw === undefined ? NaN : Number(raw);
  const fromEnv = Number(process.env.THRIVECART_HTTP_PORT);
  const port = Number.isFinite(fromFlag) && fromFlag > 0
    ? fromFlag
    : Number.isFinite(fromEnv) && fromEnv > 0
      ? fromEnv
      : 8788;
  return {
    port: Number.isFinite(port) && port > 0 ? port : 8788,
    host: process.env.THRIVECART_HTTP_HOST || "127.0.0.1",
    token: process.env.THRIVECART_HTTP_TOKEN || undefined,
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Constant-time-ish bearer check.
 *
 * Not a full timing-safe comparison. The token is compared after a length
 * check, which is adequate for a loopback-by-default service and avoids
 * pulling in crypto for a value the operator sets themselves.
 */
function authorised(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return presented.length === token.length && presented === token;
}

export async function startHttpServer(
  built: BuiltServer,
  options: HttpOptions,
): Promise<{ close: () => Promise<void> }> {
  const http = createServer((req, res) => {
    void handle(built, options, req, res).catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: (error as Error)?.message ?? "internal error" },
          id: null,
        }),
      );
    });
  });

  await new Promise<void>((resolve) => http.listen(options.port, options.host, resolve));
  process.stderr.write(
    `[thrivecart-mcp] HTTP on http://${options.host}:${options.port}/mcp${
      options.token ? " (bearer token required)" : ""
    }\n`,
  );

  return {
    close: () =>
      new Promise<void>((resolve) => {
        http.close(() => resolve());
      }),
  };
}

async function handle(
  built: BuiltServer,
  options: HttpOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tools: built.toolCount }));
    return;
  }

  if (!authorised(req, options.token)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized. Send Authorization: Bearer <token>." },
        id: null,
      }),
    );
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json", allow: "POST" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Use POST for MCP requests." },
        id: null,
      }),
    );
    return;
  }

  const body = await readBody(req);

  // Stateless: a transport per request, closed with the response. Nothing is
  // retained between calls, so there is no session table to grow unbounded.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => void transport.close());

  await built.server.connect(transport);
  await transport.handleRequest(req, res, body);
}
