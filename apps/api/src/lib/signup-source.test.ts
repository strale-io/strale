import { describe, it, expect, vi } from "vitest";
import { normaliseSignupSource, resolveSignupSource } from "./signup-source.js";
import { createAccount } from "./account-service.js";
import { drizzle } from "drizzle-orm/pg-proxy";
import { PgDialect } from "drizzle-orm/pg-core";
import { runMigration0126_signupSource } from "./startup-migrations.js";
vi.mock("./wallet-service.js", () => ({ openWallet: vi.fn(async () => undefined) }));
const req = (query: Record<string, string> = {}, referer?: string) => ({ query: (n: string) => query[n], header: () => referer });
describe("signup venue labels", () => {
  it.each(["https://example.com/path", "user@example.com", "127.0.0.1", "12345", "a".repeat(65), "two words", {}, Buffer.from("foo"), new Date()])("rejects non-channel input %s", value => {
    expect(normaliseSignupSource(value)).toBeNull();
  });
  it("normalises case and whitespace without clipping", () => {
    expect(normaliseSignupSource(" MCP-Registry ")).toBe("mcp-registry");
    expect(normaliseSignupSource("a".repeat(64))).toHaveLength(64);
  });
  it("uses query src, body src, utm_source, then a known referer venue", () => {
    expect(resolveSignupSource(req({src: "glama"}), {src: "smithery"})).toBe("glama");
    expect(resolveSignupSource(req({utm_source: "context7"}), {src: "smithery"})).toBe("smithery");
    expect(resolveSignupSource(req(), {utm_source: "npm-readme"})).toBe("npm-readme");
    expect(resolveSignupSource(req({}, "https://unknown.example/path?email=person@example.com"), {})).toBeNull();
    expect(resolveSignupSource(req({}, "https://glama.ai/path"), {})).toBe("glama");
    expect(resolveSignupSource(req({}, "http://127.0.0.1/private"), {})).toBeNull();
    expect(resolveSignupSource(req({}, "http://[::1]/"), {})).toBeNull();
    expect(resolveSignupSource(req({src:"bad/value"}, "https://glama.ai"), {})).toBeNull();
    expect(resolveSignupSource(req(), {})).toBeNull();
  });
  it.each(["strale.dev", "strale.io", "api.strale.io", "glama.strale.dev", "foo.api.strale.io"])("never stores our own host %s", host => {
    expect(resolveSignupSource(req({}, `https://${host}/signup`), {})).toBeNull();
  });
  it("treats empty source fields as absent", () => {
    expect(resolveSignupSource(req({src: "", utm_source: "context7"}), {})).toBe("context7");
    expect(resolveSignupSource(req({src: ""}, "https://glama.ai"), {})).toBe("glama");
    expect(resolveSignupSource(req({}, "https://glama.ai"), {src: "  ", utm_source: ""})).toBe("glama");
  });
  it("binds signup source as a primitive through the actual Drizzle insert encoder", async () => {
    const writes: {sql: string; params: unknown[]}[] = [];
    const tx = drizzle(async (sql, params) => { writes.push({sql,params}); return {rows: [["user-id", "fixture@example.com"]]}; });
    await createAccount({ transaction: (fn: (tx: unknown) => unknown) => fn(tx) }, {
      email: "fixture@example.com", ipHash: null, trialIpHash: null,
      grantCents: 0, grantDescription: "fixture", channel: "register", tosVersion: "test",
      signupSrc: " MCP-Registry ", now: new Date("2026-10-27T00:00:00Z"),
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toContain('"signup_src"');
    expect(writes[0].params).toContain("mcp-registry");
    expect(writes[0].params.every(p => !(p instanceof Date) && !Buffer.isBuffer(p))).toBe(true);
  });
  it("registers guarded append-only DDL with no object bind parameters", async () => {
    const execute = vi.fn(async (query: any) => {
      const {sql, params} = new PgDialect().sqlToQuery(query);
      expect(sql).toContain("information_schema.columns");
      expect(sql).toContain("IF NOT EXISTS");
      expect(sql).toContain("ADD COLUMN signup_src text;");
      expect(sql).toContain("pg_constraint");
      expect(sql).toContain("users_signup_src_format");
      expect(sql).toContain("CHECK (signup_src ~ '^[a-z0-9-]{1,64}$') NOT VALID");
      expect(params).toEqual([]);
    });
    await runMigration0126_signupSource({execute});
    await runMigration0126_signupSource({execute});
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
