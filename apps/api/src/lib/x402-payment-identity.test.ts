import { describe, expect, it } from "vitest";
import { hashPaymentHeader, paymentAuthorizationIdentity } from "./x402-gateway.js";

const FROM = "0x1234567890AbcdEF1234567890aBcdef12345678";
const NONCE = `0x${"ab".repeat(32)}`;
const OTHER = `0x${"99".repeat(20)}`;

function v1Payload(from = FROM, nonce = NONCE) {
  return {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature: `0x${"11".repeat(65)}`,
      authorization: { from, to: `0x${"22".repeat(20)}`, value: "20000", validAfter: "0", validBefore: "9999999999", nonce },
    },
  };
}

function v2Payload(from = FROM, nonce = NONCE) {
  return {
    x402Version: 2,
    accepted: { scheme: "exact", network: "eip155:8453", amount: "20000" },
    payload: v1Payload(from, nonce).payload,
  };
}

function permit2Authorization(from = OTHER, nonce = "12345") {
  return {
    from,
    permitted: { token: `0x${"33".repeat(20)}`, amount: "20000" },
    spender: `0x${"44".repeat(20)}`,
    nonce,
    deadline: "9999999999",
    witness: { to: `0x${"22".repeat(20)}`, validAfter: "0" },
  };
}

function v2Permit2Payload(permit = permit2Authorization()) {
  return {
    x402Version: 2,
    accepted: { scheme: "exact", network: "eip155:8453", amount: "20000" },
    payload: { signature: `0x${"55".repeat(65)}`, permit2Authorization: permit },
  };
}

const b64 = (value: unknown, spacing?: number) => Buffer.from(JSON.stringify(value, null, spacing)).toString("base64");

describe("hashPaymentHeader keys on the signed authorization, not the header's spelling", () => {
  const canonical = b64(v1Payload());
  // A field whose bytes encode to "+" and "/" in standard base64, so the
  // URL-safe spelling really differs from the standard one.
  const withSymbols = b64({ ...v1Payload(), note: "~~~???>>>" });
  const urlSafe = withSymbols.replace(/\+/g, "-").replace(/\//g, "_");

  it.each([
    ["base64 padding removed", canonical.replace(/=+$/, "")],
    ["surrounding whitespace", ` ${canonical}\n`],
    ["re-spaced JSON", b64(v1Payload(), 2)],
    ["reordered keys", b64({ payload: v1Payload().payload, network: "base", scheme: "exact", x402Version: 1 })],
    ["payer and nonce in upper-case hex", b64(v1Payload(FROM.toUpperCase().replace("0X", "0x"), NONCE.toUpperCase().replace("0X", "0x")))],
    ["a different signature over the same authorization", b64({ ...v1Payload(), payload: { ...v1Payload().payload, signature: `0x${"33".repeat(65)}` } })],
  ])("%s gives the same key", (_label, variant) => {
    expect(variant).not.toBe(canonical);
    expect(hashPaymentHeader(variant)).toBe(hashPaymentHeader(canonical));
  });

  it("gives the URL-safe spelling of a header the same key as its standard spelling", () => {
    expect(urlSafe).not.toBe(withSymbols);
    expect(hashPaymentHeader(urlSafe)).toBe(hashPaymentHeader(withSymbols));
  });

  it("is the same key for the v1 and v2 envelopes of one authorization", () => {
    expect(hashPaymentHeader(b64(v2Payload()))).toBe(hashPaymentHeader(canonical));
  });

  it("separates different nonces and different payers", () => {
    const otherNonce = b64(v1Payload(FROM, `0x${"cd".repeat(32)}`));
    const otherPayer = b64(v1Payload(OTHER, NONCE));
    expect(hashPaymentHeader(otherNonce)).not.toBe(hashPaymentHeader(canonical));
    expect(hashPaymentHeader(otherPayer)).not.toBe(hashPaymentHeader(canonical));
  });

  it("keeps the 32-hex-character key shape stored in transactions and intents", () => {
    expect(hashPaymentHeader(canonical)).toMatch(/^[0-9a-f]{32}$/);
    expect(hashPaymentHeader(b64(v2Permit2Payload()))).toMatch(/^[0-9a-f]{32}$/);
    expect(hashPaymentHeader("not base64 json")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("falls back to the header text when no authorization can be read", () => {
    expect(paymentAuthorizationIdentity("not base64 json")).toBeNull();
    expect(paymentAuthorizationIdentity(b64({ payload: { authorization: { from: "0x12", nonce: NONCE } } }))).toBeNull();
    expect(paymentAuthorizationIdentity(b64({ payload: { authorization: { from: FROM, nonce: 7 } } }))).toBeNull();
    expect(hashPaymentHeader("header-a")).not.toBe(hashPaymentHeader("header-b"));
  });

  it("reads the identity in lower case", () => {
    expect(paymentAuthorizationIdentity(canonical)).toEqual({ kind: "authorization", from: FROM.toLowerCase(), nonce: NONCE });
  });
});

describe("hashPaymentHeader reads the object the facilitator verifies", () => {
  const victim = hashPaymentHeader(b64(v1Payload()));

  it("never gives a Permit2 payload the key of an EIP-3009 authorization it also carries", () => {
    // The facilitator verifies permit2Authorization when the key is present and
    // never reads authorization, so the victim's (payer, nonce) here is unchecked.
    const forged = { ...v2Permit2Payload(), payload: { ...v2Permit2Payload().payload, authorization: v1Payload().payload.authorization } };
    expect(paymentAuthorizationIdentity(b64(forged))).toBeNull();
    expect(hashPaymentHeader(b64(forged))).not.toBe(victim);
    expect(hashPaymentHeader(b64({ ...forged, x402Version: 1 }))).not.toBe(victim);
  });

  it("keys a v2 Permit2 payload on its own owner and nonce, apart from EIP-3009 keys", () => {
    const identity = paymentAuthorizationIdentity(b64(v2Permit2Payload()));
    expect(identity).toEqual({ kind: "permit2", from: OTHER, nonce: "12345" });
    const sameAsEip3009 = b64(v1Payload(OTHER, `0x${(12345).toString(16).padStart(64, "0")}`));
    expect(hashPaymentHeader(b64(v2Permit2Payload()))).not.toBe(hashPaymentHeader(sameAsEip3009));
  });

  it("gives one Permit2 nonce one key whether written in decimal or hex, and in any spelling", () => {
    const decimal = b64(v2Permit2Payload());
    expect(hashPaymentHeader(b64(v2Permit2Payload(permit2Authorization(OTHER, "0x3039"))))).toBe(hashPaymentHeader(decimal));
    expect(hashPaymentHeader(b64(v2Permit2Payload(), 2))).toBe(hashPaymentHeader(decimal));
    expect(hashPaymentHeader(b64(v2Permit2Payload(permit2Authorization(OTHER, "12346"))))).not.toBe(hashPaymentHeader(decimal));
  });

  it("does not trust an authorization next to any key the clients never send", () => {
    const extra = { ...v1Payload(), payload: { ...v1Payload().payload, futureAuthorization: { from: OTHER } } };
    expect(paymentAuthorizationIdentity(b64(extra))).toBeNull();
    expect(hashPaymentHeader(b64(extra))).not.toBe(victim);
  });

  it("does not read Permit2 on a v1 payload, where no facilitator verifies it", () => {
    expect(paymentAuthorizationIdentity(b64({ ...v2Permit2Payload(), x402Version: 1 }))).toBeNull();
  });
});
