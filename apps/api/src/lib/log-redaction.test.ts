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
