Intent: Codex builder brief: company-enrich reads the homepage's own structured metadata.

# Brief: company-enrich returns the fields the homepage already publishes

- **Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw), on Petter's instruction of 2026-11-06 to fix what external benchmarks found.
- **Branch:** push only `codex/company-enrich-metadata`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. There are no secrets in it. All tests run offline, with recorded HTML fixtures. Never call Browserless or Anthropic from a test.

## Why

An external benchmark called `company-enrich` with `{"domain": "stablesocial.dev"}`.
- **What we returned:** name, website and industry.
- **What we did not return:** description, SEO description, logo, cover image, contact email, country, region, city, postal code, street and specialties.

Most sites publish these in their own HTML: `<title>`, `meta description`, Open Graph (`og:title`, `og:description`, `og:image`, `og:site_name`), Twitter cards, `link rel=icon` and apple-touch-icon, and schema.org JSON-LD (`Organization` / `LocalBusiness`, with `name`, `description`, `logo`, `email`, `address` as `PostalAddress`: `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`, plus `sameAs` and `knowsAbout`).

## What to change

1. Read `apps/api/src/capabilities/company-enrich.ts` first. It fetches the page (Browserless) and asks Claude to extract fields. Then, **before** the Claude step, add a deterministic extractor in a small pure module, for example `apps/api/src/lib/company-enrich/structured-metadata.ts`. It parses the fetched HTML for the tags above and returns typed fields.
2. Merge the results:
   - **Structured metadata wins** for the fields it has. It is the site's own statement, so mark it in provenance as `site_metadata`.
   - **Claude fills only the gaps.** Pass it the structured fields, so it does not re-invent them and does not contradict them. Keep the existing prompt rules, and never let it invent an address, email or logo.
   - **Sanitise:**
     - resolve relative image URLs to absolute;
     - drop images that are not `http(s)`;
     - keep the email only if it is on the company's own domain or the page lists it publicly;
     - trim long text to the existing limits.
3. **Output.** Add these fields if absent, with `null` when unknown, and keep every existing field: `description`, `seo_description`, `logo_url`, `cover_image_url`, `email`, `address { street, city, region, postal_code, country }` and `specialties` (array). Update `manifests/company-enrich.yaml` `output_schema` and `output_field_reliability`: all of these are `common` or `rare`, never `guaranteed`. Add a limitation saying the fields come from what the homepage publishes.
4. Use no new fetches, no subpage crawling and no new vendor. The per-call cost stays the same.

## Tests

Add offline tests for the extractor and the merge, using small synthetic HTML fixtures:
- JSON-LD `Organization` with a `PostalAddress`;
- Open Graph only;
- conflicting `og` and JSON-LD values, with the documented precedence;
- relative logo URL resolution;
- an off-domain email being dropped;
- an empty page giving all nulls without throwing.

Mock the Claude call to show that it receives the structured fields and cannot overwrite them. The tests must fail without the change.

## Done when

- The new tests pass and `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first, if typecheck needs them.
- `docs/lanes/codex/company-enrich-metadata-report.md` lists the files changed, the precedence rules, the tests, and anything not done.
