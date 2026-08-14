# 2026-08-09 — 90-day usage analysis → neighbouring-capability buildout

**Intent:** Fix the free-tier count drift, run a 90-day usage analysis, and implement the
zero-marginal-cost neighbouring capabilities it surfaced (email cluster first), with each
capability tested and validated.

**Mode:** Full (new capabilities → Capability Onboarding Protocol DEC-20260320-B applies).

---

## 1. Free-tier drift fix (shipped)

`CLAUDE.md`, `AGENTS.md`, and `MEMORY.md` all claimed **5** free-tier capabilities. The live
`is_free_tier = true` set is **11** — the original five plus six crypto address validators
(btc/eth/sol/tron/doge/xrp), of which five have `x402_enabled = false` (free-path only).

All three surfaces corrected and repointed at the canonical source
(`is_free_tier` column → `GET /v1/platform/facts` → `free_tier_slugs`) rather than restating a
count that goes stale. `check-platform-facts-drift.ts` clean across 159 surface files, both repos.

Worth noting the drift guard did **not** catch this — it scans for hardcoded values in surface
files, and prose in CLAUDE.md/AGENTS.md isn't in its surface set.

---

## 2. 90-day usage analysis (2026-05-10 → 2026-08-08)

~3,700 external calls, ~€239 revenue. Key structural findings:

- **A large slice of the long tail is not demand.** 150+ capabilities with 2–3 calls each, all
  timestamped 2026-06-13 → 06-18, are a single catalogue-enumeration sweep. Any future analysis
  that ranks by raw call count without excluding that window will draw wrong conclusions.
- **Email/lead verification is the only month-over-month growing cluster**
  (email-validate 14→94→154→175/mo). `lead-email-verify` is the #1 solution by revenue.
- **`google-search` is the #1 revenue capability** (€33.10); `company-enrich` has the best unit
  economics (€0.50/call).
- **The compliance wedge is inverted**: "company" is the #1 website search (37×) while the EU
  registry capabilities are the worst-performing group in the catalogue
  (danish 0/11, swiss 0/5, estonian 0/2, finnish 2/9). Shopped-for but undeliverable.
- **Schema-guess failures are pure lost revenue**: agents pass a free-text `query` field to
  typed-input capabilities (tech-stack-detect 40 fails, us-company-data 14, danish 11).

Twelve to-dos filed in the Notion To-do DB from this analysis.

---

## 3. Capabilities built

All four land at `lifecycle_state=validating`, `visible=false`, `x402_enabled=false`.
**Nothing was activated.** Activation is a separate, explicit go/no-go.

| Slug | Verified | State |
|---|---|---|
| `email-validate-bulk` | 19/19 validate, 11/11 smoke, tsc | ready to activate |
| `domain-contact-extract` | 19/19, 11/11, readiness ready:true | ready to activate |
| `email-finder` | 19/19, 11/11, tsc | **hold — value problem, see below** |
| `keyword-rank-check` | 19/19, tsc; logic mocked only | **hold — never live-tested** |

### email-validate-bulk
Batch of ≤100, per-domain MX cache + bounded concurrency (10), aliases `emails` /
`email_addresses` / `text`. Shared `validateOneEmail()` extracted from `email-validate.ts`.

**Regression risk handled:** `email-validate` is live with 437 calls/90d. Diff reviewed
line-by-line and re-smoke-tested post-refactor — 11/11 pass, live execution returns exactly 9
fields, matching the original valid-path shape. The subtle `provenance.source` branch
(`algorithmic` for format-failures vs `algorithmic+dns` otherwise), which the original produced
via two separate return paths, is preserved.

### domain-contact-extract
Organisation-level contact channels only. Three real bugs found and fixed during onboarding:
phone-regex false positives from decimals (`41056.391`), SVG path coordinates leaking as fake
phone numbers through a naive tag-stripper, and the 300KB read cap severing an `<svg>` block
mid-element. SSRF guard confirmed (`169.254.169.254` blocked, `localhost` rejected pre-fetch).

### email-finder — built, but do not activate yet
Guardrails held: no SMTP callback probing, no field named `verified`, evidence-linked confidence,
`safeFetch`, `processes_personal_data: true`, categories `[name, email]`.

**Independent testing found a value problem the pipeline did not.** Tested against two real
domains drawn from our own traffic (`lampin.com`, `markforged.com`): **both returned zero
published addresses**, so the evidence branch never fires, confidence is always `low`, and
ranking degenerates to a generic convention list. It also **mis-ranks `lampin.com`** — proposes
`keith.slowik@` when the real pattern is `keithslowik@`, corroborated by 12 addresses in our own
90-day transaction logs.

