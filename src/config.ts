/**
 * Resolving credentials, and the multi-account model.
 *
 * ThriveCart accounts multiply faster than most services. One person routinely
 * runs a personal cart, a business cart and a client's cart, because ThriveCart
 * licenses per account rather than per seat. Holding one API key in the
 * environment means restarting the server to look at a different cart, which is
 * exactly the moment somebody reads the wrong revenue figure and believes it.
 *
 * Two sources, in priority order:
 *   1. THRIVECART_ACCOUNTS   a JSON array, for several carts at once
 *   2. THRIVECART_API_KEY    the single-account variable
 *
 * Every tool takes an optional `account` argument matched against the name, and
 * the cart that answers when none is named is chosen deliberately (see
 * `selectAccount`) rather than being whichever one happened to be first.
 */

export type Account = {
  /** Short label used in the `account` argument, e.g. "navid-media". */
  name: string;
  /** ThriveCart API key from Settings > API & Webhooks. */
  apiKey: string;
  /** API base. Overridable only so a test can point somewhere else. */
  baseUrl: string;
};

export type Config = {
  accounts: Account[];
  /** Account names preferred, in order, when a tool is called without `account`. */
  preferred: string[];
  readOnly: boolean;
  allowDestructive: boolean;
  requestTimeoutMs: number;
  minRequestIntervalMs: number;
  maxRetries: number;
  /** Hard ceiling on pages walked when a tool fetches everything. */
  maxPages: number;
  userAgent: string;
  auditPath?: string;
};

/**
 * ThriveCart's external API answers on thrivecart.com, NOT api.thrivecart.com.
 * The api. host resolves and then refuses everything, which reads like a bad
 * key rather than a bad host, so it costs an hour the first time.
 */
export const DEFAULT_BASE_URL = "https://thrivecart.com/api/external";

/** Lowercase and collapse spacing so "Navid Media" and "navid-media" both match. */
export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const t = (raw ?? "").trim();
  if (!t) return fallback;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return withScheme.replace(/\/+$/, "");
}

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    process.stderr.write(
      `[thrivecart-mcp] ${name}="${raw}" is not a positive number. Using ${fallback}.\n`,
    );
    return fallback;
  }
  return n;
}

/**
 * Read `THRIVECART_ACCOUNTS`, a JSON array.
 *
 * Both snake_case and camelCase keys are accepted, because the same JSON gets
 * pasted between a shell export and a client config file, and the two
 * conventions do not survive the trip intact.
 */
export function accountsFromJson(raw: string | undefined): Account[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write("[thrivecart-mcp] THRIVECART_ACCOUNTS is not valid JSON. Ignoring it.\n");
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Account[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const rawName = e.name ?? e.account ?? e.label;
    const key = e.api_key ?? e.apiKey ?? e.key ?? e.token;
    if (typeof key !== "string" || !key.trim()) continue;

    // An unnamed cart still has to be addressable, so fall back to its position.
    const name = normalizeName(
      typeof rawName === "string" && rawName.trim() ? rawName : `account-${out.length + 1}`,
    );
    // A duplicate name would make `account` ambiguous and silently pick one.
    if (seen.has(name)) {
      process.stderr.write(
        `[thrivecart-mcp] THRIVECART_ACCOUNTS has two accounts named "${name}". Keeping the first.\n`,
      );
      continue;
    }
    seen.add(name);

    out.push({
      name,
      apiKey: key.trim(),
      baseUrl: normalizeBaseUrl(
        typeof e.base_url === "string"
          ? e.base_url
          : typeof e.baseUrl === "string"
            ? e.baseUrl
            : undefined,
        DEFAULT_BASE_URL,
      ),
    });
  }
  return out;
}

function accountFromSingleEnv(): Account[] {
  const key = process.env.THRIVECART_API_KEY;
  if (!key || !key.trim()) return [];
  return [
    {
      name: normalizeName(process.env.THRIVECART_ACCOUNT_NAME || "default"),
      apiKey: key.trim(),
      baseUrl: normalizeBaseUrl(process.env.THRIVECART_BASE_URL, DEFAULT_BASE_URL),
    },
  ];
}

export function loadConfig(): Config {
  const fromJson = accountsFromJson(process.env.THRIVECART_ACCOUNTS);
  const accounts = fromJson.length > 0 ? fromJson : accountFromSingleEnv();

  const preferred = (process.env.THRIVECART_DEFAULT_ACCOUNT ?? "")
    .split(",")
    .map((s) => normalizeName(s))
    .filter(Boolean);

  return {
    accounts,
    preferred,
    readOnly: envFlag("THRIVECART_READ_ONLY", false),
    allowDestructive: envFlag("THRIVECART_ALLOW_DESTRUCTIVE", true),
    requestTimeoutMs: envInt("THRIVECART_REQUEST_TIMEOUT_MS", 30_000),
    minRequestIntervalMs: envInt("THRIVECART_MIN_REQUEST_INTERVAL_MS", 1000),
    maxRetries: envInt("THRIVECART_MAX_RETRIES", 3),
    maxPages: envInt("THRIVECART_MAX_PAGES", 100),
    userAgent: process.env.THRIVECART_USER_AGENT || "thrivecart-mcp",
    auditPath: process.env.THRIVECART_AUDIT_LOG || undefined,
  };
}

/**
 * Pick which cart a call reads or acts on.
 *
 * With no hint: the first configured `THRIVECART_DEFAULT_ACCOUNT` that is
 * actually present, else the first account. Exact name match beats prefix
 * match, because "navid" is a prefix of both "navid-media" and "navid-personal"
 * and a pure prefix search would quietly answer with the wrong cart's money.
 */
export function selectAccount(config: Config, hint?: string): Account {
  if (config.accounts.length === 0) {
    throw new Error(
      "No ThriveCart account configured. Set THRIVECART_API_KEY to an API key from ThriveCart Settings > API & Webhooks, or THRIVECART_ACCOUNTS for several carts at once. Run `thrivecart-mcp doctor` for details.",
    );
  }

  if (!hint) {
    for (const want of config.preferred) {
      const exact = config.accounts.find((a) => a.name === want);
      if (exact) return exact;
      const prefix = config.accounts.find((a) => a.name.startsWith(want));
      if (prefix) return prefix;
    }
    return config.accounts[0]!;
  }

  const needle = normalizeName(hint);
  const exact = config.accounts.find((a) => a.name === needle);
  if (exact) return exact;

  const prefix = config.accounts.find((a) => a.name.startsWith(needle));
  if (prefix) return prefix;

  const known = config.accounts.map((a) => a.name).join(", ");
  throw new Error(
    `No configured ThriveCart account matches "${hint}". Configured: ${known || "(none)"}. Call list_accounts to see them.`,
  );
}
