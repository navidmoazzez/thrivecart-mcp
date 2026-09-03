/**
 * The CLI adapter.
 *
 * What matters here is that the shell surface is derived from the tool specs
 * rather than described a second time, so the tests that count are the ones
 * asserting parity with ALL_TOOLS and the ones covering the argv shapes a
 * person actually types.
 */

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { flagsFor, parseArgs, isCliCommand, exitCodeFor, EXIT, selectFields } from "../src/cli.js";
import { ALL_TOOLS } from "../src/tools/index.js";

describe("flagsFor", () => {
  it("derives a flag per schema key, kebab-cased", () => {
    const flags = flagsFor({ item_name: z.string().optional() });
    expect(flags[0]).toMatchObject({ key: "item_name", flag: "--item-name", kind: "string" });
  });

  it("reads required from the absence of .optional()", () => {
    const flags = flagsFor({ product_id: z.string(), account: z.string().optional() });
    expect(flags.find((f) => f.key === "product_id")?.required).toBe(true);
    expect(flags.find((f) => f.key === "account")?.required).toBe(false);
  });

  it("carries .describe() through as help", () => {
    const flags = flagsFor({ product_id: z.string().describe("The product id.") });
    expect(flags[0]?.help).toBe("The product id.");
  });

  it("finds the description whichever side of .optional() it was chained", () => {
    const outer = flagsFor({ a: z.string().optional().describe("outer") });
    const inner = flagsFor({ b: z.string().describe("inner").optional() });
    expect(outer[0]?.help).toBe("outer");
    expect(inner[0]?.help).toBe("inner");
  });

  it("exposes an enum's values as choices", () => {
    const flags = flagsFor({ status: z.enum(["active", "cancelled"]).optional() });
    expect(flags[0]).toMatchObject({ kind: "enum", choices: ["active", "cancelled"] });
  });

  it("marks a scalar array repeatable and an object array json", () => {
    const flags = flagsFor({
      ids: z.array(z.string()).optional(),
      items: z.array(z.object({ id: z.string() })).optional(),
    });
    expect(flags.find((f) => f.key === "ids")).toMatchObject({ kind: "string", repeatable: true });
    expect(flags.find((f) => f.key === "items")).toMatchObject({ kind: "json", repeatable: true });
  });
});

describe("parseArgs", () => {
  const flags = flagsFor({
    product_id: z.string(),
    per_page: z.number().optional(),
    confirm: z.boolean().optional(),
    ids: z.array(z.string()).optional(),
    filter: z.object({ status: z.string() }).optional(),
    date_range: z.enum(["month", "year"]).optional(),
  });

  it("accepts --flag value and --flag=value alike", () => {
    expect(parseArgs(["--product-id", "abc"], flags)).toEqual({ product_id: "abc" });
    expect(parseArgs(["--product-id=abc"], flags)).toEqual({ product_id: "abc" });
  });

  it("accepts the underscore spelling of a flag", () => {
    expect(parseArgs(["--date_range", "year"], flags)).toEqual({ date_range: "year" });
  });

  it("treats a boolean as a bare switch", () => {
    expect(parseArgs(["--product-id", "abc", "--confirm"], flags)).toEqual({
      product_id: "abc",
      confirm: true,
    });
    expect(parseArgs(["--confirm=false"], flags)).toEqual({ confirm: false });
  });

  it("coerces numbers, and refuses ones that are not", () => {
    expect(parseArgs(["--per-page", "25"], flags)).toEqual({ per_page: 25 });
    expect(() => parseArgs(["--per-page", "many"], flags)).toThrow(/expects a number/);
  });

  it("parses a json flag, and refuses malformed json", () => {
    expect(parseArgs(['--filter={"status":"active"}'], flags)).toEqual({
      filter: { status: "active" },
    });
    expect(() => parseArgs(["--filter", "{oops"], flags)).toThrow(/expects JSON/);
  });

  it("collects a repeatable flag into an array", () => {
    expect(parseArgs(["--ids", "a", "--ids", "b"], flags)).toEqual({ ids: ["a", "b"] });
  });

  it("checks an enum against its choices", () => {
    expect(() => parseArgs(["--date-range", "week"], flags)).toThrow(/expects one of/);
  });

  it("fills the first required flag from a bare argument", () => {
    expect(parseArgs(["abc"], flags)).toEqual({ product_id: "abc" });
  });

  it("wraps a bare argument when the required flag is repeatable", () => {
    const repeatable = flagsFor({ ids: z.array(z.string()) });
    expect(parseArgs(["abc"], repeatable)).toEqual({ ids: ["abc"] });
  });

  it("refuses an unknown option rather than dropping it", () => {
    expect(() => parseArgs(["--nope", "x"], flags)).toThrow(/Unknown option/);
  });

  it("refuses a second bare argument", () => {
    expect(() => parseArgs(["one", "two"], flags)).toThrow(/Unexpected argument/);
  });
});

