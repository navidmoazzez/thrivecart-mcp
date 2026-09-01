/**
 * The ThriveCart HTTP client.
 *
 * 3 things worth knowing.
 *
 * The base URL is `https://thrivecart.com/api/external`, not
 * `api.thrivecart.com`. The api. host exists, resolves, and refuses everything,
 * so getting it wrong looks exactly like a bad API key.
 *
 * Authentication is a bearer API key per cart, with no session and no refresh,
 * so there is nothing to cache. What does need managing is pacing: requests are
 * spaced by `minRequestIntervalMs`, and 429 and 5xx are retried with backoff
 * that honours `Retry-After`. A revenue summary walks every page of
 * transactions, which is where an unpaced client gets itself rate limited.
 *
 * Every error carries the account name, because with several carts connected
 * "401" on its own does not say which key is wrong.
 */

import { setTimeout as delay } from "node:timers/promises";
import type { Account, Config } from "../config.js";
import { errorFor, ThriveCartError, TimeoutError } from "./errors.js";

type CallInit = {
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

export class ThriveCartClient {
  private readonly config: Config;
  private lastRequestAt = 0;

  constructor(config: Config) {
    this.config = config;
  }

  get accounts(): Account[] {
    return this.config.accounts;
  }

  async get(
    account: Account,
    endpoint: string,
    query: Record<string, unknown> = {},
  ): Promise<unknown> {
    return this.call(account, endpoint, { method: "GET", query });
  }

  async post(
    account: Account,
    endpoint: string,
    body: Record<string, unknown> = {},
  ): Promise<unknown> {
    return this.call(account, endpoint, { method: "POST", body });
  }

  private async call(account: Account, endpoint: string, init: CallInit): Promise<unknown> {
    const method = init.method ?? "GET";
    const url = new URL(`${account.baseUrl}/${endpoint.replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError: ThriveCartError | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      await this.pace();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${account.apiKey}`,
            Accept: "application/json",
            "User-Agent": this.config.userAgent,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
          },
          body: init.body ? JSON.stringify(init.body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        const aborted = (error as Error)?.name === "AbortError";
        lastError = aborted
          ? new TimeoutError(
              `ThriveCart did not answer ${endpoint} within ${this.config.requestTimeoutMs}ms.`,
              408,
              endpoint,
              account.name,
            )
          : new ThriveCartError(
              `Could not reach ThriveCart for ${endpoint}: ${(error as Error)?.message ?? "network error"}`,
              0,
              endpoint,
              account.name,
            );
        // A timeout or a dropped connection is worth one more try; a bad host
        // is not, but it costs only the backoff to find out.
        if (attempt < this.config.maxRetries) {
          await delay(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }
      clearTimeout(timer);

      if (response.ok) {
        const text = await response.text();
        if (!text.trim()) return {};
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new ThriveCartError(
            `ThriveCart returned a non-JSON body for ${endpoint}. This usually means the base URL is wrong. It must be https://thrivecart.com/api/external, not api.thrivecart.com.`,
            response.status,
            endpoint,
            account.name,
            text.slice(0, 200),
          );
        }
      }

      const body = await response.text().catch(() => "");
      lastError = errorFor(response.status, endpoint, account.name, body, response.headers);

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === this.config.maxRetries) throw lastError;

      const retryAfter = response.headers.get("retry-after");
      const waitMs =
        retryAfter && /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : backoffMs(attempt);
      await delay(Math.min(waitMs, 30_000));
    }

    throw lastError ?? new ThriveCartError(`ThriveCart call failed: ${endpoint}`, 0, endpoint, account.name);
  }

  /** Keep at least `minRequestIntervalMs` between outbound requests. */
  private async pace(): Promise<void> {
    const gap = this.config.minRequestIntervalMs;
    if (gap <= 0) return;
    const since = Date.now() - this.lastRequestAt;
    if (since < gap) await delay(gap - since);
    this.lastRequestAt = Date.now();
  }
}

/** Exponential backoff with a little jitter, so retries do not synchronise. */
function backoffMs(attempt: number): number {
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}
