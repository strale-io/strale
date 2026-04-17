import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";

registerCapability("paid-api-preflight", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? "").trim();
  if (!url) throw new Error("'url' is required. Provide a paid API endpoint URL to check.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const issues: string[] = [];
  const sslValid = fullUrl.startsWith("https://");
  if (!sslValid) issues.push("Endpoint does not use HTTPS");

  const start = Date.now();

  let statusCode = 0;
  let responseHeaders: Record<string, string> = {};
  let isReachable = false;
  let server: string | null = null;

  try {
    const res = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Strale/1.0 (paid-api-preflight; admin@strale.io)",
        Accept: "application/json, */*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    statusCode = res.status;
    isReachable = true;
    responseHeaders = Object.fromEntries(res.headers.entries());
    server = res.headers.get("server");

    // Consume body to release the socket. Errors here are benign —
    // the only recoverable state is that the body was never materialized,
    // which is exactly the outcome we want for a preflight probe.
    await res.text().catch(() => undefined);
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      output: {
        url: fullUrl,
        is_reachable: false,
        response_time_ms: responseTimeMs,
        status_code: 0,
        ssl_valid: sslValid,
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
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}
