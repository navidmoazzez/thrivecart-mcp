import { afterEach, describe, expect, it } from "vitest";
import { accountsFromJson, loadConfig, normalizeName, selectAccount, type Config } from "../src/config.js";

const ENV_KEYS = [
  "THRIVECART_ACCOUNTS",
  "THRIVECART_API_KEY",
  "THRIVECART_ACCOUNT_NAME",
  "THRIVECART_DEFAULT_ACCOUNT",
  "THRIVECART_READ_ONLY",
  "THRIVECART_MAX_PAGES",
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

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

const account = (name: string) => ({ name, apiKey: `key-${name}`, baseUrl: "https://thrivecart.com/api/external" });

describe("normalizeName", () => {
  it("lowercases and collapses spacing so a display name matches a slug", () => {
    expect(normalizeName("  Navid Media ")).toBe("navid-media");
    expect(normalizeName("navid_media")).toBe("navid-media");
  });
});

describe("accountsFromJson", () => {
  it("accepts snake_case and camelCase, because the same JSON gets pasted between shells and config files", () => {
    const parsed = accountsFromJson('[{"name":"a","api_key":"k1"},{"name":"b","apiKey":"k2"}]');
    expect(parsed.map((a) => [a.name, a.apiKey])).toEqual([
      ["a", "k1"],
      ["b", "k2"],
    ]);
  });

  it("names an unnamed cart by position rather than dropping it", () => {
    expect(accountsFromJson('[{"api_key":"k1"}]')[0]?.name).toBe("account-1");
  });

  it("drops entries with no key", () => {
    expect(accountsFromJson('[{"name":"a"},{"name":"b","api_key":"k"}]')).toHaveLength(1);
  });

  it("keeps the first of two accounts sharing a name, so `account` is never ambiguous", () => {
    const parsed = accountsFromJson('[{"name":"a","api_key":"first"},{"name":"A","api_key":"second"}]');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.apiKey).toBe("first");
  });

  it("returns nothing for malformed JSON instead of throwing", () => {
    expect(accountsFromJson("{not json")).toEqual([]);
    expect(accountsFromJson(undefined)).toEqual([]);
  });

  it("defaults the base URL to thrivecart.com, never api.thrivecart.com", () => {
    expect(accountsFromJson('[{"name":"a","api_key":"k"}]')[0]?.baseUrl).toBe(
      "https://thrivecart.com/api/external",
    );
  });
});

describe("loadConfig", () => {
  it("prefers THRIVECART_ACCOUNTS over the single-account variable", () => {
    process.env.THRIVECART_ACCOUNTS = '[{"name":"multi","api_key":"k1"}]';
    process.env.THRIVECART_API_KEY = "single";
    expect(loadConfig().accounts.map((a) => a.name)).toEqual(["multi"]);
  });

  it("falls back to the single-account variable", () => {
    process.env.THRIVECART_API_KEY = "single";
    process.env.THRIVECART_ACCOUNT_NAME = "My Cart";
    const [only] = loadConfig().accounts;
    expect(only?.name).toBe("my-cart");
    expect(only?.apiKey).toBe("single");
  });

  it("reports no accounts rather than inventing one", () => {
    expect(loadConfig().accounts).toEqual([]);
  });

  it("falls back to the default when a numeric env var is nonsense", () => {
    process.env.THRIVECART_MAX_PAGES = "not-a-number";
    expect(loadConfig().maxPages).toBe(100);
  });
});

describe("selectAccount", () => {
  it("explains itself when nothing is configured", () => {
    expect(() => selectAccount(config())).toThrow(/No ThriveCart account configured/);
  });

  it("prefers an exact match over a prefix, so money is never read from the wrong cart", () => {
    const cfg = config({ accounts: [account("navid-personal"), account("navid-media")] });
    expect(selectAccount(cfg, "navid-media").name).toBe("navid-media");
  });

  it("still allows a prefix when it is unambiguous", () => {
    const cfg = config({ accounts: [account("navid-media")] });
    expect(selectAccount(cfg, "navid").name).toBe("navid-media");
  });

  it("honours THRIVECART_DEFAULT_ACCOUNT over declaration order", () => {
    const cfg = config({ accounts: [account("first"), account("second")], preferred: ["second"] });
    expect(selectAccount(cfg).name).toBe("second");
  });

  it("falls back to the first account when the preferred one is absent", () => {
    const cfg = config({ accounts: [account("first")], preferred: ["missing"] });
    expect(selectAccount(cfg).name).toBe("first");
  });

  it("lists what is configured when a hint matches nothing", () => {
    const cfg = config({ accounts: [account("a"), account("b")] });
    expect(() => selectAccount(cfg, "zzz")).toThrow(/Configured: a, b/);
  });
});
