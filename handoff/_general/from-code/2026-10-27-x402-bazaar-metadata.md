Intent: Finish D2 x402 challenge discovery metadata with conservative manifest-only examples, preserve the existing catalog/OpenAPI changes and all payment fields, and leave this branch uncommitted for the orchestrator to review and ship.

Implemented in the existing `feat/x402-bazaar-metadata` checkout. No commit, push, PR, registration, deployment, paid request, settlement, production write or vendor contact was performed.

## Challenge metadata and primary sources

Both v1 and v2 handlers and their payment-verification rebuilds now pass an explicit capability/solution identity. The manifest cache is keyed by kind and slug; a colliding solution never inherits capability fixtures. Solutions have no manifest/output contract, so their discovery examples are omitted rather than borrowed or invented. Their tags are empty rather than inferred from a colliding capability.

`resource.serviceName` is `Strale`; `resource.description` includes the tool name and manifest public description; `resource.tags` uses its category plus an explicit vocabulary map (maximum five). `resource.iconUrl` is the existing `https://strale.dev/favicon-32x32.png`, confirmed HTTP 200 with image/png. No asset was added. Serper-backed search tools receive only their existing category, with no new search/SEO promotional tags (DQ-39).

Primary sources read on 2026-10-27 and cited in code:

- https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md — resource metadata, HTTP discovery info and draft 2020-12 schema rules.
- https://docs.cdp.coinbase.com/x402/seller/get-discovered — accurate examples, validator, supported PNG icon, search/indexing limitations.
- https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint — published preflight/validation contract.

Health inputs only are considered; known-answer inputs are never read. Ajv plus standard formats validates against manifest input/output schemas and again against runtime DB schemas. Unknown formats fail closed. The pure privacy screen rejects declared personal-data tools, screening/person lookup, sensitive field names, email outside reserved example domains, phone/card/IBAN patterns, street/DOB/name-like text, and non-documentation IPs. It walks nested objects and JSON strings, normalizes keys and URL encoding, and errs toward omission. Company registration/VAT identifiers remain eligible. Schema example/default annotations are stripped so omitted examples cannot leak through schema annotations. Cached validators use weak references and are removed from Ajv's strong cache.

`extensions.bazaar.info.input.body` or `.queryParams` is absent when no safe valid example exists. The published request schema remains under `schema.properties.input`; for omitted POST examples, the declaration makes the example's `body` property optional. This is intentional: no fabricated empty request is advertised as a valid example. Output format/schema remain even when the example is absent. Existing v1 payment values are unchanged; only discovery content changes. The prior v2 catalog URLs, working legacy routes and OpenAPI `info.x-guidance` stay.

The Dockerfile already copies `manifests/` into the runtime image; the source and built module use the same relative layout. No env/build/startup/schedule mechanism is added. Post-deploy verification must still prove metadata is served from the deployed build, rather than relying on this static reachability check.

## Offline validator, fail-before evidence and limits

The CDP validator is a hosted API, not a published standalone npm validator. The offline gate uses the existing `@x402/core` v2 envelope parser, the Bazaar specification's Ajv2020 validation algorithm with standard formats, required HTTP schema/type/method checks, local-reference restriction, and the published service metadata rules. D2 requires the otherwise-optional service metadata. Missing input/output examples remain permissible under the orchestrator's privacy/schema decisions; output examples are advisory in CDP.

The actual pre-change builder was extracted from git commit `d004d774` and evaluated in memory, without altering any working file. The same 356 manifests generated GET and POST challenges before and after: **712/712 fail the D2 metadata gate before; 712/712 pass after**. This does not mean CDP rejects every existing v2 production endpoint: the sweep found v2 valid with output advisories. The local gate additionally requires D2 service metadata. The 275 capability and 88 solution rows from a fresh read-only live catalog were also used to generate current challenges with their runtime schemas/methods/prices: **363/363 pass**; every enabled capability has a manifest.

Offline validation does not prove external reachability, image decoding, facilitator payment simulation, metadata moderation, indexing or ranking. No post-deploy hosted validator result is claimed. Re-run CDP's hosted validator after deployment.

Evidence, including enabled-tool classifications, the twelve search results, live 402 projections and before/after payment comparisons: [discovery evidence](../../../archive/sessions/2026-10-27-d2-discovery-evidence.json).

## Example coverage

Live-enabled capabilities: 275 tools; input examples **153 with / 122 without**; output examples **205 with / 70 without**.