describe("parity with the MCP surface", () => {
  it("routes every tool name, in both spellings", () => {
    for (const tool of ALL_TOOLS) {
      expect(isCliCommand([tool.name])).toBe(true);
      expect(isCliCommand([tool.name.replace(/_/g, "-")])).toBe(true);
    }
  });

  it("builds flags for every tool without throwing", () => {
    for (const tool of ALL_TOOLS) {
      expect(() => flagsFor(tool.schema)).not.toThrow();
    }
  });

  it("gives every schema key a flag", () => {
    for (const tool of ALL_TOOLS) {
      expect(flagsFor(tool.schema)).toHaveLength(Object.keys(tool.schema).length);
    }
  });

  it("leaves the server's own flags alone", () => {
    expect(isCliCommand(["--http"])).toBe(false);
    expect(isCliCommand(["--version"])).toBe(false);
    expect(isCliCommand([])).toBe(false);
  });
});

describe("documentation stays in step with the code", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf-8");
  const names = (text: string): Set<string> => new Set(text.match(/THRIVECART_[A-Z_]+/g) ?? []);

  /**
   * Two variables shipped undocumented and five never reached `--help`, which is
   * the kind of drift nobody notices because both sides look complete on their own.
   */
  it("documents every environment variable the code reads", () => {
    const used = names(["config.ts", "transport/http.ts"].map((f) => read(`../src/${f}`)).join("\n"));
    // The README carries the ones a reader meets during install; the full
    // reference table lives in INSTALL.md, which the README links to. Either
    // page counts as documented, neither counts as an excuse for the other.
    const documented = names([read("../README.md"), read("../INSTALL.md")].join("\n"));
    expect([...used].filter((v) => !documented.has(v))).toEqual([]);
  });

  it("lists every environment variable in --help", () => {
    const used = names(["config.ts", "transport/http.ts"].map((f) => read(`../src/${f}`)).join("\n"));
    const helped = names(read("../src/index.ts"));
    // The help groups the HTTP ones as `THRIVECART_HTTP_PORT / _HOST / _TOKEN`.
    const shorthand = new Set(["THRIVECART_HTTP_HOST", "THRIVECART_HTTP_TOKEN"]);
    expect([...used].filter((v) => !helped.has(v) && !shorthand.has(v))).toEqual([]);
  });

  /**
   * Two in-page links pointed at headings that had been renamed, including the
   * one row routing a shell user to the CLI. The ship checklist's link pass only
   * greps http, so a dead `#anchor` is the kind that ships quietly.
   */
  it.each(["../README.md", "../INSTALL.md"])("has no dead in-page anchors in %s", (file) => {
    if (!existsSync(new URL(file, import.meta.url))) return; // repo may ship one doc
    const md = read(file);
    const slugs = new Set<string>();
    for (const [, heading] of md.matchAll(/^#{2,4} (.+)$/gm)) {
      const stripped = (heading as string).toLowerCase().replace(/[^\w\s-]/g, "");
      // GitHub keeps the trailing hyphen when a heading ends in an emoji.
      slugs.add(stripped.trim().replace(/\s+/g, "-"));
      slugs.add(stripped.replace(/\s+/g, "-"));
    }
    const dead = [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)]
      .map((m) => m[1] as string)
      .filter((a) => !slugs.has(a));
    expect(dead).toEqual([]);
  });
});

