import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

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

function getTrackingUrls(containerNumber: string, carrier: string | null): Record<string, string> {
  const urls: Record<string, string> = {};

  if (carrier) {
    const carrierLower = carrier.toLowerCase();
    if (carrierLower.includes("maersk")) {
      urls.maersk = `https://www.maersk.com/tracking/${containerNumber}`;
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
    } else if (carrierLower.includes("hmm") || carrierLower.includes("hyundai")) {
      urls.hmm = `https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?type=1&number=${containerNumber}`;
    }
  }

  // Always include universal trackers
  urls.searates = `https://www.searates.com/container/tracking/?number=${containerNumber}`;
  urls.track_trace = `https://www.track-trace.com/container?number=${containerNumber}`;

  return urls;
}

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

  // Try to scrape tracking info via Browserless
  let trackingData: Record<string, unknown> | null = null;

  try {
    // Choose the best URL to scrape based on detected carrier
    let scrapeUrl: string;
    if (carrier?.toLowerCase().includes("maersk")) {
      scrapeUrl = trackingUrls.maersk;
    } else if (carrier?.toLowerCase().includes("msc")) {
      scrapeUrl = trackingUrls.msc;
    } else if (carrier?.toLowerCase().includes("cma")) {
      scrapeUrl = trackingUrls.cma_cgm;
    } else if (carrier?.toLowerCase().includes("hapag")) {
      scrapeUrl = trackingUrls.hapag_lloyd;
    } else {
      scrapeUrl = trackingUrls.searates;
    }

    const html = await fetchRenderedHtml(scrapeUrl);
    const text = htmlToText(html);

    if (text.length >= 200) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

      const client = new Anthropic({ apiKey });
      const r = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Extract container tracking information from this shipping carrier page for container "${validation.container_number}".

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
          },
        ],
      });

      const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        trackingData = JSON.parse(jsonMatch[0]);
      }
    }
  } catch {
    // Tracking scrape failed — return validation results with tracking URLs
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
      ...(trackingData ?? {
        status: "tracking_unavailable",
        note: "Live tracking data could not be retrieved. Use the tracking URLs above to check manually.",
      }),
    },
    provenance: {
      source: trackingData ? "carrier-website" : "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
