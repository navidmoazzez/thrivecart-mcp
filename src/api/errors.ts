/**
 * Typed errors for every way a ThriveCart call can fail.
 *
 * ThriveCart returns plain HTTP statuses with a thin body, so the status is
 * most of the signal and the message has to supply the rest. A bare
 * "ThriveCart API error 401" tells a model nothing it can act on; naming the
 * likely cause (wrong host, account key instead of API key, a cart the key
 * does not cover) is the difference between a correct retry and a give-up.
 */

export class ThriveCartError extends Error {
  readonly status: number;
  readonly endpoint: string;
  /** The account whose key was used, so a multi-cart failure names the cart. */
  readonly account: string;
  readonly detail: string;

  constructor(message: string, status: number, endpoint: string, account = "", detail = "") {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.endpoint = endpoint;
    this.account = account;
    this.detail = detail;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      type: this.name,
      status: this.status,
      endpoint: this.endpoint,
      ...(this.account ? { account: this.account } : {}),
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

/** 401/403. The key is wrong, revoked, or belongs to a different cart. */
export class AuthenticationError extends ThriveCartError {}

/** 400. The arguments were rejected. */
export class ValidationError extends ThriveCartError {}

/** 404. No such product, order, customer or affiliate. */
export class NotFoundError extends ThriveCartError {}

/** 429. Backed off and retried already; this is after the last attempt. */
export class RateLimitError extends ThriveCartError {
  readonly retryAfter?: number;

  constructor(
    message: string,
    status: number,
    endpoint: string,
    account: string,
    detail: string,
    retryAfter?: number,
  ) {
    super(message, status, endpoint, account, detail);
    this.retryAfter = retryAfter;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      ...(this.retryAfter ? { retry_after_seconds: this.retryAfter } : {}),
    };
  }
}

/** 5xx. Upstream, usually transient. */
export class ServerError extends ThriveCartError {}

/** Synthetic 408. Nothing arrived before our own deadline. */
export class TimeoutError extends ThriveCartError {}

/** Writes are disabled, or a destructive tool was called without `confirm`. */
export class WriteBlockedError extends ThriveCartError {
  constructor(message: string) {
    super(message, 0, "(local)", "", "");
  }
}

/**
 * Reduce a response body to something worth showing.
 *
 * Capped at 500 characters so an HTML error page from a proxy in front of
 * ThriveCart does not become the entire error message.
 */
export function parseErrorBody(body: string): string {
  const text = body.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const message = obj.message ?? obj.error ?? obj.errors;
      if (typeof message === "string") return message.slice(0, 500);
      return JSON.stringify(message ?? obj).slice(0, 500);
    }
  } catch {
    // Not JSON. Fall through to the raw text.
  }
  return text.replace(/\s+/g, " ").slice(0, 500);
}

/** Map a status onto the right class, with a message that names the fix. */
export function errorFor(
  status: number,
  endpoint: string,
  account: string,
  body: string,
  headers?: Headers,
): ThriveCartError {
  const detail = parseErrorBody(body);

  if (status === 429) {
    const raw = headers?.get("retry-after");
    const retryAfter = raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
    return new RateLimitError(
      `ThriveCart rate limited ${endpoint}. The client already backs off and retries; this failed after the last attempt.`,
      status,
      endpoint,
      account,
      detail,
      retryAfter,
    );
  }
  if (status === 401 || status === 403) {
    return new AuthenticationError(
      `ThriveCart rejected the credentials for ${endpoint}. Check the key is an API key from Settings > API & Webhooks (not the account password), that it has not been regenerated, and that it belongs to the cart you are asking about. Run \`thrivecart-mcp doctor\`.`,
      status,
      endpoint,
      account,
      detail,
    );
  }
  if (status === 404) {
    return new NotFoundError(
      `Not found via ${endpoint}. Check the id. Note that ThriveCart returns 404 for a record that belongs to a different cart than this key covers, so it can mean "wrong account" rather than "does not exist".`,
      status,
      endpoint,
      account,
      detail,
    );
  }
  if (status === 400 || status === 422) {
    return new ValidationError(
      `ThriveCart rejected the arguments sent to ${endpoint}.`,
      status,
      endpoint,
      account,
      detail,
    );
  }
  if (status >= 500) {
    return new ServerError(
      `ThriveCart returned ${status} for ${endpoint}. This is upstream and usually transient.`,
      status,
      endpoint,
      account,
      detail,
    );
  }
  return new ThriveCartError(
    `ThriveCart returned ${status} for ${endpoint}.`,
    status,
    endpoint,
    account,
    detail,
  );
}
