/**
 * x402 Payment Gateway — per-request USDC payments for AI agents.
 *
 * Enables agents to pay for Strale capabilities per-call using USDC on Base.
 * No signup, no API key, no human in the loop.
 *
 * Flow:
 * 1. Agent requests paid capability without auth → gets HTTP 402 with price
 * 2. Agent signs USDC transfer authorization
 * 3. Agent retries with X-PAYMENT header containing signed proof
 * 4. Facilitator verifies and settles on-chain
 * 5. Capability executes and returns result
 *
 * Testnet (Base Sepolia): free x402.org facilitator, no CDP keys needed
 * Mainnet (Base): Coinbase CDP facilitator with API keys
 */

import { HTTPFacilitatorClient } from "@x402/core/server";
import { createHash } from "node:crypto";
import { parsePaymentPayload } from "@x402/core/schemas";
import { createFacilitatorConfig } from "@coinbase/x402";
import { log, logError } from "./log.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS ?? "";
// x402 v1 simple network names ("base", "base-sepolia") for compatibility
// with the canonical x402-fetch client. See x402-gateway-v2.ts for rationale.
const NETWORK = process.env.X402_NETWORK ?? "base-sepolia";

// x402 v2 uses CAIP-2 network identifiers; v1 uses bare names. The zod
// schemas enforce this split (NetworkSchemaV2 requires a ":"), so the two
// challenge/payload generations cannot share a network string.
const CAIP2_BY_NETWORK: Record<string, string> = {
  base: "eip155:8453",
  "base-sepolia": "eip155:84532",
};

export function networkToCaip2(network: string): string {
  if (network.includes(":")) return network;
  return CAIP2_BY_NETWORK[network] ?? network;
}
const EUR_USD_RATE = parseFloat(process.env.EUR_USD_RATE ?? "1.08");
if (!Number.isFinite(EUR_USD_RATE) || EUR_USD_RATE <= 0) {
  // Fail fast at module load: a malformed env value ("1,085", "") would
  // otherwise emit maxAmountRequired: "NaN" on every 402.
  throw new Error(`EUR_USD_RATE is not a positive number: "${process.env.EUR_USD_RATE}"`);
}
// Integer micro-USD rate for exact conversion. Float arithmetic on the raw
// rate produced machine-surface artifacts (catalog `price_usd:
// 0.21600000000000003`) and a systematic +1 atomic-unit overcharge in
// settlement (ceil(216000.00000000003) = 216001). All conversions below go
// through integer micro-USD so advertised price and settled amount agree
// exactly. P1 machine-surface audit finding, 2026-08-12.
const EUR_USD_RATE_MICRO = Math.round(EUR_USD_RATE * 1_000_000);

/** EUR cents → integer micro-USD (= USDC atomic units), rounded up. */
function eurCentsToMicroUsd(eurCents: number): number {
  return Math.ceil((eurCents * EUR_USD_RATE_MICRO) / 100);
}

// USDC contract addresses
const USDC_CONTRACTS: Record<string, string> = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // Base mainnet
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Base Sepolia
};

const USDC_ADDRESS = USDC_CONTRACTS[NETWORK] ?? USDC_CONTRACTS["base-sepolia"];

/** Whether x402 is configured (wallet address set). */
export function isX402Configured(): boolean {
  return WALLET_ADDRESS.length > 0;
}

// ─── Facilitator selection ──────────────────────────────────────────────────
//
// Which facilitator processes verify/settle is a money-path decision, so it is
// an explicit, reviewable config switch rather than an implicit consequence of
// which credentials happen to be present.
//
// `X402_FACILITATOR` selects the mode:
//
//   auto    (default) — Base mainnet + CDP keys present → CDP; otherwise the
//                       HTTP facilitator at X402_FACILITATOR_URL. This is the
//                       historical behaviour, kept as the default so deploying
//                       this change alone moves no traffic.
//   cdp               — always Coinbase's CDP facilitator. Requires
//                       CDP_API_KEY_ID + CDP_API_KEY_SECRET; refuses to start
//                       without them (see below). This is the rollout target.
//   legacy            — always the HTTP facilitator at X402_FACILITATOR_URL,
//                       even when CDP keys are present. This is the rollback
//                       lever: flipping back does not require deleting keys.
//
// Why the rollout matters (2026-08-12 distribution audit): the CDP Bazaar —
// the discovery index behind Agentic.Market and several downstream
// aggregators — catalogues a resource when *its own facilitator* processes a
// PaymentPayload carrying the bazaar extension. Strale already emits a
// complete `extensions.bazaar` block on every 402 (see buildBazaarDiscovery in
// routes/x402-gateway-v2.ts), but it is emitted into a facilitator that does
// not catalogue it. Routing settlement through CDP makes the whole paid
// catalog self-index off organic traffic.
//
// This switch changes only WHICH facilitator is called. It does not touch the
// verify → execute → settle ordering (DEC-14); both callers below are
// unchanged, and x402-gateway-v2.settlement-order.test.ts still pins the
// ordering at the route layer.

