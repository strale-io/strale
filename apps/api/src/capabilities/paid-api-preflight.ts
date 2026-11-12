import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { validateUrl } from "../lib/url-validator.js";

registerCapability("paid-api-preflight", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? "").trim();
  if (!url) throw new Error("'url' is required. Provide a paid API endpoint URL to check.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const issues: string[] = [];
  // ssl_valid is true only when a TLS connection to the URL that answered
  // completed with a certificate the runtime trusts (undici verifies the chain
  // and host name by default). It used to be the URL's scheme alone, so an
  // expired or self-signed certificate, or a redirect to plain http, still
  // read as valid HTTPS (promise-audit T1 follow-up 32).
  let sslValid = false;
  const httpsRequested = fullUrl.startsWith("https://");
  if (!httpsRequested) issues.push("Endpoint does not use HTTPS");

  const start = Date.now();

  let statusCode = 0;
  let responseHeaders: Record<string, string> = {};
  let isReachable = false;
  let server: string | null = null;

  try {
    const res = await safeFetch(fullUrl, {
      purpose: "availability_probe",
      method: "GET",
      headers: {
        "User-Agent": "Strale/1.0 (paid-api-preflight; admin@strale.io)",
        Accept: "application/json, */*",
      },
      // redirect handling: safeFetch follows up to 3 hops with per-hop re-validation
      signal: AbortSignal.timeout(10000),
    });

    statusCode = res.status;
    isReachable = true;
    // res.url is the hop that answered (safeFetch follows redirects itself);
    // a test double's Response has no url, so fall back to the request URL.
    // Both ends must be https: an http URL that redirects to https has already
    // sent its first request, payment header included, in cleartext.
    sslValid = httpsRequested && (res.url || fullUrl).startsWith("https://");
    if (httpsRequested && !sslValid) issues.push("Redirected from HTTPS to plain HTTP");
    responseHeaders = Object.fromEntries(res.headers.entries());
    server = res.headers.get("server");

    // Release the socket WITHOUT materializing the body (#432). A
    // preflight reads status, headers and timing only, so nothing here
    // wants the bytes — reading them to throw them away was the one site
    // in the ledger where the fix is a drain, not a cap. discardBody
    // cancels the stream and logs a cancel failure rather than
    // swallowing it.
    await discardBody(res, "paid-api-preflight: status and headers only");
  } catch (err) {
    if (isCapabilityRefusal(err)) throw err;
    const responseTimeMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    const tlsCode = tlsErrorCode(err);
    if (tlsCode) {
      issues.push(
        tlsCode.startsWith("ERR_SSL_")
          ? `TLS handshake failed: ${tlsCode}`
          : `TLS certificate rejected: ${tlsCode}`,
      );
    }
    return {
      output: {
        url: fullUrl,
        is_reachable: false,
        response_time_ms: responseTimeMs,
        status_code: 0,
        ssl_valid: false,
        payment_protocol: "unknown",
        payment_details: {},
        payment_handshake_valid: false,
        facilitator_reachable: null,
        server: null,
        recommendation: "avoid",
        issues: [...issues, `Unreachable: ${msg}`],
      },
      provenance: { source: "http-request", fetched_at: new Date().toISOString() },
    };
  }

  const responseTimeMs = Date.now() - start;

  // ─── Detect payment protocol ──────────────────────────────────────────

  let paymentProtocol = "unknown";
  let paymentDetails: Record<string, unknown> = {};
  let handshakeValid = false;
  let facilitatorReachable: boolean | null = null;

  if (statusCode === 402) {
    const wwwAuth = responseHeaders["www-authenticate"] ?? "";
    const paymentRequired = responseHeaders["payment-required"] ?? "";

    if (wwwAuth.toLowerCase().startsWith("l402")) {
      paymentProtocol = "L402";
      paymentDetails = parseL402(wwwAuth);
      handshakeValid = !!paymentDetails.has_macaroon && !!paymentDetails.has_invoice;
      if (!paymentDetails.has_macaroon) issues.push("L402: macaroon missing from header");
      if (!paymentDetails.has_invoice) issues.push("L402: BOLT11 invoice missing from header");
    } else if (paymentRequired) {
      paymentProtocol = "x402";
      const parsed = parseX402(paymentRequired);
      paymentDetails = parsed.details;
      handshakeValid = parsed.valid;
      if (!parsed.valid) {
        issues.push(...parsed.issues);
      }
      // Check facilitator reachability
      if (parsed.facilitatorUrl) {
        facilitatorReachable = await checkFacilitator(parsed.facilitatorUrl);
        if (!facilitatorReachable) issues.push("x402: facilitator endpoint unreachable");
      }
    } else if (wwwAuth.toLowerCase().startsWith("payment")) {
      paymentProtocol = "MPP";
      paymentDetails = parseMPP(wwwAuth);
      handshakeValid = !!paymentDetails.has_method && (!!paymentDetails.has_intent || !!paymentDetails.has_request);
      if (!paymentDetails.has_method) issues.push("MPP: payment method missing");
      if (!paymentDetails.has_intent && !paymentDetails.has_request) issues.push("MPP: neither intent nor request field present");
    } else {
      issues.push("HTTP 402 returned but no recognized payment protocol headers found");
    }
  } else if (statusCode >= 500) {
    issues.push(`Server error: HTTP ${statusCode}`);
  } else if (statusCode !== 402) {
    // Not a 402 — might not be a paid API, or requires specific params
    paymentDetails = { note: "Endpoint did not return HTTP 402. It may require specific request parameters to trigger the paywall." };
  }

  if (responseTimeMs > 5000) issues.push(`Slow response: ${responseTimeMs}ms`);

  // ─── Recommendation ───────────────────────────────────────────────────

  let recommendation: string;
  if (!isReachable || statusCode >= 500 || !sslValid) {
    recommendation = "avoid";
  } else if (statusCode === 402 && handshakeValid && responseTimeMs <= 5000 && sslValid) {
    if (facilitatorReachable === false) {
      recommendation = "caution";
    } else {
      recommendation = "proceed";
    }
  } else if (statusCode === 402) {
    recommendation = "caution";
  } else {
    // Non-402 — could be a valid free endpoint or needs specific params
    recommendation = statusCode >= 200 && statusCode < 400 ? "proceed" : "caution";
  }

  return {
    output: {
      url: fullUrl,
      is_reachable: isReachable,
      response_time_ms: responseTimeMs,
      status_code: statusCode,
      ssl_valid: sslValid,
      payment_protocol: paymentProtocol,
      payment_details: paymentDetails,
      payment_handshake_valid: handshakeValid,
      facilitator_reachable: facilitatorReachable,
      server,
      recommendation,
      issues,
    },
    provenance: { source: "http-request", fetched_at: new Date().toISOString() },
  };
});

