// Labels for the sub-processor roles in /v1/platform/facts static.vendors.
// The vendor names themselves are read from the facts, never typed here; a
// role the facts add without a label shows its key until one is written.
export const VENDOR_ROLE: Record<string, string> = {
  sanctions: "Sanctions screening data",
  pep: "Politically exposed person data",
  adverse_media_primary: "Adverse media data",
  adverse_media_fallback: "Adverse media data, fallback",
  embeddings: "Search embeddings",
  risk_narrative: "AI model",
  headless_browser: "Rendering web pages",
  payments_card: "Card payments",
  payments_x402: "x402 payments",
  log_sink: "Logs",
  us_company_registry: "US company records",
  us_ein: "US employer ID lookups",
  ubo_supplement_global: "Ownership links (LEI)",
  fr_litigation: "French court notices",
};

/** Plain names for processing_jurisdiction values (apps/api/src/lib/processing-location.ts). */
export const JURISDICTION: Record<string, string> = {
  US: "the United States",
  EU: "the European Union",
  SE: "Sweden",
};

/** Plain meanings of the GDPR Article 22 classification a manifest declares. */
export const ART22: Record<string, string> = {
  data_lookup: "Returns data. It makes no finding about a person.",
  screening_signal: "Returns possible matches that a person should review before acting.",
  risk_synthesis: "An AI-written summary of other results, for a person to review.",
};

/** Plain names for the transaction columns cleared at redaction. */
export const CONTENT_LABEL: Record<string, string> = {
  input: "what your agent sent",
  output: "what the tool returned",
  error: "error messages",
  audit_trail: "the call’s audit record",
  provenance: "source details",
  idempotency_key: "the idempotency key",
};