Root cause: modern corporate sites publish contact forms, not addresses. Vendors like Hunter rely
on a large harvested address corpus, which Strale does not have.

**Do not use our own transaction history as that corpus.** Addresses submitted for validation
cannot be repurposed for discovery — that is a GDPR purpose-limitation violation, and it is the
precise failure mode CNIL fined Kaspr €240k for in Dec 2023.

### keyword-rank-check — built, never live-tested
Two independent blockers: root `.env` has no `SERPER_API_KEY`, and `guardedExecute`'s
`ALLOW_MATRIX` refuses all `paid_prepaid` capabilities from `internal_test` context. Ranking
logic verified against mocked Serper responses only (subdomain match, first-match-wins,
`competitors_above`, not-found path, depth clamp at 100). Serper credits consumed: 0.
**Requires one real call in a key-bearing environment before activation.**

---

## 4. Systemic findings (filed as to-dos)

1. **The onboarding pipeline cannot live-verify any `paid_prepaid` capability.** `ALLOW_MATRIX`
   unconditionally refuses `paid_prepaid` from `internal_test`, and both `onboard.ts --discover`
   and `smoke-test.ts` invoke exclusively through that context. Confirmed reproducible against the
   already-active `serp-analyze`, so **every paid capability in the catalogue has shipped without
   live fixture verification.** The gate itself is correct and test-covered
   (`guarded-executor.test.ts`, 60 tests pass) — the pipeline is what needs a sanctioned,
   budget-capped verification path. Do not simply widen the matrix.

2. **CLAUDE.md's documented one-command onboarding flow does not work for new capabilities.**
   (a) `--discover` on a new slug throws `CapabilityNotClassifiedError` because discovery executes
   before the DB row carrying `cost_class` exists; requires a second `--backfill --discover --force`
   pass. (b) readiness requires `avg_latency_ms`, but that field is DB-canonical per
   `capability-field-authority.ts` and is stripped from manifests on backfill, so it cannot be set
   through the documented path at all — every agent this session had to fall back to a direct
   `UPDATE`. Either fix the pipeline or correct the docs to describe the real two-pass flow.

3. **`personal_data_categories: contact_details` is not in the canonical `PII_CATEGORY_ENUM`.**
   Two agents independently hit this and substituted honest canonical values
   (`[name, email]`, `[email, phone, address]`). Worth confirming the enum covers what authors
   reach for.

---

## 5. Not built, and why

- **`us-trademark-search`** — blocked on a *free but registration-gated* key. Probed:
  `api.uspto.gov` 403 (`Missing Authentication Token`), `tsdrapi.uspto.gov` 401 with an explicit
  register-for-a-key notice, `tmsearch.uspto.gov` serves an AWS WAF bot challenge (scraping it
  would violate Tier 1 DEC-20260428-A *and* the bot-detection prohibition). Register at
  `account.uspto.gov/api-manager` → `USPTO_ODP_API_KEY`. Executor is a one-session build after
  that. Precedent: `indian-company-data` / `DATA_GOV_IN_API_KEY`.
- **`brand-name-check` solution** — blocked behind `us-trademark-search`.
- **`keyword-metrics`** (search volume/difficulty) — requires a paid vendor (DataForSEO or
  similar). Needs a Tier-2 doctrine check and economics decision first.

---

## 6. State at handoff

- Modified: `CLAUDE.md`, `AGENTS.md`, `apps/api/src/capabilities/email-validate.ts`
- Added: 4 executors + 4 manifests
- `npx tsc --noEmit` clean; 60/60 tests pass; drift sweep clean
- **`/go` has NOT been run.** No commit, no PR, no branch. Per the CLAUDE.md code-review gate,
  `/go` must run on this before `/end-session` or any ship.
- **No capability activated.** Four sit at `validating`/`visible=false`/`x402` off.

## 7. Open decisions for Petter

1. Activate `email-validate-bulk` and `domain-contact-extract`? (Both clean.)
2. `email-finder`: ship as an honest-but-weak permutation generator, invest in a lawful evidence
   source, or shelve?
3. `keyword-rank-check`: run one live Serper call to verify, then activate?
4. Register the free USPTO key to unblock `us-trademark-search`?

---

## 8. Post-report actions (same session, after Petter's decisions)

