// Whether the site may promise that call content is cleared after facts.static.pii_retention_days.
// That is the policy, but on 2026-10-25 a read-only production query found the clearing was not
// running (732,114 calls past 90 days still held content). Every page that would state the content
// period reads this flag; set it to true in the PR that verifies the drain in production.
export const CONTENT_CLEARING_VERIFIED = false;