/**
 * Exit codes are the whole point of the CLI surface for a script: it branches
 * on the number rather than reading prose. The three cases below were each
 * wrong once, and each wrong in a way that sent the caller somewhere useless.
 */
describe("exitCodeFor", () => {
  it("returns 10, not 4, when nothing is configured", () => {
    // The message names an API key, so matching auth first sent someone who
    // had configured nothing hunting for a revoked credential.
    const e = new Error(
      "No ThriveCart account configured. Set THRIVECART_API_KEY to an API key from ThriveCart Settings > API & Webhooks.",
    );
    expect(exitCodeFor(e)).toBe(EXIT.config);
  });

  it("still returns 4 when the API really did reject the key", () => {
    expect(exitCodeFor(Object.assign(new Error("Unauthorized"), { status: 401 }))).toBe(EXIT.auth);
  });

  it("returns 2, not 5, for a write the guard refused", () => {
    const e = new Error(
      "refund_transaction moves money or ends a customer's access and cannot be undone, so it will not run without --confirm.",
    );
    expect(exitCodeFor(e)).toBe(EXIT.usage);
  });

  it("returns 2 for a tool hidden by read-only or destructive-off", () => {
    expect(exitCodeFor(new Error("refund_transaction is unavailable: THRIVECART_READ_ONLY=1."))).toBe(
      EXIT.usage,
    );
  });

  it("keeps 3, 5 and 7 for not found, server errors and rate limits", () => {
    expect(exitCodeFor(Object.assign(new Error("Not found"), { status: 404 }))).toBe(EXIT.notFound);
    expect(exitCodeFor(Object.assign(new Error("Boom"), { status: 503 }))).toBe(EXIT.api);
    expect(exitCodeFor(Object.assign(new Error("slow down"), { status: 429 }))).toBe(
      EXIT.rateLimited,
    );
  });
});

describe("an array of enums", () => {
  /**
   * An enum element is a word you type, so it belongs with the scalars.
   * Treated as JSON, `--status refunded` was rejected and you had to write
   * `--status '"refunded"'` instead.
   */
  it("is a repeatable string flag, not JSON", () => {
    const flags = flagsFor({ status: z.array(z.enum(["paid", "refunded"])).optional() });
    expect(flags[0]).toMatchObject({ kind: "string", repeatable: true });
  });

  it("accepts a bare word, repeated", () => {
    const flags = flagsFor({ status: z.array(z.enum(["paid", "refunded"])).optional() });
    expect(parseArgs(["--status", "paid", "--status", "refunded"], flags)).toEqual({
      status: ["paid", "refunded"],
    });
  });
});

/**
 * Two paths under one head used to overwrite each other, so
 * `--select orders.id,orders.total` quietly returned only the total. Silent
 * data loss in a flag whose whole purpose is choosing what you keep, on a
 * connector where the dropped field might be the amount.
 */
describe("--select keeps every path, not the last one", () => {
  it("keeps both fields when two paths share a head", () => {
    const data = { orders: [{ id: "9999", total: 4900, item_name: "Bundle" }] };
    expect(selectFields(data, ["orders.id", "orders.total"])).toEqual({
      orders: [{ id: "9999", total: 4900 }],
    });
  });

  it("groups at every depth", () => {
    expect(selectFields({ a: { b: { c: 1, d: 2, e: 3 } } }, ["a.b.c", "a.b.e"])).toEqual({
      a: { b: { c: 1, e: 3 } },
    });
  });

  it("mixes a scalar with nested paths", () => {
    expect(selectFields({ x: 1, y: { z: 2, w: 3 } }, ["x", "y.z", "y.w"])).toEqual({
      x: 1,
      y: { z: 2, w: 3 },
    });
  });
});

/**
 * A hardcoded VERSION drifts the moment a release bumps package.json and not
 * the constant, and the two places it surfaces are `--version` and `doctor`:
 * exactly where someone looks when they are already confused.
 */
describe("VERSION", () => {
  it("comes from package.json, not a copy", async () => {
    const { VERSION } = await import("../src/server.js");
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
    ) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
