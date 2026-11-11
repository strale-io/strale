import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import type Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { SourceBlockedError } from "../lib/site-access.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

/**
 * The carrier's tracking page could not be read. Upstream failures (2026-11-06
 * swallowed-failures audit, row 34): a failed read used to fall back to the
 * check-digit answer, billed as tracking. It now throws, unbilled. A carrier
 * that refuses Strale throws its `SourceBlockedError` unchanged (DEC-20261023-A:
 * the call says the site refused us), and a refusal or an error that is already
 * classified passes through. Strale's own missing Browserless configuration is
 * returned unchanged, so a defect of ours is never filed as the carrier's.
 */
function trackingPageFailure(scrapeUrl: string, err: unknown): Error {
  if (err instanceof SourceBlockedError || err instanceof UpstreamUnavailableError || isCapabilityRefusal(err)) {
    return err as Error;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("BROWSERLESS_URL")) return err instanceof Error ? err : new Error(message);
  const host = new URL(scrapeUrl).hostname;
  const upstream = `carrier tracking page ${host}`;
  const status = /^URL returned HTTP (\d{3})/.exec(message)?.[1];
  if (status === "404" || status === "410") {
    return new UpstreamUnavailableError(upstream, `HTTP ${status}; the page is gone.`, {
      code: `HTTP ${status}`,
      retryable: false,
      cause: err,
    });
  }
  return new UpstreamUnavailableError(upstream, `the page could not be read${status ? ` (HTTP ${status})` : ""}; retry shortly.`, {
    code: status ? `HTTP ${status}` : null,
    cause: err,
  });
}

// ─── Container tracking — ISO 6346 validation + Browserless scraping ────────

// Character values for ISO 6346 check digit calculation
// Letters A-Z mapped to values 10-38, skipping multiples of 11
const CHAR_VALUES: Record<string, number> = {};
(() => {
  for (let i = 0; i < 10; i++) CHAR_VALUES[String(i)] = i;
  let val = 10;
  for (let c = 65; c <= 90; c++) {
    // A=65, Z=90
    CHAR_VALUES[String.fromCharCode(c)] = val;
    val++;
    if (val % 11 === 0) val++; // skip multiples of 11
  }
})();

// Common carrier owner code prefixes
const CARRIER_PREFIXES: Record<string, string> = {
  MAEU: "Maersk",
  MSKU: "Maersk",
  MRKU: "Maersk",
  MSCU: "MSC",
  MEDU: "MSC",
  CMAU: "CMA CGM",
  CGMU: "CMA CGM",
  HLCU: "Hapag-Lloyd",
  HLXU: "Hapag-Lloyd",
  EGLV: "Evergreen",
  EGHU: "Evergreen",
  OOLU: "OOCL",
  COSU: "COSCO",
  CCLU: "COSCO",
  CBHU: "COSCO",
  YMLU: "Yang Ming",
  YMMU: "Yang Ming",
  ONEY: "ONE (Ocean Network Express)",
  ONEU: "ONE (Ocean Network Express)",
  NYKU: "ONE (Ocean Network Express)",
  ZIMU: "ZIM",
  HJCU: "Hanjin (defunct)",
  HDMU: "Hyundai Merchant Marine (HMM)",
  KMTU: "Korea Marine Transport (HMM)",
  APLU: "APL (CMA CGM)",
  SUDU: "Hamburg Süd (Maersk)",
  SEGU: "Hamburg Süd (Maersk)",
  PONU: "PONL (Hapag-Lloyd)",
  TCLU: "Turkon",
  TEMU: "Triton (lessor)",
  TRLU: "Triton (lessor)",
  TTNU: "Triton (lessor)",
  FCIU: "Florens (lessor)",
  FSCU: "Florens (lessor)",
  TGHU: "Textainer (lessor)",
  GESU: "Gold (lessor)",
  GATU: "Gold (lessor)",
  UACU: "United Arab Shipping",
  WFHU: "Wan Hai",
  WHLU: "Wan Hai",
  PCIU: "Pacific International Lines",
  SMCU: "Samudera",
  ECMU: "Evergreen",
  BMOU: "Beacon Intermodal",
  CAIU: "CAI (lessor)",
  DRYU: "Dong Fang (lessor)",
  INBU: "Interpool",
  CRSU: "Cronos (lessor)",
  TCKU: "TransAmerica (lessor)",
};

