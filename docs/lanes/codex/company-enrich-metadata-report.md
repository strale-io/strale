# Company enrich metadata report

## Result

`company-enrich` now parses the fetched homepage before the Claude extraction,
passes those publisher-supplied values into the model prompt, and merges the
answer without allowing the model to overwrite site metadata. The executor now
uses only the original homepage fetch; it no longer makes the former `/about`
subpage request, so the change adds no fetches or vendor cost.

## Files changed

- `apps/api/src/lib/company-enrich/structured-metadata.ts` — pure HTML metadata
  extractor and typed metadata shape.
- `apps/api/src/lib/company-enrich/structured-metadata.test.ts` — offline
  extractor coverage with synthetic HTML.
- `apps/api/src/capabilities/company-enrich.ts` — homepage extraction, prompt
  context, deterministic merge, complete nullable output shape and
  `site_metadata` provenance.
- `apps/api/src/capabilities/company-enrich.test.ts` — merge tests using a mock
  Claude callback.
- `manifests/company-enrich.yaml` — output schema, field reliability, estimated
  latency and homepage-publication limitation.
- `apps/api/package.json` and `package-lock.json` — direct `tldts` dependency
  for public-suffix-aware company-domain email validation.
- `docs/lanes/codex/company-enrich-metadata-report.md` — this report.

## Precedence and sanitisation

1. Schema.org `Organization` or `LocalBusiness` JSON-LD is the most explicit
   publisher statement and wins for company name, description, logo, email,
   postal address, social links and specialties.
2. Open Graph fills gaps next, followed by Twitter cards, ordinary meta
   description and finally the document title or icon.
3. `seo_description` prefers the ordinary meta description, then Open Graph,
   Twitter and JSON-LD description. `cover_image_url` prefers Open Graph and
   then Twitter.
4. Claude receives the extracted object as authoritative prompt context and
   fills only ordinary gaps. Site metadata wins during the deterministic merge.
   Address, email, logo and cover image are always taken from metadata (or set
   to `null`), never from Claude.
5. Relative images become absolute against the homepage URL; non-HTTP(S)
   images are dropped. Metadata email is accepted only on the homepage's own
   registrable domain, including when the homepage uses a subdomain. Text and
   specialty arrays are bounded. Provenance lists exactly which output paths
   came from `site_metadata`; it does not label the mixed response wholesale.

## Tests and checks

- `cd apps/api && npx vitest run src/lib/company-enrich/structured-metadata.test.ts src/capabilities/company-enrich.test.ts`
  passed. Coverage includes JSON-LD `PostalAddress`, Open
  Graph only, JSON-LD/OG conflict precedence, relative logo resolution,
  non-HTTP image rejection, off-domain email rejection, the empty-page shape,
  prompt context, field-level provenance, sparse-metadata billing behavior and
  an attempted Claude overwrite.
- `cd apps/api && npx tsc --noEmit --project tsconfig.json` passed.
- Manifest YAML parsing and the strict guaranteed-field, identity-fixture,
  tier-coverage and cost-class checks passed.

## Not done in this secret-free builder lane

- `onboard.ts --dry-run`, `validate-capability.ts`, `smoke-test.ts` and the database-backed readiness
  query could not complete because this Codex lane intentionally has no
  `DATABASE_URL`, Browserless credential or Anthropic credential. Both scripts
  stopped at the missing operator database/write handle; no live vendor call
  or production write was attempted.
- The onboarding `--backfill --discover --fix` path was not run because it
  requires production database and paid upstream access. The manifest was
  updated and checked offline instead.

