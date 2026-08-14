/**
 * Vendors that must never be called by sweep tooling — metered, expensive, or
 * on informal grace quotas. This is a money-safety control: EXTEND the list,
 * never empty it. Shared by sweep-paid-fixtures.ts and sweep-prod-catalog.ts
 * so the two can't silently diverge.
 */
export const SWEEP_DENYLIST = new Map<string, string>([
  ["us-company-data-cobalt", "Cobalt Intelligence, €2.00/call"],
  ["us-ein-match", "€0.75/call"],
  ["us-sec-filings-extended", "€0.25/call, paired with the Cobalt stack"],
  ["uk-cop-check", "Pay.UK CoP via eSortcode — metered scheme access"],
  ["pep-check", "Dilisense — informal Starter-tier grace, do not burn quota"],
  ["sanctions-check", "Dilisense — same"],
  ["adverse-media-check", "Dilisense — same"],
]);