/** Coinbase CDP facilitator base URL, from @coinbase/x402's createFacilitatorConfig. */
export const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

/** Facilitator used when no X402_FACILITATOR_URL is configured. */
export const DEFAULT_LEGACY_FACILITATOR_URL = "https://x402.org/facilitator";

export type FacilitatorMode = "auto" | "cdp" | "legacy";

export interface FacilitatorSelection {
  /** The facilitator the payment path will actually call. */
  kind: "cdp" | "legacy";
  /** Its URL — also what discovery surfaces must advertise. */
  url: string;
  /** The configured mode that produced this selection. */
  mode: FacilitatorMode;
}

/** Env slice the selection depends on. Passed explicitly so it is testable. */
export interface FacilitatorEnv {
  X402_FACILITATOR?: string;
  X402_FACILITATOR_URL?: string;
  X402_NETWORK?: string;
  CDP_API_KEY_ID?: string;
  CDP_API_KEY_SECRET?: string;
}

const FACILITATOR_MODES: readonly FacilitatorMode[] = ["auto", "cdp", "legacy"];

function isMainnetNetwork(network: string): boolean {
  return network === "base" || network === "eip155:8453";
}

/**
 * Resolve which facilitator to use from environment configuration.
 *
 * Pure — no module state, no side effects — so the selection matrix can be
 * unit-tested without touching process.env or constructing a client.
 *
 * @throws if X402_FACILITATOR is set to an unknown value, or is set to "cdp"
 *   without both CDP credentials. Failing loudly is deliberate: @coinbase/x402
 *   builds an unauthenticated config when keys are absent, so a silent fallback
 *   would produce 401s from CDP on every paid call — or, worse, look like a
 *   successful cutover while nothing indexes.
 */
export function resolveFacilitatorSelection(env: FacilitatorEnv): FacilitatorSelection {
  const raw = (env.X402_FACILITATOR ?? "").trim().toLowerCase();
  const mode = (raw === "" ? "auto" : raw) as FacilitatorMode;
  if (!FACILITATOR_MODES.includes(mode)) {
    throw new Error(
      `X402_FACILITATOR must be one of ${FACILITATOR_MODES.join(" | ")}, got "${env.X402_FACILITATOR}"`,
    );
  }

  const legacyUrl = env.X402_FACILITATOR_URL?.trim() || DEFAULT_LEGACY_FACILITATOR_URL;
  const hasCdpKeys = Boolean(env.CDP_API_KEY_ID?.trim() && env.CDP_API_KEY_SECRET?.trim());

  if (mode === "legacy") {
    return { kind: "legacy", url: legacyUrl, mode };
  }

  if (mode === "cdp") {
    if (!hasCdpKeys) {
      throw new Error(
        "X402_FACILITATOR=cdp requires both CDP_API_KEY_ID and CDP_API_KEY_SECRET. " +
          "Set them, or use X402_FACILITATOR=legacy.",
      );
    }
    // Deliberately not gated on mainnet: running mode=cdp against
    // base-sepolia is the supported way to rehearse the switch before
    // pointing production traffic at it.
    return { kind: "cdp", url: CDP_FACILITATOR_URL, mode };
  }

  // auto — the pre-switch rule, preserved exactly.
  const network = env.X402_NETWORK ?? "base-sepolia";
  if (isMainnetNetwork(network) && hasCdpKeys) {
    return { kind: "cdp", url: CDP_FACILITATOR_URL, mode };
  }
  return { kind: "legacy", url: legacyUrl, mode };
}

// Resolve once at module load so a misconfiguration surfaces at boot rather
// than on the first paid call. Mirrors the EUR_USD_RATE fail-fast above: a
// config error that only appears mid-payment is far more expensive than one
// that stops the deploy.
// Cast: ProcessEnv is an index-signature type, so TS's weak-type check rejects
// it against FacilitatorEnv's all-optional shape. The value shapes match
// (string | undefined), and every field is read defensively above.
const FACILITATOR_SELECTION = resolveFacilitatorSelection(process.env as FacilitatorEnv);

