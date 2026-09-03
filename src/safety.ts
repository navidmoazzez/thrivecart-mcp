/**
 * Decides whether a write is allowed to reach ThriveCart.
 *
 * The hazard here is money and access, not publicity. A refund moves real funds
 * out of a real account and there is no un-refund; a cancellation ends a
 * customer's access and the only way back is asking them to buy again. Neither
 * is dangerous when a human meant it, and both are ordinary support work.
 *
 * So: everything works, and the two operations that cannot be walked back need
 * an explicit `confirm: true` the model has to set deliberately after reading a
 * description that says why. That is a speed bump a careless call trips over
 * and an intentional one clears in one retry. Pausing a subscription is undone
 * by resuming it, and creating an affiliate is undone by ignoring them, so
 * neither is guarded. A confirm on everything trains the model to pass confirm
 * reflexively, which is worse protection than none because it looks like a
 * safeguard while being ignored.
 *
 * THRIVECART_READ_ONLY=1 removes every write from the tool list entirely, which
 * is what you want when pointing an untrusted agent at a cart that takes money.
 */

import { appendFileSync } from "node:fs";
import type { Config } from "./config.js";
import { WriteBlockedError } from "./api/errors.js";

export type Risk =
  /** Reads data. Changes nothing. */
  | "read"
  /** Changes something reversible: a pause, a resume, a new affiliate. */
  | "write"
  /** Moves money or ends access, and cannot be undone from here. */
  | "destructive";

/**
 * Which surface is asking.
 *
 * The two surfaces spell the same confirmation differently: an MCP client puts
 * `confirm: true` in the arguments, a person at a terminal types `--confirm`.
 * A refusal that names the wrong one sends the caller hunting for a flag that
 * does not exist where they are standing.
 */
export type Surface = "mcp" | "cli";

export class WriteGuard {
  private readonly config: Config;
  private readonly surface: Surface;

  constructor(config: Config, surface: Surface = "mcp") {
    this.config = config;
    this.surface = surface;
  }

  get readOnly(): boolean {
    return this.config.readOnly;
  }

  /** How this surface spells the confirmation, for the refusal message. */
  private get confirmFlag(): string {
    return this.surface === "cli" ? "--confirm" : "confirm: true";
  }

  check(tool: string, risk: Risk, confirm: boolean | undefined, summary: string): void {
    if (risk === "read") return;

    if (this.config.readOnly) {
      this.audit(tool, summary, "blocked: read-only");
      throw new WriteBlockedError(
        `${tool} is unavailable: this server is running with THRIVECART_READ_ONLY=1.`,
      );
    }

    if (risk === "destructive") {
      if (!this.config.allowDestructive) {
        this.audit(tool, summary, "blocked: destructive disabled");
        throw new WriteBlockedError(
          `${tool} is unavailable: this server is running with THRIVECART_ALLOW_DESTRUCTIVE=0.`,
        );
      }
      if (confirm !== true) {
        this.audit(tool, summary, "blocked: no confirm");
        throw new WriteBlockedError(
          `${tool} moves money or ends a customer's access and cannot be undone, so it will not run without ${this.confirmFlag}. About to: ${summary}. Call again with ${this.confirmFlag} if that is what was asked for.`,
        );
      }
    }

    this.audit(tool, summary, "allowed");
  }

  /** Append-only record of every attempted write, when THRIVECART_AUDIT_LOG is set. */
  private audit(tool: string, summary: string, outcome: string): void {
    if (!this.config.auditPath) return;
    const line = JSON.stringify({
      at: new Date().toISOString(),
      tool,
      summary,
      outcome,
    });
    try {
      appendFileSync(this.config.auditPath, `${line}\n`, { mode: 0o600 });
    } catch {
      // A failing audit log must never take the tool call down with it.
    }
  }
}

/**
 * MCP annotations for a risk level.
 *
 * Clients use these to decide what to auto-approve, so they have to be honest:
 * `openWorldHint` is true for everything because every call leaves the machine,
 * and `idempotentHint` is false for create_affiliate because calling it twice
 * is not the same as calling it once.
 */
export function annotationsFor(
  risk: Risk,
  options: { idempotent?: boolean } = {},
): Record<string, boolean> {
  return {
    readOnlyHint: risk === "read",
    destructiveHint: risk === "destructive",
    idempotentHint: options.idempotent ?? risk === "read",
    openWorldHint: true,
  };
}