// ─── TLS failure detection ──────────────────────────────────────────────────

// Node's TLS layer (and undici, which wraps it as the cause of "fetch failed")
// reports certificate failures with these codes, and handshake or protocol
// failures with an ERR_SSL_ prefix. Matching the codes rather
// than message text keeps a timeout or DNS failure from reading as a bad
// certificate.
const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "CERT_SIGNATURE_FAILURE",
  "ERROR_IN_CERT_NOT_BEFORE_FIELD",
  "ERROR_IN_CERT_NOT_AFTER_FIELD",
  "HOSTNAME_MISMATCH",
  "INVALID_CA",
  "INVALID_PURPOSE",
  "CERT_CHAIN_TOO_LONG",
  "PATH_LENGTH_EXCEEDED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

export function tlsErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && (TLS_ERROR_CODES.has(code) || code.startsWith("ERR_TLS_") || code.startsWith("ERR_SSL_"))) {
      return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

// ─── Protocol parsers ───────────────────────────────────────────────────────

function parseL402(header: string): Record<string, unknown> {
  const hasMacaroon = /macaroon\s*=\s*"([^"]+)"/i.test(header);
  const invoiceMatch = header.match(/invoice\s*=\s*"([^"]+)"/i);
  const hasInvoice = invoiceMatch
    ? /^ln(bc|tb)/i.test(invoiceMatch[1])
    : false;

  return {
    has_macaroon: hasMacaroon,
    has_invoice: hasInvoice,
    raw_header: header.slice(0, 200),
  };
}

function parseX402(header: string): {
  details: Record<string, unknown>;
  valid: boolean;
  issues: string[];
  facilitatorUrl: string | null;
} {
  const issues: string[] = [];
  let facilitatorUrl: string | null = null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const data = JSON.parse(decoded) as Record<string, unknown>;

    const accepts = Array.isArray(data.accepts) ? data.accepts as Array<Record<string, unknown>> : [];
    const hasAccepts = accepts.length > 0;

    // payTo can be at top level OR inside each accepts entry (x402 v2)
    const topPayTo = typeof data.payTo === "string" && data.payTo.length > 0;
    const entryPayTo = accepts.some((a) => typeof a.payTo === "string" && (a.payTo as string).length > 0);
    const hasPayTo = topPayTo || entryPayTo;

    if (!hasAccepts) issues.push("x402: accepts[] array missing or empty");
    if (!hasPayTo) issues.push("x402: payTo address missing");

    // Extract facilitator URL from accepts entries
    for (const entry of accepts) {
      if (typeof entry.extra === "object" && entry.extra !== null) {
        const extra = entry.extra as Record<string, unknown>;
        if (typeof extra.facilitatorUrl === "string") {
          facilitatorUrl = extra.facilitatorUrl;
          break;
        }
      }
    }

    const firstAccept = accepts[0] ?? {};

    return {
      details: {
        has_accepts: hasAccepts,
        has_pay_to: hasPayTo,
        has_facilitator: !!facilitatorUrl,
        x402_version: data.x402Version ?? null,
        network: firstAccept.network ?? null,
        scheme: firstAccept.scheme ?? null,
        amount: firstAccept.amount ?? null,
        asset_name: (firstAccept.extra as Record<string, unknown>)?.name ?? null,
      },
      valid: hasAccepts && hasPayTo,
      issues,
      facilitatorUrl,
    };
  } catch {
    return {
      details: { parse_error: true, raw_header: header.slice(0, 100) },
      valid: false,
      issues: ["x402: payment-required header is not valid base64-encoded JSON"],
      facilitatorUrl: null,
    };
  }
}

function parseMPP(header: string): Record<string, unknown> {
  const params: Record<string, string> = {};
  // Parse key="value" or key=value pairs after "Payment"
  const pairs = header.replace(/^Payment\s*/i, "").matchAll(/(\w+)\s*=\s*"?([^",\s]+)"?/g);
  for (const match of pairs) {
    params[match[1].toLowerCase()] = match[2];
  }

  return {
    has_id: !!params.id,
    has_realm: !!params.realm,
    has_method: !!params.method,
    has_intent: !!params.intent,
    has_request: !!params.request,
    id: params.id ?? null,
    realm: params.realm ?? null,
    method: params.method ?? null,
  };
}

async function checkFacilitator(url: string): Promise<boolean> {
  try {
    const res = await safeFetch(url, {
      purpose: "availability_probe",
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok || res.status < 500;
  } catch (err) {
    if (isCapabilityRefusal(err)) throw err;
    return false;
  }
}