/** The facilitator selection this process is running with. */
export function getFacilitatorSelection(): FacilitatorSelection {
  return FACILITATOR_SELECTION;
}

/**
 * The facilitator URL discovery surfaces must advertise.
 *
 * `/x402/catalog` and `/.well-known/x402.json` previously hardcoded
 * X402_FACILITATOR_URL, which would have advertised x402.org while payments
 * actually settled through CDP. Both now read this.
 */
export function getFacilitatorUrl(): string {
  return FACILITATOR_SELECTION.url;
}

// ─── Facilitator client (lazy init) ─────────────────────────────────────────

let _facilitator: HTTPFacilitatorClient | null = null;

function getFacilitator(): HTTPFacilitatorClient {
  if (_facilitator) return _facilitator;

  if (FACILITATOR_SELECTION.kind === "cdp") {
    // createFacilitatorConfig supplies the CDP base URL plus a JWT
    // createAuthHeaders hook; the keys are known present (validated above).
    const config = createFacilitatorConfig(
      process.env.CDP_API_KEY_ID,
      process.env.CDP_API_KEY_SECRET,
    );
    _facilitator = new HTTPFacilitatorClient(config);
  } else {
    _facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_SELECTION.url });
  }
  return _facilitator;
}

// ─── Price conversion ───────────────────────────────────────────────────────
//
// Single source of truth for x402 pricing: capabilities.price_cents (EUR) ×
// EUR_USD_RATE → USDC. Per DEC-20260308-1, EUR is the canonical platform
// currency; per DEC-20260502-A, x402 uses the same catalog price as the
// wallet path, converted at this single rate. See those decisions before
// reintroducing any per-channel discount.

/** Numeric USD value for a EUR-cent capability price (exact at 6 decimals). */
export function eurCentsToUsd(eurCents: number): number {
  return eurCentsToMicroUsd(eurCents) / 1_000_000;
}

/**
 * Convert EUR cents to USDC atomic units (6 decimals).
 * USDC is pegged to USD, so we convert EUR → USD → atomic. Identical integer
 * value to eurCentsToUsd × 1e6 by construction — advertised and settled
 * amounts cannot diverge.
 */
export function eurCentsToUsdcAtomic(eurCents: number): string {
  return eurCentsToMicroUsd(eurCents).toString();
}

export function eurCentsToUsdString(eurCents: number): string {
  // 6 decimals (micro-USD precision, matching the atomic amount exactly),
  // trailing zeros trimmed: 20c → "$0.216", 3c @1.085 → "$0.03255".
  const s = eurCentsToUsd(eurCents).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return `$${s}`;
}

// ─── 402 Response builder ───────────────────────────────────────────────────

/**
 * Which challenge generation the LEGACY paths (/x402/:slug, /v1/do) emit by
 * default. Defaults to 1: the schemas make a both-generations body
 * impossible — x402-fetch v1 zod-parses every accepts[] entry against a
 * strict bare-name network enum, while v2 validators require CAIP-2 — so
 * the legacy paths keep serving exactly what today's unknown-version payers
 * already parse, and the new /x402/v2/* alias paths serve v2. Setting
 * X402_CHALLENGE_VERSION=2 is the eventual cutover switch for the legacy
 * paths, to be flipped once verify-time version logging shows v1 payload
 * volume at zero. Read at call time so a redeploy with the env var flipped
 * takes effect without code changes.
 */
export function x402ChallengeVersion(): 1 | 2 {
  const raw = (process.env.X402_CHALLENGE_VERSION ?? "").trim();
  if (raw === "2" || raw.toLowerCase() === "v2") return 2;
  if (raw !== "" && raw !== "1" && raw.toLowerCase() !== "v1") {
    // Cutover switch: an unrecognized value silently changing the money
    // path would be worse than noise — log every call while it's set wrong.
    logError(
      "x402-challenge-version-unrecognized",
      new Error(`X402_CHALLENGE_VERSION="${raw}" not recognized; serving v1 on legacy paths`),
    );
  }
  return 1;
}

/**
 * Build an x402 Payment Required response for a capability (/v1/do path).
 *
 * Serves the generation selected by x402ChallengeVersion() (v1 today). The
 * v2 branch emits the v2 shape (x402Version 2, top-level ResourceInfo,
 * CAIP-2 network, `amount`) with the legacy v1 fields merged into the
 * accepts entry as extra keys (the v2 zod schemas are non-strict, so they
 * survive v2 validation) plus a pure v1 mirror under the legacy
 * `paymentRequirements` key — a hedge for hand-rolled v1 readers, though
 * canonical v1 libraries cannot parse any v2 body (strict network enum).
 */
