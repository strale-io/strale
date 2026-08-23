/**
 * The fields recorded on every authenticated call as
 * `transactions.audit_trail.request_context`.
 *
 * One list, because it was written out twice and the copies drifted. `/v1/do`
 * builds seven fields; the account-closure receipt disclosed five of them, and
 * production carries the two missing ones — `fingerprintHash` on 476
 * user-linked rows across 6 users, `mcpClient` on 1 — so a customer closing
 * their account was handed an itemised list of retained data that omitted a
 * device fingerprint.
 *
 * Anything added to the object in `routes/do.ts` must be added here, and the
 * closure receipt then names it automatically.
 */
export const REQUEST_CONTEXT_FIELDS = [
  "referer",
  "origin",
  "userAgent",
  "ipHash",
  "acceptLanguage",
  "fingerprintHash",
  "mcpClient",
] as const;

export type RequestContextField = (typeof REQUEST_CONTEXT_FIELDS)[number];