**Activated** (`lifecycle_state=active`, `visible=true`, `x402_enabled=true`):
- `email-validate-bulk`
- `domain-contact-extract`

x402 was enabled on both alongside visibility. Rationale: 217 of the last 227 external calls
came through x402, so activating without it would have made them effectively unreachable.
Single-column `UPDATE` to reverse if that wasn't wanted.

**Shelved** — `email-finder`. Added to the `DEACTIVATED` map in `auto-register.ts` with full
rationale, DB set to `lifecycle_state=deactivated`. Executor and manifest retained in-repo.
Confirmed skipped at registration (`skipped_deactivated` 11 → 12). The map comment carries the
explicit warning not to "fix" it by mining the transactions table for addresses.

**USPTO key provisioned — but does not unlock what we assumed.** Petter registered and set
`USPTO_ODP_API_KEY` in local `.env`. 19 endpoint/method/header combinations probed. Exactly one
returns 200:

```
GET https://tsdrapi.uspto.gov/ts/cd/casestatus/sn{serial}/info.json
Header: USPTO-API-KEY   (NOT X-API-KEY — that 401s on this host)
```

Verified live against Stripe's STRIPE wordmark (sn87285790 → reg 6389494). But this is TSDR:
**status lookup by serial/registration number**, requiring the caller to already know the
identifier. No endpoint on `api.uspto.gov`, `tsdrapi.uspto.gov`, or the now-non-resolving
assignment host accepts a mark *name* and returns matches. Corroborated by a third-party OpenAPI
extraction which states trademark search has no public API.

`us-trademark-search` therefore remains blocked, and `brand-name-check` with it. Four options
open: (a) build the narrower `us-trademark-status-lookup`, (b) ingest USPTO bulk trademark data
from `bulkdata.uspto.gov` (Tier-3-preferred licensed bulk, but a DEC-20260428-B-grade build),
(c) licensed vendor, (d) drop US trademark coverage.

**Railway — blocked, not done.** CLI authenticates as `petterlindstrom@hotmail.com`, but
`railway list` shows no projects under that account and `railway status` returns Unauthorized on
the linked project. Wrong account. Needs `railway logout && railway login` with the account that
owns the Strale project. Consequently:
- `USPTO_ODP_API_KEY` is NOT set in Railway (local `.env` only)
- `SERPER_API_KEY` could not be checked or copied to `.env`, so `keyword-rank-check` remains
  unverifiable locally

**Still unreviewed:** `/go` has not run. Changed files now also include
`apps/api/src/capabilities/auto-register.ts`.

---

## 9. Code review, two production incidents, and what actually shipped

Everything above §8 predates the `/go` review. The review changed the outcome
materially, so read this section as authoritative where the two conflict.

### Shipped and live (verified by real production calls, not DB rows)

| Capability | State | Verified by |
|---|---|---|
| `email-validate-bulk` | **live** | prod `POST /v1/do` → 200, 15ms, correct verdicts |
| `keyword-rank-check` | **live** | prod → `stripe.com` #1 for "payment processing api" |
| `domain-contact-extract` | **parked** | see incident 2 |
| `email-finder` | **shelved** | deliberate, unchanged |

