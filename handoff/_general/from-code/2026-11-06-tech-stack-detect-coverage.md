Intent: widen what `tech-stack-detect` (and the deterministic layer of `company-tech-stack`) can legitimately see from one public homepage fetch, its response headers and public DNS, add a per-technology `version`, and make failures visible instead of empty.

Date: 2026-11-06 | Branch: `feat/tech-stack-detect-coverage` | No PR opened (orchestrator opens it).

## What changed

- New shared engine, written by hand (no Wappalyzer or webappanalyzer data, no GPL material):
  - `apps/api/src/capabilities/lib/tech-signatures.ts` is the data table: about 390 signatures (roughly 370 distinct technologies), each a pattern plus a category. The header comment records the provenance rule: add signatures from the vendor's own install snippet, never from another detector's fingerprint file.
  - `apps/api/src/capabilities/lib/tech-detect.ts` is the pure engine: headers, Set-Cookie names, HTML, every `<meta>` tag (generator catch-all included), public DNS, and `implies` (for example Next.js implies React, at medium confidence).
  - `apps/api/src/capabilities/lib/tech-dns.ts` reads MX, TXT, NS and CNAME with a bounded resolver. It separates "no such record" (`empty`) from a resolver fault (`failed`), and never rejects.
- `tech-stack-detect.ts` now uses the engine and DNS. Output is backward compatible; added: `technologies[].version` (null when unstated), `dns`, `warnings`, `coverage_note`, `signals.has_tag_manager`, `signals.has_consent_management`.
- `company-tech-stack.ts` runs the same engine on the rendered HTML, headers and DNS. Signature matches come first in `detected_technologies` (with `version` and `evidence`), the model's extra names follow, and nothing is listed twice. Empty summary fields (`cdn`, `email_provider`, `payment_processor`, `chat_widget`) are filled from matches, and `analytics` is merged. `dns_records` keeps its shape and gains `ns`. Added: `dns_status`, `warnings`, `coverage_note`.
- Manifests `tech-stack-detect.yaml` and `company-tech-stack.yaml`: output schema and example, `output_field_reliability` (`version` is `common`, never guaranteed), limitations, `data_source`. For `tech-stack-detect` the declared output (`cms`, `hosting`, `analytics`, `css_framework`, `frontend_framework`, all "guaranteed") described an earlier LLM version and was never emitted by the current executor; it now matches the real output. `transparency_tag` is `algorithmic` (the executor has no LLM).
- The "Database covers 1,000+ technologies" limitation text was a claim the code never backed; it now says "several hundred common technologies".

## Behaviour changes a reviewer should know

- Signatures that matched a bare product word now need the vendor's host or file name. A page that only mentions or links to a product no longer reports it (the old table reported HubSpot, Marketo, Zendesk, Wix, Webflow and Tailwind from text, links and logos). This lowers some old counts on purpose.
- `Google Analytics` is now high confidence only from a GA snippet or `gtag('config')`; a Google Tag Manager tag alone gives it at medium confidence, and `Google Tag Manager` is its own entry.
- An unknown `<meta name="generator">` is split into `name` and `version` ("Foo 1.2.3" becomes name Foo, version 1.2.3). Before, the whole string was the name.
- New errors: an empty body is an error; an image, audio, video, PDF, zip or octet-stream response is an input refusal. A DNS fault is not an error (the homepage result is still useful) but is stated in `dns.status`, `dns.failed_lookups` and `warnings`.
- A site that answers 401/403/429 or a bot-check page is still a refusal (DEC-20261023-A). Nothing retries it another way.

## Not done, on purpose

- The public `description` of both tools is unchanged. Startup-migration block 0123 (catalogue copy) froze it and `startup-migrations.test.ts` pins the manifests to it; the old text ("from its headers and HTML") is still true but does not mention DNS or versions. Changing it needs a new catalogue-copy block (append-only, with a ledger entry), which is a separate batch.
- No second page, no headless browser, no paid vendor, no reverse-DNS lookup, no subdomain probing.
- `validate-capability.ts` needs a database and was not run here.
- `company-tech-stack` was not run live (it needs Browserless and an Anthropic key); its deterministic layer is the same engine and is covered by an offline test with the model stubbed.
- Public guide text under `apps/web/src/data/guides/` still says the tool reads "headers, scripts and markup". It is true, only incomplete (DNS is new); left alone as out of scope.

## Deploy effect

Both executors are auto-registered (`auto-register.ts`, no wiring change). Manifest text (name, description, category, data_source, input and output schema, output_field_reliability) and limitations reach the database through the boot-time manifest text sync; both categories (`web-intelligence`, `competitive-intelligence`) are outside the compliance report-only filter, so the text is applied, not just reported. `transparency_tag` is not a synced text column; the stored value stays until a manifest backfill runs. Post-deploy check: `POST /v1/do` on `tech-stack-detect` with a domain and confirm `technologies[].version`, `dns.status` and `coverage_note` are present.

Next authorised action: orchestrator opens the PR and runs an independent review (separate context), then the post-deploy production query above | Owner: orchestrator | Blocker: none