/**
 * Validate container number per ISO 6346.
 * Format: 4 letters (owner code + category U/J/Z) + 6 digits + 1 check digit
 */
function validateContainerNumber(raw: string): {
  container_number: string;
  valid_format: boolean;
  check_digit_valid: boolean;
  owner_code: string;
  category: string;
  serial_number: string;
  check_digit: string;
  expected_check_digit: string | null;
  error?: string;
} {
  const cleaned = raw.replace(/[\s-]/g, "").toUpperCase();
  const match = cleaned.match(/^([A-Z]{3})([UJZ])(\d{6})(\d)$/);

  if (!match) {
    // Try to match without check digit
    const partialMatch = cleaned.match(/^([A-Z]{3})([UJZ])(\d{6,7})$/);
    if (partialMatch) {
      const [, owner, cat, digits] = partialMatch;
      return {
        container_number: cleaned,
        valid_format: false,
        check_digit_valid: false,
        owner_code: owner,
        category: cat,
        serial_number: digits.slice(0, 6),
        check_digit: digits.length === 7 ? digits[6] : "",
        expected_check_digit: null,
        error: "Container number format issue. Expected: 3 letters + U/J/Z + 6 digits + 1 check digit.",
      };
    }
    return {
      container_number: cleaned,
      valid_format: false,
      check_digit_valid: false,
      owner_code: "",
      category: "",
      serial_number: "",
      check_digit: "",
      expected_check_digit: null,
      error:
        "Invalid container number format. Expected ISO 6346: 4 letters (3 owner code + U/J/Z) + 6 digits + 1 check digit. Example: MAEU1234567.",
    };
  }

  const [, ownerCode, category, serialNumber, checkDigit] = match;
  const fullPrefix = ownerCode + category;

  // Calculate expected check digit per ISO 6346
  const chars = fullPrefix + serialNumber;
  let sum = 0;
  for (let i = 0; i < chars.length; i++) {
    const charVal = CHAR_VALUES[chars[i]];
    if (charVal === undefined) {
      return {
        container_number: cleaned,
        valid_format: false,
        check_digit_valid: false,
        owner_code: ownerCode,
        category,
        serial_number: serialNumber,
        check_digit: checkDigit,
        expected_check_digit: null,
        error: `Invalid character '${chars[i]}' at position ${i}.`,
      };
    }
    sum += charVal * Math.pow(2, i);
  }
  const remainder = sum % 11;
  const expectedCheckDigit = String(remainder % 10); // 10 becomes 0

  return {
    container_number: cleaned,
    valid_format: true,
    check_digit_valid: checkDigit === expectedCheckDigit,
    owner_code: ownerCode,
    category,
    serial_number: serialNumber,
    check_digit: checkDigit,
    expected_check_digit: expectedCheckDigit,
    ...(checkDigit !== expectedCheckDigit
      ? { error: `Check digit mismatch: got ${checkDigit}, expected ${expectedCheckDigit}.` }
      : {}),
  };
}

function detectCarrier(ownerCode: string, category: string): string | null {
  const prefix = ownerCode + category;
  // Try 4-char prefix first, then 3-char owner code
  if (CARRIER_PREFIXES[prefix]) return CARRIER_PREFIXES[prefix];
  // Try just owner code + common suffixes
  for (const [key, carrier] of Object.entries(CARRIER_PREFIXES)) {
    if (key.startsWith(ownerCode)) return carrier;
  }
  return null;
}