Input omissions (mutually exclusive first reason): 18 personal data field; 81 processes_personal_data; 7 missing example; 8 possible personal name; 5 phone or card number; 1 person lookup or screening tool; 1 uninspectable structured text; 1 card-shaped number. Output omissions: 30 missing and 40 schema-invalid.

All manifests (superset, including inactive/free tools): 356 tools; input examples **175 with / 181 without**; output examples **254 with / 102 without**.

All 88 live-enabled solutions omit both examples: no solution manifest or output schema exists. This is separate from the capability counts above. Empty `{}` health input is allowed when it validates; missing input is not silently converted to `{}`.

All manifest input omissions by first reason (the full enabled subset and per-tool reasons are in the evidence JSON):

- **IP address (1):** host-exposure-lookup.
- **card-shaped number (1):** barcode-lookup.
- **email address (1):** diff-review.
- **missing example (10):** contract-verify-check, fear-greed-index, gas-price-check, phishing-site-check, protocol-fees-lookup, protocol-tvl-lookup, stablecoin-flow-check, token-security-check, vasp-non-compliant-check, vasp-verify.
- **person lookup or screening tool (1):** screenshot-url.
- **personal data field (29):** bitcoin-address-validate, brand-mention-search, company-industry-classify, company-name-match, company-news, cve-lookup, diff-json, dogecoin-address-validate, eth-address-validate, fake-data-generate, flatten-json, food-safety-rating-uk, json-schema-validate, json-to-pydantic, json-to-typescript, json-to-zod, llm-output-validate, package-security-audit, schema-infer, sec-filing-events, solana-address-validate, startup-domain-check, tool-call-validate, tron-address-validate, uk-filing-events, us-company-data-cobalt, us-ein-match, us-sec-filings-extended, xrp-address-validate.
- **phone or card number (5):** business-day-check, company-id-detect, cve-details, date-parse, forex-history.
- **possible personal name (13):** api-docs-generate, blog-post-outline, changelog-generate, eu-regulation-search, google-news-search, language-detect, salary-benchmark, schema-migration-generate, serp-related-questions, sql-explain, sql-optimize, us-court-search, workflow-security-audit.
- **processes_personal_data (119):** academic-paper-search, address-geocode, address-parse, address-validate, adverse-media-check, age-verify, aml-risk-score, annual-report-extract, approval-security-check, arxiv-search, au-company-data, australian-company-data, austrian-company-data, belgian-company-data, beneficial-ownership-lookup, brazilian-company-data, bulgarian-company-data, business-license-check-se, canadian-company-data, charity-lookup-uk, citation-graph, company-enrich, company-status-check, contract-extract, credit-report-summary, credit-score-band, croatian-company-data, cypriot-company-data, cz-bank-account-validate, cz-birth-number-validate, cz-company-data, cz-datova-schranka-id-validate, cz-unreliable-vat-payer, danish-company-data, doi-resolve, domain-contact-extract, dutch-company-data, email-deliverability-check, email-draft, email-finder, email-pattern-discover, email-reputation-score, email-validate, email-validate-bulk, ens-resolve, ens-reverse-lookup, estonian-company-data, eu-court-case-search, finnish-company-data, french-company-data, german-company-data, github-user-profile, greek-company-data, hacker-news-search, hungarian-company-data, iban-to-bank, iban-validate, id-number-validate, insolvency-check, invoice-counterparty-check, invoice-extract, invoice-validate, ip-geolocation, ip-risk-score, irish-company-data, italian-company-data, japanese-company-data, latvian-company-data, linkedin-url-validate, lithuanian-company-data, luxembourgish-company-data, maltese-company-data, meeting-notes-extract, name-parse, nl-bag-address, nl-energy-label, nl-woz-value, norwegian-company-data, officer-search, paper-details, password-strength, patent-search, pep-check, phone-normalize, phone-type-detect, phone-validate, pii-redact, polish-company-data, portuguese-company-data, pubmed-search, receipt-categorize, resume-parse, risk-narrative-generate, romanian-company-data, sanctions-check, secret-scan, sepa-xml-validate, singapore-company-data, skill-extract, skill-gap-analyze, slovak-company-data, slovenian-company-data, social-profile-check, spanish-company-data, swedish-company-data, swift-message-parse, swiss-company-data, tax-id-validate, uk-companies-house-officers, uk-company-data, uk-cop-check, uk-disqualified-director-check, uk-gazette-notice-search, us-company-data, wallet-age-check, wallet-balance-lookup, wallet-risk-score, wallet-transactions-lookup, whois-lookup.
- **uninspectable structured text (1):** json-repair.

