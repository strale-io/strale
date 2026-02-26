import { registerCapability, type CapabilityInput } from "./index.js";

// Algorithmic carrier detection from tracking number patterns + tracking URLs
registerCapability("shipping-track", async (input: CapabilityInput) => {
  const tracking = ((input.tracking_number as string) ?? (input.number as string) ?? (input.task as string) ?? "").trim();
  if (!tracking) throw new Error("'tracking_number' is required.");

  const cleaned = tracking.replace(/[\s-]/g, "").toUpperCase();

  // Carrier detection patterns
  const carriers: { name: string; code: string; patterns: RegExp[]; trackUrl: (n: string) => string }[] = [
    {
      name: "UPS", code: "ups",
      patterns: [/^1Z[A-Z0-9]{16}$/, /^T\d{10}$/, /^\d{9}$/, /^\d{26}$/],
      trackUrl: n => `https://www.ups.com/track?tracknum=${n}`,
    },
    {
      name: "FedEx", code: "fedex",
      patterns: [/^\d{12}$/, /^\d{15}$/, /^\d{20}$/, /^\d{22}$/],
      trackUrl: n => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
    },
    {
      name: "USPS", code: "usps",
      patterns: [/^\d{20,22}$/, /^(94|93|92|94)\d{18,20}$/, /^[A-Z]{2}\d{9}US$/],
      trackUrl: n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
    },
    {
      name: "DHL Express", code: "dhl",
      patterns: [/^\d{10}$/, /^\d{11}$/, /^[A-Z]{3}\d{7}$/, /^JJD\d{18}$/],
      trackUrl: n => `https://www.dhl.com/en/express/tracking.html?AWB=${n}`,
    },
    {
      name: "Royal Mail", code: "royalmail",
      patterns: [/^[A-Z]{2}\d{9}GB$/, /^[A-Z]{2}\d{9}[A-Z]{2}$/],
      trackUrl: n => `https://www.royalmail.com/track-your-item#/tracking-results/${n}`,
    },
    {
      name: "PostNord", code: "postnord",
      patterns: [/^[A-Z]{2}\d{9}SE$/, /^[A-Z]{2}\d{9}DK$/, /^\d{14,20}$/],
      trackUrl: n => `https://tracking.postnord.com/tracking.html?id=${n}`,
    },
    {
      name: "GLS", code: "gls",
      patterns: [/^\d{11,12}$/],
      trackUrl: n => `https://gls-group.com/EU/en/parcel-tracking?match=${n}`,
    },
    {
      name: "DPD", code: "dpd",
      patterns: [/^\d{14}$/],
      trackUrl: n => `https://tracking.dpd.de/parcelstatus?query=${n}`,
    },
    {
      name: "TNT/FedEx", code: "tnt",
      patterns: [/^\d{9}$/, /^GE\d{9}[A-Z]{2}$/],
      trackUrl: n => `https://www.tnt.com/express/en_gc/site/tracking.html?searchType=con&cons=${n}`,
    },
    {
      name: "Amazon Logistics", code: "amazon",
      patterns: [/^TBA\d{12,15}$/],
      trackUrl: n => `https://track.amazon.com/tracking/${n}`,
    },
  ];

  const detected: { name: string; code: string; tracking_url: string; confidence: string }[] = [];

  for (const carrier of carriers) {
    for (const pattern of carrier.patterns) {
      if (pattern.test(cleaned)) {
        detected.push({
          name: carrier.name,
          code: carrier.code,
          tracking_url: carrier.trackUrl(cleaned),
          confidence: "high",
        });
        break;
      }
    }
  }

  // Detect format metadata
  const isAlpha = /^[A-Z]+$/.test(cleaned);
  const isNumeric = /^\d+$/.test(cleaned);
  const length = cleaned.length;

  return {
    output: {
      tracking_number: cleaned,
      original_input: tracking,
      detected_carriers: detected,
      carrier_count: detected.length,
      best_match: detected[0] ?? null,
      format: {
        length,
        is_numeric: isNumeric,
        is_alpha: isAlpha,
        is_alphanumeric: !isAlpha && !isNumeric,
      },
      universal_tracking_urls: [
        `https://parcelsapp.com/en/tracking/${cleaned}`,
        `https://www.17track.net/en/track#nums=${cleaned}`,
      ],
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
