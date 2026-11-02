import { expect, it } from "vitest";
import pino from "pino";
import { logOptions } from "./log.js";
it("H6 redacts secrets and personal fields before stdout or a transport", () => {
  let output = "";
  const logger = pino(logOptions, { write: chunk => { output += chunk; } });
  const fields = ["authorization", "Authorization", "api_key", "apiKey", "token", "tokens", "api_token", "accessToken", "refreshToken", "idToken", "access_token", "refresh_token", "id_token", "password", "x-payment", "X-Payment", "payment-signature", "PAYMENT-SIGNATURE", "paymentSignature", "payment_signature", "email", "to", "user_email", "recipient", "email_to", "To", "USER_EMAIL", "Recipient", "Email_To"];
  const secrets = Object.fromEntries(fields.map((field, i) => [field, `secret-value-${i}`]));
  logger.info({ ...secrets, headers: secrets, req: { headers: secrets }, deeply: { nested: [{ user: secrets }] }, safe: "visible" });
  const row = JSON.parse(output);
  for (const field of fields) {
    expect(row[field]).toBe("[Redacted]"); expect(row.headers[field]).toBe("[Redacted]");
    expect(row.req.headers[field]).toBe("[Redacted]"); expect(row.deeply.nested[0].user[field]).toBe("[Redacted]");
  }
  expect(output).not.toContain("secret-value"); expect(row.safe).toBe("visible");
  expect(secrets.email).not.toBe("[Redacted]");
});

it("H6 redacts nested Error metadata while retaining diagnostics", () => {
  let output = "";
  const logger = pino(logOptions, { write: chunk => { output += chunk; } });
  logger.error({ err: Object.assign(new Error("safe-message"), { context: { headers: { authorization: "private-auth" }, user: { email: "private-email" } } }) });
  const row = JSON.parse(output);
  expect(row.err.message).toBe("safe-message"); expect(row.err.stack).toContain("safe-message");
  expect(row.err.context.headers.authorization).toBe("[Redacted]");
  expect(row.err.context.user.email).toBe("[Redacted]");
  expect(output).not.toContain("private-auth"); expect(output).not.toContain("private-email");
});

it("Round 2 preserves native and custom JSON serialization", () => {
  let output = "";
  const logger = pino(logOptions, { write: chunk => { output += chunk; } });
  logger.info({ url: new URL("https://example.test/path"), buffer: Buffer.from("ok"),
    bytes: new Uint8Array([1, 2]), date: new Date("2026-10-28T00:00:00Z"),
    custom: { toJSON: () => ({ visible: true, recipient: "private-address" }) } });
  const row = JSON.parse(output);
  expect(row.url).toBe("https://example.test/path");
  expect(row.buffer).toEqual({ type: "Buffer", data: [111, 107] });
  expect(row.bytes).toEqual({ 0: 1, 1: 2 });
  expect(row.date).toBe("2026-10-28T00:00:00.000Z");
  expect(row.custom).toEqual({ visible: true, recipient: "[Redacted]" });
});

it.each(["to", "user_email", "recipient", "email_to"])("Round 2 redacts the %s email alias", field => {
  let output = "";
  const logger = pino(logOptions, { write: chunk => { output += chunk; } });
  logger.info({ [field]: "private-email", context: { [field.toUpperCase()]: "private-email" } });
  expect(JSON.parse(output)[field]).toBe("[Redacted]");
  expect(JSON.parse(output).context[field.toUpperCase()]).toBe("[Redacted]");
  expect(output).not.toContain("private-email");
});
it("Round 2 serializes a URL as its string", () => {
  let output = "";
  pino(logOptions, { write: chunk => { output += chunk; } }).info({ url: new URL("https://example.test/path") });
  expect(JSON.parse(output).url).toBe("https://example.test/path");
});

// Built at runtime so the source holds no string a secret scanner reads as a live key.
const fakeKey = (kind: string, tail: string) => [kind, tail].join("_");

it("H8 redacts customer inputs, API keys, auth headers, payment payloads and emails before a line leaves the process", () => {
  let output = "";
  const logger = pino(logOptions, { write: chunk => { output += chunk; } });
  logger.error({
    label: "h8-shapes",
    input: { company_name: "private-input-a" }, inputs: { org: "private-input-b" }, body: "private-input-c",
    capability_input: { iban: "private-input-d" }, request_body: "private-input-e",
    headers: { cookie: "private-cookie", "x-api-key": "private-header-key", "proxy-authorization": "private-proxy" },
    payment_payload: { signature: "private-pay" }, paymentPayload: "private-pay-2", payload: "private-pay-3",
    secret: "private-secret", client_secret: "private-client-secret",
    note: `caller ${fakeKey("sk", "live_0123456789abcdef")} wrote to someone@example.com with Bearer abc.def-ghi`,
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl",
    err: new Error(`upstream rejected ${fakeKey("whsec", "test_0123456789")} for ops@strale.io`),
    slug: "visible-slug",
  }, `charged person.name@example.org using ${fakeKey("sk", "test_00000000aaaaaaaa")}`);
  for (const leaked of ["private-", "sk_live_", "sk_test_", "whsec_", "@example.", "@strale.io", "abc.def-ghi", "eyJhbGci"]) {
    expect(output).not.toContain(leaked);
  }
  const row = JSON.parse(output);
  expect(row.slug).toBe("visible-slug"); expect(row.label).toBe("h8-shapes");
  expect(row.msg).toBe("charged [Redacted email] using [Redacted key]");
  expect(row.note).toBe("caller [Redacted key] wrote to [Redacted email] with Bearer [Redacted]");
  expect(row.err.message).toBe("upstream rejected [Redacted key] for [Redacted email]");
});

it("H8 review: scrubbing a long unbroken caller string stays fast and bounded", () => {
  let output = "";
  const logger = pino(logOptions, { write: chunk => { output += chunk; } });
  const started = performance.now();
  logger.warn({ err: "a".repeat(100_000), jwt: `eyJ${"b".repeat(100_000)}` }, "x".repeat(100_000));
  expect(performance.now() - started).toBeLessThan(250);
  expect(output.length).toBeLessThan(60_000);
  expect(JSON.parse(output).err).toContain("…[truncated 83616 chars]");
});

it("H8 review: an Error logged alone gets a scrubbed message", () => {
  let output = "";
  pino(logOptions, { write: chunk => { output += chunk; } }).error(new Error(`bad key ${fakeKey("sk", "live_abcdef12")} for a@b.com`));
  expect(JSON.parse(output).msg).toBe("bad key [Redacted key] for [Redacted email]");
  expect(output).not.toContain("sk_live_"); expect(output).not.toContain("a@b.com");
});

it("H8 review: secrets in query strings are scrubbed", () => {
  let output = "";
  pino(logOptions, { write: chunk => { output += chunk; } }).info({ url: "https://h.test/x?api_key=SECRET1&q=ok&email=foo%40bar.com&token=SECRET2" });
  expect(JSON.parse(output).url).toBe("https://h.test/x?api_key=[Redacted]&q=ok&email=[Redacted]&token=[Redacted]");
});