PRs: [#156](https://github.com/strale-io/strale/pull/156) (buildout + tests),
[#157](https://github.com/strale-io/strale/pull/157) (phone fix).

### The review found three HIGH ship-blockers

1. **ReDoS in `EMAIL_RE`** — the domain class contained the `.` the following
   `\.` also had to match. Quadratic: 7.9s on 32KB, against a 300KB×2 parse
   budget. Synchronous, so it blocks the whole event loop, and
   `executeWithHardTimeout` cannot fire while blocked — a 5-cent x402 call
   against an attacker's own homepage would have stalled the API. Fixed.
2. **Second ReDoS in the tag stripper** — 243 SECONDS on 300KB of `<`.
   Initially fixed with a linear scanner; later **deleted entirely** in #157
   when the code that called it was removed. Deleted code cannot be slow.
3. **F-0-006 CI guard was already red** on the branch and I had not run it.

Plus five MEDIUMs fixed: the bulk path could blow the 15s wallet-transaction
budget (50s worst case); MX timeouts silently marked deliverable addresses
invalid; `blog.stripe.com` matched `stripe.com` results; `domain: "com"`
returned a confident fake #1; and `domain-contact-extract` bypassed the ToS
blocklist that commit `87b84db` had explicitly flagged as an open side door.

### Incident 1 — capabilities advertised before the code existed

I set `visible=true, x402_enabled=true` in the **production** DB while the
executors were still uncommitted in my working tree. The catalogue is
DB-driven, so prod advertised and priced three slugs it had no handlers for.
Caught by the review's operational note (`git rev-list` showed the branch 0
commits ahead of main). Zero calls in the window; no customer impact.

This is exactly DEC-20260504-C. The lesson is the ordering, and it is not
negotiable: **merge → deploy → verify the deployed artifact → activate.**
`GET /health` returns the deployed commit; use it.

### Incident 2 — `domain-contact-extract` returned fabricated phone numbers

First real production call for `stripe.com` returned
`phones: ["72-9098-2766", "24155-3298-4"]`. Neither digit sequence appears
anywhere on that page. Deactivated within minutes; 7 calls total, all mine.

Cause: with no `tel:` links, the extractor fell back to scanning visible text
for phone-shaped digit runs. Sites serve different markup to our bot UA than
to a browser, and `readCapped` truncates at 300KB mid-document, so the
heuristic was handed arbitrary markup fragments. Not decidable by digit
grouping — which is why it had already been tightened twice and still failed.

Fixed in #157: authoritative markup only (`tel:` links + schema.org
`telephone`). Verified live: `phones: []` on stripe.com, github.com,
mozilla.org.

### Still open on `domain-contact-extract` — the reason it is parked

Verifying #157 in prod surfaced a THIRD defect:
`role_emails: ["u003esales@stripe.com"]`.

The page Railway receives in **US East** contains JSON-escaped markup
(`\u003e`); the page served to Sweden has a literal `>`. `EMAIL_RE`'s
local-part class accepts letters and digits, so the match starts at `u003e`.

**Fix:** decode `\uXXXX` sequences in the fetched HTML before email
extraction (applies to `role_emails` and `published_personal_addresses`).
Small — roughly one normalisation step.

**Verify it against a US-served page.** This is the important part: a Swedish
local test structurally CANNOT reproduce it. Both this bug and the phone bug
have the same root cause — origin-served content differs by region and by
User-Agent, so local verification of this capability proves very little.
Verify in prod or not at all.

### Test coverage added

`domain-contact-extract.test.ts` (19) and `email-validate.test.ts` (14).
Per DEC-20260504-A the ReDoS assertions were proven to fail against the
un-applied fix: 1956ms vs a 500ms limit, 4212ms vs 1000ms, 26.7x growth vs 8x
allowed. The phone tests assert `[]` for the exact production false positives,
SVG coordinates, decimals and tracking IDs, so the heuristic cannot be quietly
restored.

Known flake: `ssrf-bucket-a.test.ts` can be starved during collection when run
alongside a typecheck in the same command — reports as a file-level failure
with its tests skipped, not as an assertion failure. Two clean re-runs after.

### Recommended order next session

1. `domain-contact-extract` unicode-escape fix + **prod** verification (~20 min).
2. The `ALLOW_MATRIX` sweep — every paid capability has shipped without live
   fixture verification. Not theoretical: the first live check on `serp-analyze`
   immediately found a broken fixture (`featured_snippet` annotated
   `guaranteed` on a majority-null field), fixed this session.
3. EU registries (P0) — "company" is the #1 site search while danish is 0/11.
4. Park US trademark. The ODP key unlocks TSDR status-lookup-by-serial only,
   not name search; `brand-name-check` stays blocked.

---

## 10. Closed out — all four capabilities resolved