Missing output examples (51 manifests): address-geocode, address-validate, age-verify, aml-risk-score, beneficial-ownership-lookup, business-day-check, company-industry-classify, company-name-match, company-news, credit-score-band, cz-bank-account-validate, cz-birth-number-validate, cz-company-data, cz-datova-schranka-id-validate, cz-ico-validate, cz-unreliable-vat-payer, diff-review, domain-age-check, domain-contact-extract, ecb-interest-rates, email-finder, email-pattern-discover, email-reputation-score, entity-resolve, eurostat-data, german-company-data, greek-company-data, holiday-calendar, iban-to-bank, id-number-validate, insolvency-check, invoice-counterparty-check, ip-risk-score, japanese-company-data, language-detect, license-compatibility-check, officer-search, package-docs, package-security-audit, phone-type-detect, phone-validate, postal-code-lookup, sec-filing-events, secure-random, slovak-company-data, tax-id-validate, timezone-lookup, uk-filing-events, website-to-company, workflow-security-audit, youtube-summarize.

## Manifest truth follow-ups (platform-hardening H3)

The following 51 existing manifest output examples fail their published schema; every one is omitted. No manifest was changed. These are truth/nullability/type follow-ups for H3, not failures concealed by altering fixtures.

| Manifest | Ajv failure |
|---|---|
| address-parse | data/postal_code must be string |
| au-company-data | data/acn must be string; data/business_names must be array |
| australian-company-data | data/company_name must be string; data/business_type must be string |
| belgian-company-data | data/industry must be string; data/commercial_name must be string |
| clinical-trials-search | data/status_filter must be string |
| commit-message-generate | data/body must be string |
| company-tech-stack | data/frontend_framework must be string |
| contract-extract | data/effective_date must be string |
| contract-verify-check | data/license_type must be string |
| credit-report-summary | data/credit_rating must be string; data/risk_indicator must be string |
| customs-duty-lookup | data/duty_rate must be string; data/duty_type must be string |
| danish-company-data | data/employee_range must be string |
| employer-review-summary | data/overall_rating must be number; data/recommend_percent must be number |
| ens-resolve | data/address must be string; data/avatar_url must be string |
| ens-reverse-lookup | data/ens_name must be string |
| eori-validate | data/trader_name must be string |
| iban-validate | data/branch_code must be string |
| image-to-text | data/text_type must be string; data/language_detected must be string |
| invoice-extract | data/vendor_name must be string; data/vendor_vat must be string; data/buyer_name must be string; data/buyer_vat must be string; data/invoice_number must be string; data/invoice_date must be string; data/due_date must be string; data/currency must be string; data/subtotal must be number; data/vat_amount must be number; data/vat_rate must be number; data/total_amount must be number; data/iban must be string; data/payment_reference must be string |
| irish-company-data | data/status_date must be string; data/dissolution_date must be string; data/nace_v2_code must be string |
| job-posting-analyze | data/title must be string |
| jwt-decode | data/expires_at must be string; data/is_expired must be boolean |
| latvian-company-data | data/termination_date must be string |
| linkedin-url-validate | data/slug must be string; data/accessible must be boolean |
| lithuanian-company-data | data/deregistration_date must be string |
| name-parse | data/last_name must be string; data/middle_name must be string; data/prefix must be string; data/suffix must be string; data/nickname must be string |
| patent-search | data/total_found must be integer |
| polish-company-data | data/address must be string; data/registration_date must be string |
| price-compare | data/lowest_price must be object; data/average_price must be number; data/highest_price must be object |
| pricing-page-extract | data/pricing_model must be string |
| product-reviews-extract | data/common_cons must be array; data/common_pros must be array; data/review_count must be number; data/average_rating must be number |
| product-search | data/total_results_estimate must be number |
| protocol-fees-lookup | data/revenue_7d_usd must be number; data/revenue_24h_usd must be number; data/revenue_30d_usd must be number |
| protocol-tvl-lookup | data/tvl_change_1d_pct must be number; data/tvl_change_7d_pct must be number |
| public-holiday-lookup | data/next_upcoming must be object |
| return-policy-extract | data/free_returns must be boolean; data/refund_method must be string; data/return_window_days must be number |
| salary-benchmark | data/p25 must be number; data/p75 must be number; data/currency must be string; data/median_salary must be number |
| sepa-xml-validate | data/message_type must be string |
| serp-analyze | data/featured_snippet must be object |
| shipping-track | data/best_match must be object |
| social-post-generate | data/thread_version must be array |
| swift-message-parse | data/amount must be number; data/currency must be string; data/sender_bic must be string; data/receiver_bic must be string |
| swiss-company-data | data/ch_id must be integer; data/purpose must be string; data/registration_date must be string |
| tech-stack-detect | data/cms must be string; data/hosting must be string; data/css_framework must be string; data/frontend_framework must be string |
| terms-of-service-extract | data/governing_law must be string |
| tool-call-validate | data/corrected_input must be object |
| trustpilot-score | data/rating_distribution must be object |
| uptime-check | data/status_code must be integer |
| vasp-non-compliant-check | data/register_last_updated must be string |
| vasp-verify | data/register_last_updated must be string |
| xml-to-json | data/json must be object |