/**
 * Links returned for the caller to open by hand. Only the carriers in
 * {@link liveTrackingUrl} are ever fetched by Strale.
 */
function getTrackingUrls(containerNumber: string, carrier: string | null): Record<string, string> {
  const urls: Record<string, string> = {};

  if (carrier) {
    const carrierLower = carrier.toLowerCase();
    if (carrierLower.includes("maersk")) {
      // maersk.com/robots.txt disallows /tracking/<number> for every agent, so
      // Strale neither fetches nor links the per-container page; this is the
      // tracking form, which robots.txt allows (`Allow: /tracking/$`).
      urls.maersk = "https://www.maersk.com/tracking/";
    } else if (carrierLower.includes("msc")) {
      urls.msc = `https://www.msc.com/track-a-shipment?agencyPath=msc&trackingNumber=${containerNumber}`;
    } else if (carrierLower.includes("cma") || carrierLower.includes("apl")) {
      urls.cma_cgm = `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${containerNumber}`;
    } else if (carrierLower.includes("hapag")) {
      urls.hapag_lloyd = `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${containerNumber}`;
    } else if (carrierLower.includes("evergreen")) {
      urls.evergreen = `https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do?BLNo=${containerNumber}`;
    } else if (carrierLower.includes("oocl")) {
      urls.oocl = `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?ctnno=${containerNumber}`;
    } else if (carrierLower.includes("cosco")) {
      urls.cosco = `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${containerNumber}`;
    } else if (carrierLower.includes("yang ming")) {
      urls.yang_ming = `https://www.yangming.com/e-service/track-trace/track-trace.aspx?containerNo=${containerNumber}`;
    } else if (carrierLower.includes("one")) {
      urls.one = `https://ecomm.one-line.com/one-ecom/manage/cargo-tracking?ctrack-field=${containerNumber}`;
    } else if (carrierLower.includes("zim")) {
      urls.zim = `https://www.zim.com/tools/track-a-shipment?consnumber=${containerNumber}`;
    }
    // HMM: no link. hmm21.com/robots.txt disallows its tracking page
    // (weekly-drift robots sweep, 2026-11-02 onwards); track_trace covers it.
  }

  // A carrier-neutral link directory. (SeaRates was dropped on 2026-11-07:
  // its tracking URL now redirects to DP World's homepage.)
  urls.track_trace = `https://www.track-trace.com/container?number=${containerNumber}`;

  return urls;
}

/**
 * The one carrier page Strale reads for live status, or null when there is
 * none. Only carriers whose tracking page robots.txt allows are here:
 *   - Maersk (and Hamburg Süd) is not: maersk.com/robots.txt disallows
 *     /tracking/<number> (weekly-drift robots sweep, issue #747).
 *   - Every other carrier used to fall through to SeaRates, whose tracking URL
 *     now 301s to DP World's homepage, so those calls read a corporate homepage.
 */
function liveTrackingUrl(carrier: string | null, urls: Record<string, string>): string | null {
  const c = carrier?.toLowerCase() ?? "";
  if (c.includes("maersk")) return null;
  if (c.includes("msc")) return urls.msc ?? null;
  if (c.includes("cma") || c.includes("apl")) return urls.cma_cgm ?? null;
  if (c.includes("hapag")) return urls.hapag_lloyd ?? null;
  return null;
}

export const LIVE_TRACKING_CARRIERS = "MSC, CMA CGM (including APL) and Hapag-Lloyd";