export function build402Response(capability: {
  slug: string;
  name: string;
  priceCents: number;
}): {
  status: 402;
  body: Record<string, unknown>;
} {
  const priceUsd = eurCentsToUsdString(capability.priceCents);
  const atomic = eurCentsToUsdcAtomic(capability.priceCents);
  const description = `${capability.name}. Strale: the trust layer for AI agents.`;
  const error = `Payment required. ${capability.name} costs ${priceUsd} USDC per call.`;

  const v1Requirement = {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: atomic,
    resource: "/v1/do",
    description,
    payTo: WALLET_ADDRESS,
    mimeType: "application/json",
    asset: USDC_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" },
  };

  if (x402ChallengeVersion() === 1) {
    return {
      status: 402,
      body: { x402Version: 1, accepts: [v1Requirement], error },
    };
  }

  const mergedRequirement = {
    scheme: "exact",
    network: networkToCaip2(NETWORK),
    amount: atomic,
    asset: USDC_ADDRESS,
    payTo: WALLET_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" },
    // Legacy v1 fields for old clients that read accepts[0] directly:
    maxAmountRequired: atomic,
    resource: "/v1/do",
    description,
    mimeType: "application/json",
  };

  return {
    status: 402,
    body: {
      x402Version: 2,
      error,
      resource: { url: "/v1/do", description, mimeType: "application/json" },
      accepts: [mergedRequirement],
      // Legacy mirror in pure v1 shape (bare network name).
      paymentRequirements: [v1Requirement],
    },
  };
}

// ─── Payment verification ───────────────────────────────────────────────────

export interface X402VerificationResult {
  valid: boolean;
  settlementId?: string;
  error?: string;
}

export interface X402PaymentRequirement {
  resource?: string;
  description?: string;
  outputSchema?: Record<string, unknown>;
}

/**
 * WP4 removed `verifyX402Payment`, a combined verify-and-settle helper.
 *
 * It moved the USDC before the capability ran, so there was no output to assess
 * and no way for it to consult the canonical billing decision — a DEC-14
 * violation its own docstring acknowledged while pointing new code at the split
 * form. Nothing called it. It was deleted rather than documented because a
 * charge-before-execute helper sitting in the shared library is an invitation,
 * and WP4's exit condition ("no route decides billability independently")
 * cannot be guaranteed while one exists.
 *
 * Use `verifyX402PaymentOnly` to authorize, execute, then `settleX402Payment`.
 */


/**
 * Opaque handle returned by a successful verify. Pass it to
 * `settleX402Payment` once execution has succeeded to move the USDC on-chain.
 * Not serializable across process boundaries — discard if unused (the
 * on-chain authorization expires via `maxTimeoutSeconds`).
 */
export interface X402VerifiedPayment {
  payload: unknown;
  requirements: unknown;
}

export interface X402VerifyOnlyResult {
  valid: boolean;
  /** Only present when `valid === true`. Hand to `settleX402Payment` to finalize. */
  verified?: X402VerifiedPayment;
  error?: string;
}

export interface X402SettlementResult {
  valid: boolean;
  settlementId?: string;
  error?: string;
}

/**
 * Verify an x402 payment header without broadcasting the transaction.
 *
 * Non-destructive — checks the signed authorization is valid and covers the
 * quoted price, but does NOT settle on-chain. Hand the returned `verified`
 * handle to `settleX402Payment` after execution succeeds.
 *
 * Rationale: matches DEC-14 ("don't charge before execution succeeds"). Input
 * validation errors and capability failures no longer charge the caller —
 * their signed authorization simply expires unused.
 */