## Before/after challenges for three tools

These are discovery/payment projections from actual builder output with identical test payment configuration (not production wallet settings). Large output example values are represented by `example_present`; the gate validates their complete values against the schemas. Corresponding free production GETs all returned 402/v2, PAYMENT-REQUIRED headers, placeholder input and no output metadata, confirming production has not changed.

### email-validate

```json
{
  "slug": "email-validate",
  "before": {
    "x402Version": 2,
    "resource": {
      "url": "https://api.strale.io/x402/v2/email-validate",
      "description": "Check email syntax, mail-server records, disposable domains, role addresses and likely typos. Returns checks without confirming a mailbox exists.",
      "mimeType": "application/json"
    },
    "input": {
      "type": "http",
      "bodyType": "json",
      "body": {
        "email": "example_email"
      },
      "method": "POST"
    },
    "output": {
      "example_present": false
    },
    "payment": {
      "maxAmountRequired": "54000",
      "payTo": "0x0000000000000000000000000000000000000001",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "network": "base-sepolia",
      "scheme": "exact",
      "resource": "https://api.strale.io/x402/v2/email-validate",
      "maxTimeoutSeconds": 300
    }
  },
  "after": {
    "x402Version": 2,
    "resource": {
      "url": "https://api.strale.io/x402/v2/email-validate",
      "mimeType": "application/json",
      "serviceName": "Strale",
      "tags": [
        "validation",
        "email validation"
      ],
      "iconUrl": "https://strale.dev/favicon-32x32.png",
      "description": "Email Validation: Check email syntax, mail-server records, disposable domains, role addresses and likely typos. Returns checks without confirming a mailbox exists."
    },
    "input": {
      "type": "http",
      "bodyType": "json",
      "method": "POST"
    },
    "output": {
      "type": "json",
      "example_present": true
    },
    "payment": {
      "maxAmountRequired": "54000",
      "payTo": "0x0000000000000000000000000000000000000001",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "network": "base-sepolia",
      "scheme": "exact",
      "resource": "https://api.strale.io/x402/v2/email-validate",
      "maxTimeoutSeconds": 300
    }
  },
  "v1_payment_fields_byte_identical": true
}
```

### image-to-text

```json
{
  "slug": "image-to-text",
  "before": {
    "x402Version": 2,
    "resource": {
      "url": "https://api.strale.io/x402/v2/image-to-text",
      "description": "Read text from an image, including screenshots and document photos. Returns extracted text, a confidence estimate and detected language.",
      "mimeType": "application/json"
    },
    "input": {
      "type": "http",
      "bodyType": "json",
      "body": {
        "base64": "example_base64"
      },
      "method": "POST"
    },
    "output": {
      "example_present": false
    },
    "payment": {
      "maxAmountRequired": "54000",
      "payTo": "0x0000000000000000000000000000000000000001",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "network": "base-sepolia",
      "scheme": "exact",
      "resource": "https://api.strale.io/x402/v2/image-to-text",
      "maxTimeoutSeconds": 300
    }
  },
  "after": {
    "x402Version": 2,
    "resource": {
      "url": "https://api.strale.io/x402/v2/image-to-text",
      "mimeType": "application/json",
      "serviceName": "Strale",
      "tags": [
        "file-conversion",
        "OCR",
        "image to text"
      ],
      "iconUrl": "https://strale.dev/favicon-32x32.png",
      "description": "Image to Text (OCR): Read text from an image, including screenshots and document photos. Returns extracted text, a confidence estimate and detected language."
    },
    "input": {
      "type": "http",
      "bodyType": "json",
      "body": {
        "image_url": "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg"
      },
      "method": "POST"
    },
    "output": {
      "type": "json",
      "example_present": false
    },
    "payment": {
      "maxAmountRequired": "54000",
      "payTo": "0x0000000000000000000000000000000000000001",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "network": "base-sepolia",
      "scheme": "exact",
      "resource": "https://api.strale.io/x402/v2/image-to-text",
      "maxTimeoutSeconds": 300
    }
  },
  "v1_payment_fields_byte_identical": true
}
```

