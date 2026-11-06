# Company-enrich structured metadata, run 3 report

## Result

Completed every code, test, prompt, and manifest item in the run-3 brief.

## Numbered findings

1. **Bounded icon and parser input.** `buildBoundedMetadataHtml` now keeps at
   most eight icon links, rejects icon tags over 4 KB, limits the implicit or
   explicit head slice to 128 KB, and limits the complete jsdom document to
   1.5 MB. JSON-LD is discarded before the head if the aggregate budget is
   exceeded. Direct builder tests cover 4 MB of icon links, one 16 MB icon
   `href`, and 1 MB of tiny metadata without `</head>`; every case asserts a
   non-empty parser input at or below the exported aggregate limit.
2. **Linear script scan.** An opening script without a closing tag is processed
   once (when it is JSON-LD) and then terminates the scan. The 2 MB unclosed
   script regression test directly asserts that the scanner visits one opening
   and checks the bounded builder output rather than using a wall-clock limit.
3. **Linear, bounded page text.** Homepage and about-page text extraction now
   inspect only the first 2 MB and use forward-only `indexOf` scans for
   script/style/SVG blocks and tags. The first unclosed excluded block drops
   the remainder. A regression test supplies 2 MB of unclosed script openings
   and asserts only the preceding visible text survives.
4. **Metadata-only fields and model schema.** `seo_description` is now assigned
   unconditionally from structured metadata. Model output is copied through an
   allowlist matching the requested extraction schema, so arbitrary model keys
   cannot escape. Tests cover both an invented SEO description and an unknown
   model key.
5. **Shared-host email boundaries.** Both homepage and email hosts now use
   `tldts` private-domain boundaries. Parameterized tests reject sibling
   `vercel.app` and `github.io` tenants.
6. **Prompt label.** The untrusted-data warning explicitly names the ABOUT PAGE
   CONTENT section, with a prompt assertion in the merge test.
7. **Manifest wording.** Data-source and limitation copy now names the homepage
   and its `/about` page. The workaround points to
   `provenance.field_sources`, not the nonexistent `data_sources` field.

## Verification

- The focused company-enrich and structured-metadata suite passes: 34 tests.
- `packages/mcp-server` and `packages/sdk-typescript` build successfully.
- The repository typecheck passes after those builds.
- Manifest guaranteed-field consistency, identity fixture shape, tier
  coverage, cost-class coherence, claims, and environment checks pass. The
  tier-coverage command reports only its existing allowlisted findings.

## Not done

- The database-backed `validate-capability`/readiness and live smoke-test steps
  were not run to completion because this brief provides no secrets and
  requires tests to remain offline. `validate-capability` stopped before
  validation with `DATABASE_URL is required for a read-only operator handle`.
  No production write or paid Claude/Browserless call was attempted.