export async function verifyX402PaymentOnly(
  paymentHeader: string,
  priceCentsEur: number,
  priceUsdOverride?: number,
  requirementOverrides?: X402PaymentRequirement,
): Promise<X402VerifyOnlyResult> {
  if (!isX402Configured()) {
    return { valid: false, error: "x402 not configured (no wallet address)" };
  }

  try {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const parsed = parsePaymentPayload(JSON.parse(decoded));
    if (!parsed.success) {
      return { valid: false, error: `Invalid payment payload: ${parsed.error.message}` };
    }
    const payload = parsed.data;

    // Migration telemetry (2026-08-13): the v1→v2 challenge cutover for the
    // legacy paths is gated on this counter — flip X402_CHALLENGE_VERSION=2
    // only once v1 payload volume is zero. Also the only signal that a
    // pinned v1 payer population exists at all.
    log.info(
      { label: "x402-payment-payload-version", x402_version: payload.x402Version },
      "x402-payment-payload-version",
    );

    const priceAtomic =
      priceUsdOverride !== undefined
        // round, not ceil: the override is an exact micro-USD multiple from
        // eurCentsToUsd; ceil turned float round-trip error into +1 atomic.
        ? Math.round(priceUsdOverride * 1_000_000).toString()
        : eurCentsToUsdcAtomic(priceCentsEur);

    // The facilitator accepts both payload generations, but the requirements
    // we send must match the payload's x402Version: v1 pairs with the bare
    // network name + maxAmountRequired, v2 with CAIP-2 + amount (resource /
    // description / outputSchema live on the top-level ResourceInfo in v2,
    // not on the requirement).
    const isV2Payload = payload.x402Version === 2;

    // A v1 client that picked the merged accepts entry off the v2 challenge
    // echoes its CAIP-2 network. Normalize back to the bare v1 name before
    // verify: the network field is envelope routing metadata — the signed
    // EIP-712 authorization binds the chain via its domain separator, so
    // this rewrite cannot change what the payer authorized.
    if (!isV2Payload) {
      const p = payload as { network?: string };
      if (p.network === networkToCaip2(NETWORK)) {
        p.network = NETWORK;
      }
    }

    const requirements: Record<string, unknown> = isV2Payload
      ? {
          scheme: "exact",
          network: networkToCaip2(NETWORK),
          amount: priceAtomic,
          asset: USDC_ADDRESS,
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        }
      : {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: priceAtomic,
          resource: requirementOverrides?.resource ?? "/v1/do",
          description: requirementOverrides?.description ?? "Strale capability call",
          mimeType: "application/json",
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 300,
          asset: USDC_ADDRESS,
          extra: { name: "USD Coin", version: "2" },
        };
    if (!isV2Payload && requirementOverrides?.outputSchema) {
      requirements.outputSchema = requirementOverrides.outputSchema;
    }

    const facilitator = getFacilitator();
    const verifyResult = await facilitator.verify(payload as any, requirements as any);
    if (!verifyResult.isValid) {
      return { valid: false, error: verifyResult.invalidReason ?? "Payment invalid" };
    }

    return { valid: true, verified: { payload, requirements } };
  } catch (err) {
    logError("x402-verification-failed", err);
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Payment verification failed",
    };
  }
}

/**
 * Broadcast the settlement for a previously verified payment.
 *
 * Call only after the capability has successfully produced output. Errors here
 * are rare (verify already passed) but the facilitator can still reject if the
 * authorization has meanwhile been used or expired.
 */
export async function settleX402Payment(
  verified: X402VerifiedPayment,
): Promise<X402SettlementResult> {
  try {
    const facilitator = getFacilitator();
    const settleResult = await facilitator.settle(
      verified.payload as any,
      verified.requirements as any,
    );
    if (!settleResult.success) {
      const reason = settleResult.errorReason ?? "Settlement failed";
      reportSettlementFailure(reason);
      return { valid: false, error: reason };
    }
    return { valid: true, settlementId: settleResult.transaction ?? "settled" };
  } catch (err) {
    logError("x402-settlement-failed", err);
    reportSettlementFailure(err instanceof Error ? err.message : "Settlement failed");
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Settlement failed",
    };
  }
}

/**
 * Settle-failure classes that mean *every* payment is failing, not just this
 * one. These page immediately; per-payment failures (expired or already-used
 * authorization, payer balance) are left to the volume tripwire.
 *
 * Learned 2026-08-14: Coinbase's facilitator gives 1,000 free settlements per
 * month, then refuses with `payment-method-required` until a card is on file.
 * Strale crossed the threshold at settlement 1,009 and every settle failed for
 * 21 hours. Verify and execute kept succeeding, so nothing looked broken from
 * the inside — the only symptom was revenue quietly stopping, which the
 * volume tripwire cannot see until a full 24h window has aged out.
 */