### whois-lookup

```json
{
  "slug": "whois-lookup",
  "before": {
    "x402Version": 2,
    "resource": {
      "url": "https://api.strale.io/x402/v2/whois-lookup",
      "description": "Look up a domain's WHOIS record: registrar, creation and expiry dates, name servers, registrant details and the raw record.",
      "mimeType": "application/json"
    },
    "input": {
      "type": "http",
      "bodyType": "json",
      "body": {
        "domain": "example_domain"
      },
      "method": "POST"
    },
    "output": {
      "example_present": false
    },
    "payment": {
      "maxAmountRequired": "54000",
      "payTo": "0x0000000000000000000000000000000000000001",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "network": "base-sepolia",
      "scheme": "exact",
      "resource": "https://api.strale.io/x402/v2/whois-lookup",
      "maxTimeoutSeconds": 300
    }
  },
  "after": {
    "x402Version": 2,
    "resource": {
      "url": "https://api.strale.io/x402/v2/whois-lookup",
      "mimeType": "application/json",
      "serviceName": "Strale",
      "tags": [
        "web-intelligence",
        "WHOIS lookup"
      ],
      "iconUrl": "https://strale.dev/favicon-32x32.png",
      "description": "WHOIS Lookup: Look up a domain's WHOIS record: registrar, creation and expiry dates, name servers, registrant details and the raw record."
    },
    "input": {
      "type": "http",
      "bodyType": "json",
      "method": "POST"
    },
    "output": {
      "type": "json",
      "example_present": true
    },
    "payment": {
      "maxAmountRequired": "54000",
      "payTo": "0x0000000000000000000000000000000000000001",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "network": "base-sepolia",
      "scheme": "exact",
      "resource": "https://api.strale.io/x402/v2/whois-lookup",
      "maxTimeoutSeconds": 300
    }
  },
  "v1_payment_fields_byte_identical": true
}
```

## Twelve-query vocabulary and live Bazaar position check

Ran read-only CDP discovery searches for the twelve fixed queries, requesting limit 20; every response was HTTP 200 with `partialResults:false`. Positions below describe current production before deployment, not the unshipped metadata. Each of the eleven active target tools contains all query words across its public name/description and controlled tags. The twelfth tool is retired and deliberately receives no SEO tag.

| Query | Tool | Local vocabulary | Current Strale position |
|---|---|---|---|
| PEP check | pep-check | pass | 1 |
| beneficial ownership | beneficial-ownership-lookup | pass | 2, 5 |
| screenshot url | screenshot-url | pass | 7 |
| UK company data | uk-company-data | pass | 9 |
| sanctions screening | sanctions-check | pass | absent |
| email validation | email-validate | pass | absent |
| WHOIS lookup | whois-lookup | pass | absent |
| translate text | translate | pass | absent |
| OCR image to text | image-to-text | pass | absent |
| VAT number validation | vat-validate | pass | absent |
| tech stack detection | tech-stack-detect | pass | absent |
| keyword suggestions SEO | keyword-suggest | retired; deliberately unmatched | absent |

After deployment, repeat the same twelve-query Bazaar position check at days 0, 7, 21 and 30; record route-level positions and distinct new x402 payers over 60 days. D2 success: top 20 for at least six queries by day 21 and at least three new payers by day 60. Kill rule from strategy §8: **no search movement 30 days after deployment → stop metadata work**. Indexing requires a successful organic settlement and can take 15 minutes; ranking can lag six hours. Do not manufacture a paid call for this task.

## Review and verification

The `go` skill's verification and independent technical/product reviews were applied within the explicit no-commit/no-push scope. Two review rounds plus the required bounded confirmation reads resolved all HIGH/MEDIUM findings: format validation, embedded data/address/DOB/card privacy bypasses, schema traversal, bounded Ajv cache, method coverage and permissive validator schema. Both reviewers returned GO. A manual simplify pass kept selection/screening in one metadata module and shared the builder for both rails; no separate simplify skill is installed. No shipping step was performed.

