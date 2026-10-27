/** Columns the boot sync writes; the strict drift gate shares this exact scope. */
export const TEXT_COLUMNS = ["name", "description", "category", "data_source", "input_schema", "output_schema", "output_field_reliability"] as const;

/** Conservative union: a stale manifest cannot remove a DB compliance guard. */
export function isReportOnly(manifest: Record<string, unknown>, row: Record<string, unknown> = {}): boolean {
  return [manifest.category, row.category].some(v => typeof v === "string" && /compliance|methodology|kyb|kyc/i.test(v)) ||
    [manifest.gdpr_art_22_classification, row.gdprArt22Classification, row.gdpr_art_22_classification]
      .some(v => v === "screening_signal" || v === "risk_synthesis");
}
