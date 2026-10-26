// Whether the site may promise that call content is cleared after facts.static.pii_retention_days.
// Verified in production on 2026-10-25: of 732,115 calls older than 90 days, 5 still held content,
// all under a day past the cutoff (the clearing runs daily). The clearing sets `redacted_at` and
// writes empty JSON into the content columns; `deleted_at` is only set by the 3-year sweep, so a
// check must use `redacted_at`, not `deleted_at`. Set to false if the clearing ever stops.
export const CONTENT_CLEARING_VERIFIED = true;