The root CI run executed every command in the `check` job, including the optional brief lint, all lint guards, register checks/tests, MCP and TypeScript SDK builds, workspace typechecks, and `context:test` (180 passed). All 58 commands preceding the full API suite passed. [CI command/output record](../../../archive/sessions/2026-10-27-d2-ci-results.json) and [command summary](../../../archive/sessions/2026-10-27-d2-command-summary.json).

The first full API run failed a newly added schema-format regression (fixed and then passed in the targeted run) and the existing search performance check at 2022 ms against its 2000 ms limit. The final full-suite rerun is recorded separately below. Targeted metadata/catalog verification passed 790 tests in two files. The API project `npx tsc --noEmit` passed; `npm run typecheck` passed across the CI workspaces. An extra bare `npx tsc --noEmit` at repository root failed with 282 diagnostics in unrelated archived scripts/tests/examples and zero in touched files; the configured CI workspace typechecks remain the applicable gate. [Extra root-typecheck details](../../../archive/sessions/2026-10-27-d2-extra-root-tsc.json). No unrelated source was changed to address those diagnostics.

Ajv and ajv-formats are explicit API runtime dependencies. An attempted package-lock-only npm resolution could not write its default external cache; the already-installed/resolved dependency versions were recorded in the API manifest/lockfile, and `npm ci --dry-run --ignore-scripts --offline` then passed. Full `npm ci` had already passed in the CI command run.

`handoff:check` was run and remains red for the explicitly required uncommitted/unpushed state, existing merged branches and the other session's worktree. Its fetch attempt could not reach origin, so remote-branch findings may be stale. No commits, pushes, branch deletions or other-session cleanup were performed. This is an expected orchestrator-owned closeout limitation under the current brief, not a claimed passing handoff gate.

Post-deploy work left: deploy only after the orchestrator reviews this complete diff; fetch free v1/v2 challenges for the three sample tools and verify the PAYMENT-REQUIRED header equals the body on v2, provider metadata and omissions match this handoff, and payment fields still match the current production settings. Run the hosted CDP validator against those deployed URLs, record advisory omissions honestly, then follow the day 0/7/21/30 measurement plan. No database migration, new production credential or production write command is required by this change.

The second default-concurrency full API run passed all D2 tests but still failed the existing frozen-catalog search timing check (3027 ms against 2000 ms): 7226 passed, one failed, 346 skipped. [Default-concurrency rerun](../../../archive/sessions/2026-10-27-d2-api-final.json). The complete suite was then run with two workers to reduce test contention, with no source/threshold change; its result is recorded below.

Final two-worker full-suite result: **7226 passed, 1 failed, 346 skipped; 348 files passed, 1 failed, 33 skipped**. Search quality passed in this run, but the unchanged `domain-contact-extract` timing-ratio assertion failed (151.657 ms versus a 146.262 ms calculated limit). [Two-worker full-suite result](../../../archive/sessions/2026-10-27-d2-api-bounded-workers.json). Both unrelated timing-test files then passed together in isolation with one worker: **38 tests, 2 files**, [isolated timing verification](../../../archive/sessions/2026-10-27-d2-existing-timing-tests.json). Neither timing test nor its implementation/threshold was edited.

**The full-suite gate remains red.** The implementation and D2 gates are complete, but the orchestrator must account for these unrelated timing failures before treating the branch as fully green. This handoff does not authorize deployment over a failing gate. Fresh evidence is in the [stdin receipt](../../../archive/receipts/2026-10-27-test-run-x402-bazaar-challenge-metadata.json); it records the red checks rather than claiming universal success. The final API typecheck, claims/docs/env checks, lint guards and diff check are recorded in [final checks](../../../archive/sessions/2026-10-27-d2-final-checks.json). The [independent review record](../../../archive/sessions/2026-10-27-d2-review.md) covers the code/privacy findings separately from these verification limitations.

Two extra workspace lint aliases (`lint:ssrf-inventory` and `lint:no-external-column-access`) failed because those scripts expect the repository root as their working directory. Their actual CI commands (`node apps/api/scripts/check-ssrf-inventory.mjs` and `node apps/api/scripts/check-no-external-column-access.mjs`) were rerun from the root and passed, as they also did in the full root CI command run. Both unsuccessful invocations and corrected results are retained in final-check evidence; no unrelated lint script was changed.

