// The pages the review pass screenshots: one of each page type, comma-separated.
// Generated pages are represented by stable examples. Extend as page types land.
export const REVIEW_PAGES = ["/", "/tools", "/tools/iban-validate", "/tools/invoice-extract", "/tools/swedish-company-data", "/solutions/kyb-essentials-se", "/company-data", "/company-data/sweden", "/company-data/united-states", "/company-data/japan", "/use-cases", "/use-cases/supplier-onboarding", "/use-cases/checking-data", "/pricing", "/docs", "/docs/api", "/docs/mcp", "/docs/x402", "/docs/sdks", "/security", "/about"];
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) console.log(REVIEW_PAGES.join(","));