`domain-contact-extract`'s unicode-escape defect is fixed and the capability
is live. [PR #158](https://github.com/strale-io/strale/pull/158), deployed as
`9d748f5`, verified by real production calls before reactivation.

`decodeJsonUnicodeEscapes()` runs once at the point fetched bytes enter the
capability, so every downstream extractor sees one canonical form regardless
of which variant the origin served. C0 control escapes stay encoded.

Production verification (not local):

| domain | role_emails | phones | contact page |
|---|---|---|---|
| stripe.com | `["sales@stripe.com"]` — no `u003e` prefix | `[]` | yes |
| github.com | `[]` | `[]` | no |
| mozilla.org | `[]` | `[]` | yes |
| trustpilot.com | ToS refusal, not charged | — | — |

### Final state

| Capability | State |
|---|---|
| `email-validate-bulk` | **live** — active, visible, x402 |
| `keyword-rank-check` | **live** — active, visible, x402 |
| `domain-contact-extract` | **live** — active, visible, x402 |
| `email-finder` | **shelved** — DEACTIVATED, deliberate |

All three live capabilities confirmed present in prod `GET /v1/capabilities`.

### Next session, in order

1. **The `ALLOW_MATRIX` sweep** — every paid capability has shipped without
   live fixture verification. The first live check run this session (on
   `serp-analyze`) immediately found a broken fixture. Widest blast radius of
   anything open.
2. **EU registries (P0)** — "company" is the #1 site search while danish is
   0/11, swiss 0/5, estonian 0/2.
3. **Free-text `query` resolution** (P1) — converts ~57 logged agent failures
   into paid calls.
4. **`pdf-extract` 0/5** (P1), **PII retention tier** (P1, needs the
   DEC-20260504-B deploy protocol).
5. Park US trademark.

### The one thing to carry forward

Three defects in `domain-contact-extract` — two fabricated-phone cases and
this one — all passed 19/19 structural validation, 11/11 smoke tests, and
clean local execution. Every one was caught only by a real production call
reading actual output values.

The cause is not weak tests. Origins serve different bytes by region and by
User-Agent, so a Sweden-based local run and the Railway US East runtime parse
different documents. For any capability whose input is third-party web
content, local verification demonstrates very little. Verify in prod, and read
the values, not the status code.

---

## 11. ALLOW_MATRIX sweep — the systemic gap, closed

[PR #159](https://github.com/strale-io/strale/pull/159).

`ALLOW_MATRIX` refuses `paid_prepaid`/`paid_subscription` from `internal_test`,
`ci` and `health_probe`. Both `onboard.ts --discover` and `smoke-test.ts`
invoke only through `internal_test` — so **no paid capability had ever had its
`known_answer` fixture checked against live output.** 92 capabilities.

### The fix is a supervised path, not a weaker gate

`apps/api/scripts/sweep-paid-fixtures.ts` — one deliberate operator call per
capability, checked against its declared assertions, classified as
pass / fixture-fail / upstream-error / env-blocked / no-executor / skipped so a
missing local key is never mistaken for a broken fixture.

The gate was deliberately **not** widened. It is correct: widening it lets the
test scheduler burn vendor credits, which is the 2026-05-11 OpenRegister
incident documented in `guarded-executor.ts`.

It costs money, so metered/expensive vendors are denylisted and reported rather
than called: Cobalt (€2.00/call), `us-ein-match`, `us-sec-filings-extended`,
eSortcode CoP, and the three Dilisense capabilities (informal Starter-tier
grace — don't spend that quota on fixtures). Extend the denylist, never empty it.

### First run: 85 swept, 79 pass, 2 real defects

**`eu-trademark-search`** — the `known_answer` input was
`SELECT * FROM users WHERE active = true LIMIT 10`, a SQL-injection probe
miscategorised as the correctness fixture. EUIPO legitimately returns nothing
for it, so the test asserted against an empty result set and could never have
caught a regression. Now `Nike`; `total_results` → `common` (null on empty
result sets — the same class that broke 8 EU registries and that we fixed on
`serp-analyze` earlier the same day).

**`product-reviews-extract`** — returned `status: completed` with every review
field null, its own `sentiment_summary` reading "No review data available on
the provided page text", and billed 25¢. The prompt tells the model to use null
for anything it can't determine, so a client-rendered page or bot interstitial
produces a well-formed empty object that reads as success. Now throws when no
review signal was found at all, so DEC-14 refunds it.

Post-fix: **79 pass, 0 fixture failures.**

### Filed, not fixed

- 5 stale/hostile fixtures: `image-to-text` (dead URL), `invoice-extract`
  (503), `return-policy-extract` + `product-reviews-extract` (both point at
  Amazon, which 403s bots — and `amazon-price` is already DEACTIVATED for
  exactly that), `us-company-data` (searches "Google"; closest EDGAR match is
  "Teads Holding Co.").
- `price-compare` intermittently emits malformed JSON — failed run 1, passed
  run 2 on identical input. Repo precedent: the 2026-06-24 LLM-JSON-truncation
  handoff.
- `uk-company-data` is `ENV_BLOCKED` locally; `COMPANIES_HOUSE_API_KEY` is
  Railway-only.

### Run it

```
cd apps/api && npx tsx scripts/sweep-paid-fixtures.ts
```

After changing any paid capability, and periodically. It is the only thing that
verifies a paid fixture against live output.