Closeout: the fresh receipt passed `receipts:check` (99 receipts; existing historical handoff warnings only). Final docs, strict PII and diff checks passed; `handoff:check` remained red under the explicit uncommitted/unpushed/other-session exceptions. [Closeout command evidence](../../../archive/sessions/2026-10-27-d2-closeout-checks.json).


## Round 3 — 2026-10-28

Intent: Fix the independent review's header-size and output-privacy blockers, enforce POST discovery requirements and leave all work uncommitted for the orchestrator. This section supersedes the earlier POST-optional-body and example-coverage statements above.

### Behaviour changes

- Drop each input/output example whole when its UTF-8 JSON exceeds 1,024 bytes. Both walks now apply the same privacy and placeholder screen. Capabilities declaring `processes_personal_data: true`, or category `compliance`/`screening`, publish neither example. Tests cover the five named sensitive capabilities and planted output personal data.
- Budget the final encoded `PAYMENT-REQUIRED` header at 8,192 bytes, including all four initial/failure response sites: remove output first, then input. When schema data still exceeds the budget, log once per slug and omit discovery schemas, including legacy `outputSchema` mirrors. Payment fields are preserved. An oversized facilitator diagnostic gets a bounded actionable error only after discovery removal cannot fit it.
- POST without a safe example uses `body: {}` only when no required properties exist and the schema accepts `{}`. This includes checking `anyOf` requirements. Otherwise omit the Bazaar extension entirely and retain `resource.serviceName`, `description`, `tags` and `iconUrl`. Never invent values.
- `resource.description` still uses the manifest name and description. `/catalog` URLs remain as previously implemented. DQ-39 was accepted on 2026-10-28; Serper tool names remain unchanged: Google Search (`google-search`), Search Results Analysis (`serp-analyze`), Brand Mention Search (`brand-mention-search`), Google News Search (`google-news-search`), SERP Related Questions (`serp-related-questions`), Keyword Rank Check (`keyword-rank-check`), and Adverse Media Check (`adverse-media-check`, Serper fallback).
- Move the offline validator to `src/test-helpers/x402-discovery-validator.ts`; explicitly exclude that directory from API compilation. Ajv and ajv-formats remain runtime dependencies because `x402-discovery-metadata.ts` validates manifest and runtime-schema examples with them. No package or lockfile change is needed.
- Warm manifest/runtime Ajv validation in `beforeAll`; the aggregate catalogue header test has a 60-second timeout.

### POST specification branch

Re-read the [Bazaar specification](https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md) and installed `@x402/extensions` 2.10 types. Its POST example requires: `"required": ["type", "method", "bodyType", "body"]`. The extension uses `info` plus its validating `schema`; installed `BodyDiscoveryExtension` requires `info: BodyDiscoveryInfo`, and `BodyDiscoveryInfo.input` requires `body: Record<string, unknown>`. No metadata-only Bazaar declaration without `info` is specified. Therefore the chosen branch is **omit the entire Bazaar extension** for required-input POST resources lacking a safe example, while preserving the separate resource metadata. Both optional-input `{}` and required-input omission branches have tests.

### Header distribution and example coverage

Offline matrix: all 356 manifests, GET/POST, as both capability and solution: 1,424 challenges. Maximum 8,152 bytes; p95 6,456; median 4,048; over 8,192 bytes: **0**. Before the fix, the same regression failed on HEAD 94e3f631: maximum 46,408; p95 9,712; median 4,878; over budget 120. That baseline includes solution-shaped challenges as well as capabilities.

| Fixture kind | Method | Input examples | Output examples | Empty-body fallback |
| --- | --- | ---: | ---: | ---: |
| Capability | GET | 108 | 18 | — |
| Capability | POST | 108 | 9 | 34 |
| Solution | GET | 0 | 0 | — |
| Solution | POST | 0 | 0 | 34 |

Counts describe manifest-only fixtures after privacy/schema/header filtering, not current live DB eligibility. Empty POST bodies are listed separately, not counted as newly invented examples. Actual solutions have no manifest examples; the solution matrix deliberately reuses each manifest schema with a solution identity to prove isolation and budgeting.

### Verification and limits

Evidence: [round 3 receipt](../../../archive/receipts/2026-10-28-test-run-x402-bazaar-round3.json) and [trimmed command results](../../../archive/sessions/2026-10-28-d2-round3-checks.json).