const SYSTEMIC_SETTLE_PATTERNS: Array<{ pattern: RegExp; label: string; hint: string }> = [
  {
    pattern: /payment[-_ ]?method[-_ ]?required|valid payment method is required/i,
    label: "facilitator_billing",
    hint:
      "Coinbase CDP requires a payment method once the monthly free-settlement allowance is used. " +
      "Add or fix the card on the CDP entity that owns the API key in CDP_API_KEY_ID: " +
      "https://portal.cdp.coinbase.com → Billing. Settlement resumes immediately once saved.",
  },
  {
    pattern: /unauthorized|forbidden|invalid api key|authentication|401|403/i,
    label: "facilitator_auth",
    hint:
      "The facilitator rejected our credentials. Check CDP_API_KEY_ID / CDP_API_KEY_SECRET on " +
      "Railway, and that the key is still Enabled in the CDP portal.",
  },
  {
    pattern: /quota|rate limit|429|exceeded/i,
    label: "facilitator_quota",
    hint: "The facilitator is rate-limiting or quota-blocking settlement. Check the CDP portal for limits.",
  },
];

/**
 * Page immediately on settle failures that indicate a platform-wide stoppage.
 *
 * Fire-and-forget by design: this sits in the money path and must never add
 * latency to, or throw into, a payment. Deduplicated by class with a 6h
 * cooldown that survives restarts (see alert-once).
 */
function reportSettlementFailure(reason: string): void {
  const match = SYSTEMIC_SETTLE_PATTERNS.find((p) => p.pattern.test(reason));
  if (!match) return;

  void (async () => {
    try {
      const { alertOnce } = await import("./alert-once.js");
      await alertOnce(`x402-settle-${match.label}`, 6 * 60 * 60 * 1000, {
        severity: "critical",
        subject: `x402 settlement is failing — ${match.label.replace(/_/g, " ")}`,
        body:
          `Every x402 payment is currently failing at the settlement step.\n\n` +
          `Facilitator reason: ${reason}\n\n` +
          `What this means: callers are being verified and their capability is executing, ` +
          `but the on-chain settlement is refused — so they receive an error and are not ` +
          `charged. Revenue is stopped until this is resolved.\n\n` +
          `Fix: ${match.hint}\n\n` +
          `Verify recovery with a real call:\n` +
          `  curl -s https://api.strale.io/x402/vat-validate?vat_number=SE556703748501\n` +
          `(expect HTTP 402 with a challenge; a funded x402 client should then get 200).`,
      });
    } catch (err) {
      logError("x402-settle-alert-failed", err);
    }
  })();
}

/**
 * Extract the payer address (USDC `From`) from a verified payment.
 * For the "exact" scheme this is payload.authorization.from — the wallet that
 * signed the TransferWithAuthorization. Returns null if the shape doesn't match.
 */
export function extractPayerAddress(verified: X402VerifiedPayment): string | null {
  const outer = verified?.payload as Record<string, unknown> | undefined;
  const inner = outer?.payload as Record<string, unknown> | undefined;
  const auth = inner?.authorization as Record<string, unknown> | undefined;
  const from = auth?.from;
  return typeof from === "string" && from.startsWith("0x") ? from : null;
}

/**
 * Extract the x402 payment header from a request.
 *
 * Header names by protocol generation (@x402/core client,
 * encodePaymentSignatureHeader): v2 clients send PAYMENT-SIGNATURE, v1
 * clients send X-PAYMENT ("Payment" is a pre-v1 legacy name). Missing
 * PAYMENT-SIGNATURE made every canonical v2 payment invisible — the paid
 * retry just received a fresh challenge. Found by the first real-wallet
 * v2 settlement test (2026-08-14); the payload generations are
 * disambiguated downstream by parsePaymentPayload, not by header name.
 */
export function extractPaymentHeader(headers: Headers): string | null {
  return (
    headers.get("payment-signature") ??
    headers.get("x-payment") ??
    headers.get("payment") ??
    null
  );
}

/**
 * Encode an x402 settlement response for the X-PAYMENT-RESPONSE header.
 * Clients inspect this to learn the on-chain tx hash of a settled payment,
 * even on executions that subsequently returned 4xx.
 */
export function encodePaymentResponseHeader(settlementId: string): string {
  const payload = { success: true, transaction: settlementId, network: NETWORK };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Stable identifier for one payment authorization.
 *
 * Moved here in WP5 from routes/x402-gateway-v2.ts, where it was private. Both
 * the wildcard gateway and the /v1/do x402 path need it now — the gateway to
 * dedup replays, /v1/do to key its settlement intent — and two copies of a
 * hashing rule is how the two rails would silently stop agreeing about what
 * "the same payment" means.
 */
export function hashPaymentHeader(header: string): string {
  return createHash("sha256").update(header).digest("hex").slice(0, 32);
}