registerCapability("container-track", async (input: CapabilityInput) => {
  const raw = (
    (input.container_number as string) ??
    (input.container as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!raw) {
    throw new Error(
      "'container_number' is required. Provide a container number (e.g. 'MAEU1234567').",
    );
  }

  // Extract container number from text if it contains other words
  const containerMatch = raw.match(/[A-Za-z]{3}[UJZujz]\s?\d{6,7}/);
  const containerStr = containerMatch ? containerMatch[0] : raw;

  // Validate container number
  const validation = validateContainerNumber(containerStr);
  const carrier =
    ((input.carrier as string) ?? "").trim() ||
    (validation.valid_format ? detectCarrier(validation.owner_code, validation.category) : null);
  const trackingUrls = getTrackingUrls(validation.container_number, carrier);

  // If container number is invalid, return just validation + carrier info
  if (!validation.valid_format) {
    return {
      output: {
        ...validation,
        carrier: carrier ?? "unknown",
        tracking_urls: trackingUrls,
        tracking_status: "Container number format is invalid. Cannot track.",
      },
      provenance: {
        source: "algorithmic",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  // Read live status from the carrier's own page, where one is permitted.
  // When that read is attempted and fails, the call throws (unbilled): the
  // check-digit fields alone are not the tracking answer this tool sells.
  let trackingData: Record<string, unknown> | null = null;
  const scrapeUrl = liveTrackingUrl(carrier, trackingUrls);

  if (scrapeUrl) {
    let text: string;
    try {
      const html = await fetchRenderedHtml(scrapeUrl, { source: "strale" });
      text = htmlToText(html);
    } catch (err) {
      throw trackingPageFailure(scrapeUrl, err);
    }
    if (text.length < 200) {
      throw new UpstreamUnavailableError(
        `carrier tracking page ${new URL(scrapeUrl).hostname}`,
        "the page rendered without readable tracking content; retry shortly.",
        { code: "empty" },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

    const client = createAnthropicClient({ apiKey });
    // A truncation refusal or parse failure from the helper propagates:
    // the call fails unbilled rather than answering without tracking.
    // A page that says the container is unknown comes back as
    // `status: "not_found"`, the real negative, and is returned as is.
    trackingData = await extractJsonWithLlm({
      client,
      model: MODELS.capability_default.id,
      maxTokens: 2000,
      prompt: `Extract container tracking information from this shipping carrier page for container "${validation.container_number}".

  Return ONLY valid JSON:
  {
    "status": "current status (e.g. In Transit, At Port, Delivered, Loaded on Vessel, Discharged, Gate Out, etc.)",
    "vessel_name": "vessel/ship name or null",
    "voyage_number": "voyage number or null",
    "origin_port": "port of loading or null",
    "destination_port": "port of discharge or null",
    "eta": "estimated time of arrival or null",
    "last_location": "last known location or null",
    "events": [
      {
        "timestamp": "date/time or date string",
        "location": "location name",
        "status": "event description"
      }
    ]
  }

  If the page shows an error, no results, or tracking data cannot be found, return:
  {
    "status": "not_found",
    "vessel_name": null,
    "voyage_number": null,
    "origin_port": null,
    "destination_port": null,
    "eta": null,
    "last_location": null,
    "events": [],
    "note": "reason why tracking data was not found"
  }

  Page text:
  ${text.slice(0, 12000)}`,
      truncationGuidance: "The carrier page produced more tracking events than fit in one call.",
      parseFailureError: () => new Error("Failed to parse container tracking data."),
    });
  }

  return {
    output: {
      container_number: validation.container_number,
      valid_format: validation.valid_format,
      check_digit_valid: validation.check_digit_valid,
      owner_code: validation.owner_code,
      category_indicator: validation.category,
      serial_number: validation.serial_number,
      carrier: carrier ?? "unknown",
      tracking_urls: trackingUrls,
      // Reached without tracking data only for a carrier Strale does not read
      // live: no tracking leg was attempted, and the note says so.
      ...(trackingData ?? {
        status: "tracking_unavailable",
        note: `Strale reads live tracking only for ${LIVE_TRACKING_CARRIERS}. For this carrier, use the tracking URLs above to check manually.`,
      }),
    },
    provenance: {
      source: trackingData ? "carrier-website" : "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