- PASS: MCP server build, API typecheck, both touched test files, final x402 run (963 passed / 2 skipped; 17 files passed / 1 skipped), and final catalogue run (740 passed). The final x402 run includes the 3 KB / 12 KB verification-error regressions and stricter POST validator.
- Full API suite: 7,383 passed / 358 skipped / 1 failed; 364 files passed / 35 skipped / 1 failed. The only failure was the untouched `src/lib/search/search-quality.test.ts` wall-clock test: 2,969 ms against a 2,000 ms threshold. First single-file rerun during suite load also failed (3,801 ms). After the full suite ended, the single-file rerun passed all 13 tests. Report this as a timing flake, not an unqualified green full run. The full suite started before the final verification-diagnostic guard; affected x402 tests were rerun on final code afterwards.
- PASS: `claims:check`, `models:check`, `env:check`, `docs:check`, `programs:check`, `receipts:check` (existing historical handoff warnings only), and `git diff --check`. `tsc --listFilesOnly` confirms the moved validator is excluded from runtime compilation.
- Expected RED: `handoff:check` reports `dirty`, `ahead` (feature branch tracks origin/main), and existing `merged-branch` findings. Its origin fetch was unavailable, so remote findings may be stale. Per explicit instructions, no commit/push or branch cleanup was attempted.
- Independent technical and product review caught final-error re-encoding after the initial budget; all four sites now budget the final body. The technical confirmation cleared that HIGH. Its further oversized-diagnostic MEDIUM is covered by the bounded-error fallback and 12 KB regression. Product verdict: GO. No `simplify` skill was available; the manual simplification pass consolidated all final encoding into one helper.
- Invocation correction: the initial quoted Vitest glob found no files; `vitest run x402` was used for actual x402 verification. An extra `src/lib/search*.test.ts` shell-glob run covered `search.test.ts` (11 passed); the actual failing search-quality file was then rerun explicitly as described above.

 No production writes, paid requests, deployment, commit, push, PR, merge or publication was performed. No production commands are required for these fixes; deployment and external validation remain with the orchestrator. [BACKFILL] This handoff is the session record; no Notion write was requested or performed.

## Follow-up — 2026-10-28

The header budget now removes the two legacy `outputSchema` mirrors after examples and before removing the Bazaar extension. The whole-word placeholder screen also inspects decoded strings, markup and parsed JSON values, including `value`; solutions still have no invented examples. This also withholds strings containing `example` as a whole word, including reserved example-domain fixtures.

The Round 3 matrix method was repeated on all 356 manifests × GET/POST × capability/solution (1,424 v2 challenges), with identical fixture inputs on `origin/main` and this change:

| Measure | Before | After |
| --- | ---: | ---: |
| Maximum encoded header bytes | 8,152 | 8,152 |
| p95 bytes | 6,456 | 6,544 |
| Median bytes | 4,048 | 4,078 |
| Over 8,192 bytes | 0 | 0 |
| Challenges with Bazaar extension | 861 | 880 |

Of the 20 capability GET challenges previously missing the extension, 19 now retain it; `invoice-counterparty-check` still exceeds the budget without the mirrors. POST challenges may independently omit the extension when their required input lacks an eligible example. The unchanged payment projection (all fields of both `accepts` and `paymentRequirements`, excluding only discovery `outputSchema`) was JSON-serialized for each keyed matrix entry in order and SHA-256 hashed. Both revisions produced `fa21739acdb10953b7536b8c7944649046b6c230f3b4edd271cba7da7fc7a3c6` across all 1,424 combinations. This is offline fixture evidence, not a live production comparison.

The large `us-company-data` GET regression asserts both the extension and the limit; the all-challenge budget test remains. New privacy tests cover markup, JSON and percent encoding, and distinguish substrings. The final x402 run passed 968 tests with two skipped. The full API suite passed 7,395 tests, with 358 skipped; 365 files passed and 35 were skipped, so no isolated failure reruns were needed. MCP build, API typecheck, claims, models, env, docs, programs and receipts checks passed. The first x402 run failed eight assertions with the old assumptions; those assertions were updated to match the intended placeholder and budget behavior, then the final run passed. See the [follow-up receipt](../../../archive/receipts/2026-10-28-test-run-x402-discovery-coverage.json).

The orchestrator owns independent review and shipping; no independent review, live check, commit, push, PR, deployment or production write was performed. No production migration or configuration change is required. [BACKFILL] No Notion Journal write was requested or performed.
