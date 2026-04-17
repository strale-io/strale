import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";

// Constants from the Sustainable Web Design model / Website Carbon methodology
const ENERGY_PER_GB_KWH = 0.81; // kWh per GB transferred
const CARBON_PER_KWH_GRAMS = 442; // grams CO2 per kWh (global grid average)
const BYTES_PER_GB = 1024 * 1024 * 1024;
const MEDIAN_PAGE_SIZE_BYTES = 2.3 * 1024 * 1024; // ~2.3 MB median page size (2024)
const DEFAULT_MONTHLY_VIEWS = 10_000;
const RETURNING_VISITOR_RATIO = 0.25; // 25% returning visitors
const RETURNING_DATA_FACTOR = 0.02; // returning visitors transfer ~2% of data (caching)

registerCapability("website-carbon-estimate", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!rawUrl) throw new Error("'url' is required. Provide a URL to estimate carbon emissions.");

  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  // F-0-006: safeFetch validates + re-validates redirects.
  const resp = await safeFetch(url, {
    headers: {
      "User-Agent": "Strale-Bot/1.0",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}.`);

  const buffer = await resp.arrayBuffer();
  const transferSizeBytes = buffer.byteLength;
  const transferSizeKb = Math.round(transferSizeBytes / 1024);

  // Response headers
  const transferEncoding =
    resp.headers.get("content-encoding") ??
    resp.headers.get("transfer-encoding") ??
    "none";

  // CO2 calculation using Sustainable Web Design model
  // Energy per page view = (transfer size in GB) * (energy per GB)
  const energyPerView = (transferSizeBytes / BYTES_PER_GB) * ENERGY_PER_GB_KWH;

  // Adjust for returning visitors:
  // new visitor energy = full page load
  // returning visitor energy = full * RETURNING_DATA_FACTOR (cached)
  const newVisitorRatio = 1 - RETURNING_VISITOR_RATIO;
  const adjustedEnergy =
    energyPerView * newVisitorRatio +
    energyPerView * RETURNING_DATA_FACTOR * RETURNING_VISITOR_RATIO;

  // CO2 grams per page view
  const co2GramsPerView = adjustedEnergy * CARBON_PER_KWH_GRAMS;

  // Annual CO2 at default monthly views
  const annualViews = DEFAULT_MONTHLY_VIEWS * 12;
  const annualCo2Kg = (co2GramsPerView * annualViews) / 1000;

  // "Cleaner than" percentage based on median page size
  // If this page is smaller than median, it's cleaner than a proportion of sites
  let cleanerThanPercent: number;
  if (transferSizeBytes <= 0) {
    cleanerThanPercent = 100;
  } else if (transferSizeBytes >= MEDIAN_PAGE_SIZE_BYTES * 3) {
    cleanerThanPercent = 0;
  } else {
    // Simple linear model: median = 50th percentile
    // Smaller pages → higher percentile
    cleanerThanPercent = Math.round(
      Math.min(100, Math.max(0, (1 - transferSizeBytes / (MEDIAN_PAGE_SIZE_BYTES * 2)) * 100)),
    );
  }

  // Rating based on CO2 per page view
  let rating: string;
  if (co2GramsPerView < 0.1) rating = "A";
  else if (co2GramsPerView < 0.3) rating = "B";
  else if (co2GramsPerView < 0.5) rating = "C";
  else if (co2GramsPerView < 1.0) rating = "D";
  else rating = "F";

  // Recommendations
  const recommendations: string[] = [];
  if (transferSizeBytes > 3 * 1024 * 1024) {
    recommendations.push("Page exceeds 3MB. Optimize images, minify CSS/JS, and remove unused resources.");
  }
  if (transferSizeBytes > 1 * 1024 * 1024) {
    recommendations.push("Consider lazy-loading images and deferring non-critical JavaScript.");
  }
  if (transferEncoding === "none") {
    recommendations.push("Enable gzip or Brotli compression on your server to reduce transfer size.");
  }
  if (co2GramsPerView >= 0.5) {
    recommendations.push("Consider switching to a green hosting provider powered by renewable energy.");
  }
  if (transferSizeBytes > 500 * 1024) {
    recommendations.push("Use modern image formats (WebP, AVIF) to reduce image payload.");
  }
  if (recommendations.length === 0) {
    recommendations.push("This page is already lightweight. Maintain current optimization practices.");
  }

  return {
    output: {
      url,
      page_size_bytes: transferSizeBytes,
      page_size_kb: transferSizeKb,
      co2_grams_per_view: +co2GramsPerView.toFixed(4),
      cleaner_than_percent: cleanerThanPercent,
      green_hosting: "unknown" as const,
      annual_co2_kg: +annualCo2Kg.toFixed(2),
      annual_co2_kg_custom: null,
      rating,
      transfer_encoding: transferEncoding,
      methodology: "Website Carbon / Sustainable Web Design model",
      recommendations,
    },
    provenance: { source: "page-analysis", fetched_at: new Date().toISOString() },
  };
});
