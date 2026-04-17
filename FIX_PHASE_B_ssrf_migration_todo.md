# SSRF migration TODO — COMPLETE (F-0-006)

**Status as of 2026-04-17**: Phase C Fix 6 closed this list. Left here as
an on-disk record of what was walked, what stayed, and why.

Re-run the inventory any time to confirm:

```
npm --workspace=apps/api run lint:ssrf-inventory
```

The `.github/workflows/ci.yml` runs this on every PR — a regression
(new capability without a guard or acknowledging comment) fails CI.

---

## Final counts

- **Bucket A (direct fetch of user URL, migrated to safeFetch)**:
  15 capabilities — url-to-markdown, url-health-check, api-health-check,
  meta-extract, link-extract, og-image-check, pdf-extract, tech-stack-detect,
  website-carbon-estimate, domain-reputation, email-pattern-discover,
  receipt-categorize, resume-parse, contract-extract, image-resize,
  invoice-extract, job-posting-analyze. Plus `redirect-trace` (special
  case: uses safeFetch with maxRedirects: 0 + per-hop validateUrl).

- **Bucket B (forwards URL to third party, validateUrl before forwarding)**:
  4 explicit + all shared-helper consumers — screenshot-url, html-to-pdf,
  web-extract (from Phase B), company-enrich. The shared helpers
  `lib/web-provider.ts`, `lib/browserless-extract.ts`, `lib/jina-reader.ts`
  all call validateUrl so their ~47 consumers inherit protection.

- **Bucket C (domain/host input, validateHost)**: 3 — port-check, ssl-check,
  ssl-certificate-chain. `validateHost` was already using the hardened
  `isBlockedIp` — no changes needed.

- **Bucket D (URL as data only, acknowledging comment)**: 18 —
  api-mock-response, backlink-check, dns-lookup, domain-age-check,
  email-deliverability-check, ens-resolve, github-repo-analyze,
  http-to-curl, image-to-text, linkedin-url-validate, mx-lookup,
  nginx-config-generate, page-speed-test, phishing-site-check,
  vasp-non-compliant-check, vasp-verify, website-to-company,
  whois-lookup. Each contains a comment on disk naming why it's safe.

## Patterns locked in

Three invariants are now enforced at CI time:

1. **No bare `.catch(() => {})`** — `lint:no-bare-catch`. Use
   `fireAndForget({ label, context })` or `.catch((err) => logError(...))`.
2. **No unguarded URL-accepting capability** — `lint:ssrf-inventory`.
   Every file in `apps/api/src/capabilities/` that mentions
   `input.url|link|domain|hostname|website` must either import a guard
   or contain `F-0-006 Bucket`.
3. **`validateHost` and `validateUrl` share `isBlockedIp`** — unified in
   Phase B, reconfirmed in Phase C.

## What's NOT in this list

The shared helpers themselves (`lib/web-provider.ts`, `lib/browserless-extract.ts`,
`lib/jina-reader.ts`) were migrated in Phase C's first SSRF commit — see
`FIX_PHASE_C_report.md` section "Fix 6 shared helpers". Those changes cover
~47 capability files transitively without per-file edits.

## Follow-ups (out of Phase C scope)

- Add a parameterized Bucket A test variant that covers the env-gated
  capabilities (pdf-extract, invoice-extract, resume-parse, receipt-
  categorize, image-resize) by asserting `safeFetch` is imported rather
  than asserting rejection end-to-end. The CI inventory guard covers
  this today via static grep; a behavioural test would be stronger but
  requires mocking `@anthropic-ai/sdk` and the image pipeline.
- Consider migrating `backlink-check.ts` from raw fetch to safeFetch
  for defence-in-depth even though today's hostnames are hardcoded — if
  someone swaps the hostname for a user value it fails open.
