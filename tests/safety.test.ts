import { describe, expect, it } from "vitest";
import { annotationsFor, WriteGuard } from "../src/safety.js";
import type { Config } from "../src/config.js";

function config(over: Partial<Config> = {}): Config {
  return {
    accounts: [],
    preferred: [],
    readOnly: false,
    allowDestructive: true,
    requestTimeoutMs: 30_000,
    minRequestIntervalMs: 0,
    maxRetries: 0,
    maxPages: 100,
    userAgent: "test",
    ...over,
  };
}

describe("WriteGuard", () => {
  it("never blocks a read", () => {
    const guard = new WriteGuard(config({ readOnly: true }));
    expect(() => guard.check("get_transactions", "read", undefined, "read")).not.toThrow();
  });

  it("lets a reversible write through without a confirmation", () => {
    const guard = new WriteGuard(config());
    expect(() => guard.check("pause_subscription", "write", undefined, "pause")).not.toThrow();
  });

  it("refuses a destructive call with no confirm", () => {
    const guard = new WriteGuard(config());
    expect(() => guard.check("refund_transaction", "destructive", undefined, "refund 1")).toThrow(
      /confirm: true/,
    );
  });

  it("allows a destructive call once confirmed", () => {
    const guard = new WriteGuard(config());
    expect(() => guard.check("refund_transaction", "destructive", true, "refund 1")).not.toThrow();
  });

  it("names what is about to happen in the refusal, so confirming is an informed act", () => {
    const guard = new WriteGuard(config());
    expect(() => guard.check("cancel_subscription", "destructive", undefined, "CANCEL sub 42")).toThrow(
      /CANCEL sub 42/,
    );
  });

  it("blocks every write in read-only mode, confirmed or not", () => {
    const guard = new WriteGuard(config({ readOnly: true }));
    expect(() => guard.check("pause_subscription", "write", undefined, "pause")).toThrow(/READ_ONLY/);
    expect(() => guard.check("refund_transaction", "destructive", true, "refund")).toThrow(/READ_ONLY/);
  });

  it("blocks destructive calls when they are disabled, even with confirm", () => {
    const guard = new WriteGuard(config({ allowDestructive: false }));
    expect(() => guard.check("refund_transaction", "destructive", true, "refund")).toThrow(
      /ALLOW_DESTRUCTIVE=0/,
    );
    expect(() => guard.check("pause_subscription", "write", undefined, "pause")).not.toThrow();
  });
});

describe("annotationsFor", () => {
  it("tells a client the truth about what each risk level does", () => {
    expect(annotationsFor("read")).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(annotationsFor("destructive")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("marks everything open-world, because every call leaves the machine", () => {
    expect(annotationsFor("read").openWorldHint).toBe(true);
  });

  it("treats a write as non-idempotent unless it says otherwise", () => {
    expect(annotationsFor("write").idempotentHint).toBe(false);
    expect(annotationsFor("write", { idempotent: true }).idempotentHint).toBe(true);
  });
});
