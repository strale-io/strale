# 2026-08-12 — Readiness P2+P3 shipped; eight parallel audits; KYB directive started

**Intent:** Continue past P1 — P2 underbuilt items, P3 quality floor, and (per Petter's
directives) token-heavy parallel analysis + the KYB wiring/coverage workstream.

Continues `2026-08-12-readiness-p1-truth-pass.md` (same day). Petter-only items PARKED
per instruction: CourtListener token, product-reviews-extract deactivation, datacvr
application.

## Shipped

| PR | Content |
|---|---|
| [#180](https://github.com/strale-io/strale/pull/180) | P2: do.ts anyOf parity (group-declared schemas only), EUR-Lex JS-challenge escalation + results-region parse (verified live: AI Act first hit; async routing after avg_latency fix 10000→35000), ToS blocklist moved to src/lib + enforced in safeFetch (entry + per-hop) and fetchPage, scheme-case bypass fixed (HTTPS:// defeated the whole gate), price-compare Google fallback removed (Nordic-only, honest error), x.com probe removed from startup-domain-check, redirect-trace partial chains |
| #181 (P3, in flight at handoff time) | Quality floor + transaction-failure taxonomy. **Dry-run by default — set QUALITY_FLOOR_ENFORCE=true on Railway to arm (Petter).** Two adversarial review rounds; second round closed 4 HIGHs (outage-blind taxonomy, Sybil surface, polluted exclusion list, no brake). Heartbeat event = DEC-20260504-C proof query |
| [#182](https://github.com/strale-io/strale/pull/182) | Eight parallel audit reports + SYNTHESIS.md (the next sessions' worklist) |

## Ops actions (DB, logged in health_monitor_events)

- ✔ **15 solutions contained** (`solution_contained` events): AT/NL/ES/PT × 3 families
  (step-1 always throws; resurrected by seed upsert despite DEC-20260427-I pause) + DK × 3
  (step-1 at 0%). Root cause is a **wallet-path billing defect**: input-starved steps are
  `skipped` without feeding `stepErrors`, `allFailed` never trips, customer pays full
  price for zero checks. x402 path already refuses settlement in the identical case.
  **Fix solution-executor.ts first next session (with a DEC-20260504-A regression test),
  then re-enable DK when danish recovers; AT/NL/ES/PT stay off until step-1 exists.**
- eu-regulation-search avg_latency_ms 10000→35000 (was exactly AT the async threshold).

## First floor tick — verified in prod (DEC-20260504-C)

`health_monitor_events` at 14:27 UTC (18 min post-deploy): `tick_complete` heartbeat
(mode dry_run, 119 evaluated, 4 decisions, 0 quarantined ✓); 3 `dry_run_would_quarantine`
(screenshot-url 55%, brazilian 59%, us-company-data 64% — note us-company-data climbing
50%→64% post-#171, the recovery override will release it as the window rolls);
1 `flagged_only` (url-to-text deferred by the 7d recovery override, live). All safety
semantics observable. #181 merged as `fb57fc8`, #182 as `ff82461`.

## Money-integrity batch — SHIPPED ([#183](https://github.com/strale-io/strale/pull/183), deployed `10aaa63`, verified)

All six items closed: (1) solution billing — `isSuccessfulStepOutput` is the shared
billing boundary; skipped/unavailable steps never bill, soft negative verdicts
({valid:false}) correctly DO count as delivered answers (review-caught refinement);
(2) audit trail lists every advertised step, four-state status; (3) sanctions/pep →
screening_signal (manifest + DB verified); (4) product-search deactivated
(doctrine-compelled, H-4) + Google-ccTLD blocklist family; (5) 14-executor bare-fetch
sweep + call-site-sound CI guard (lint:no-unguarded-user-fetch) + honest StraleBot UA;
(6) weekly-drift cron can actually fail now (pipefail; dead step removed; --strict).
Prod-verified: google.se/search refuses unbilled. Review caveats accepted: StraleBot UA
may undercount on UA-hostile social platforms (pending doctrine ruling); audit
stepOrder + partial-solution pricing policy filed. Next: re-enable DK solutions once
danish-company-data recovers; AT/NL/ES/PT stay off until step-1 exists.

## KYB build-out — SHIPPED ([#184](https://github.com/strale-io/strale/pull/184), merged `f57e606`)

Schema unblocks: danish/finnish name paths opened at the route (`required: []` +
anyOf — the #168/#173 defect class), norwegian/belgian/estonian aligned and
tightened (`{}` now 400s with the field list before billing). DB synced via
`sync-manifest-canonical-to-db.ts` for all five and verified by row query +
live `/v1/do` calls (DEC-20260504-C evidence in the PR body). Finnish resolver
rewritten: 20s timeout (10s truncation of PRH's 200KB search pages was the
prod breaker), **endDate filter** (technical review caught "Rovio" resolving to
Combiholding Oy via a name ended 2020 — now refused), tie refusal,
match_confidence/matched_registry_name surfaced, declared company_name skips
the Haiku extraction. brreg tie refusal added (manifest promised it). Gate 5:
aliases no longer separate entry points ("Alias for X" requires X in schema).
NO/FI known_answer fixtures flipped to the name path (german precedent);
identity-fixture sentinel updated accordingly.

**Austria Firmenbuch HVD: build-ready spec, blocked on Petter** —
`audit-output/parallel-audits-2026-08-12/austria-firmenbuch-integration-spec.md`.
Register at https://justizonline.gv.at/jop/web/iwg/register for the API key
(everything verifiable without it is verified: endpoint, X-Api-Key auth, SOAP
1.2 request shapes; response schema is behind the key wall). Once
`FIRMENBUCH_API_KEY` exists, the build is a ~1–2h session.

Not done (documented in PR): CA/JP/SI name-path opens (CA/JP doctrine-parked,
SI unscored — wrong-company risk), gate-5 dual-fixture model (a multi-path cap
can only fixture-cover one path today; german has the inverse gap),
BE/EE/DK name-path fixtures.

## Approved decision batch — SHIPPED ([#186](https://github.com/strale-io/strale/pull/186))

Petter approved all recommendations; executed: (1) **Quality floor ARMED**
(`QUALITY_FLOOR_ENFORCE=true` on Railway; first enforce tick 20:18Z quarantined
screenshot-url 55% / brazilian 59% / us-company-data 64% — exactly the dry-run
predictions — url-to-text deferred by the 7d recovery override; flags verified
visible=false/x402=false with is_active preserved for auto-promote).
(2) settings.json key: DEAD (not in prod DB, 401 live) and the file is
gitignored — never in git history; 86 stale entries scrubbed locally.
(3) DK CVR email drafted (`2026-08-12-dk-cvr-s2s-email-draft.md` — Petter fills
org number + sends). (4) hs-code-lookup honesty relabel (review caught that
'computed' → capability_type=deterministic would have poisoned the floor via
the failure classifier; shipped as ai_assisted + reference-data + HS-edition
limitation + real fixture). (5) CA/JP: both have OFFICIAL free APIs
(ca-jp-tos-verification.md) — migrations retire the scrapes; JP needs a 5-min
form (Petter), CA needed nothing (done below). Doctrine ruling evidence ready;
GR is the only sharp case left.

## Officer-extraction sweep + CA migration — SHIPPED ([#187](https://github.com/strale-io/strale/pull/187), `585e096`, prod-verified)

Mapper finding: NO/CZ/EE already extracted officers; UK had it twice; **Latvia
was the only real gap**. Shipped: LV board members from the UR officers dataset
(CC0 1.0; null-not-zero on query failure + logged swallow — review-caught);
SK enriched to structured reps (role/start_date were fetched and discarded;
`directors` keeps natural-persons-only semantics); UK type/role_code + total +
length-gated tier_2 (was hardcoded true, same fix SK); CA numeric lookups on
the official Corporations Canada JSON API (manifest honesty: api + mixed,
name-path limitation; fixture off a personal residence onto corp 1007).
Prod-verified: TESCO 11 typed officers; airBaltic 2 board members; Abbotsford
via API. Follow-ups queued: shared LegalRepresentative type + role_group enum
(NO/CZ still emit native tokens), coverage-matrix tier-2 legend + LV/SK counts,
UK tier fixture recapture in a keyed env, SK corporate-konateľ shape probe,
ES via OpenMercantil, remaining ~50 anyOf blocks.

## ES OpenMercantil + Bazaar + strategy docs — SHIPPED (late session, into 08-13)

**spanish-company-data reactivated ([#189](https://github.com/strale-io/strale/pull/189), prod-verified):**
OpenMercantil (BORME-derived, free 200/day, CC0-adjacent statutory open data,
officers included). Root cause of the ES outage: the Openapi path was gated on
a never-countersigned resale addendum. Review-caught fabrication fixed pre-merge
(date_incorporated fell back to the 2009 coverage floor). Prod: Amenabar by NIF
(22 officers, 5 registral-referenced acts, €0.05) + Mercadona by name. The 3 ES
solutions re-enabled (solution_promoted events, reversal noted); kyb-essentials-es
end-to-end: 3/4 steps green, lei-lookup honestly no-LEI, all-skip runs bill €0.
Known gap: IBEX listed PARENTS absent (documented warning limitation).
BONUS FIX shipped in the same PR: windowStart Date-bind in guarded-executor
broke every free_quota cap's internal-test budget path (PR-43 class,
DEC-20260504-A test added).

**Bazaar facilitator switch ([#190](https://github.com/strale-io/strale/pull/190), merged):**
Discovery surfaces now advertise the REAL facilitator. Key discovery at boot:
prod was ALREADY settling through CDP (mode=auto resolved cdp — keys present) —
so the catalog/well-known surfaces had been advertising x402.org falsely, now
fixed (both verified showing api.cdp.coinbase.com, 332 endpoints). Remaining:
verify Bazaar indexing actually appears (first suspect if not: the
buildBazaarDiscovery v2-extension hedge); optional ranking metadata.
Petter: optionally pin X402_FACILITATOR=cdp explicitly.

**Strategy docs (audit-output/parallel-audits-2026-08-12/):**
- `catalog-buildout-strategy.md` — revenue is €249/90d, 53% one SEO/SERP-buying
  wallet; €42 died on broken EXISTING caps; screenshot-url (just quarantined) is
  400-ing the top customer (Browserless v1 waitForSelector — FIX FIRST next
  session); 14-idea build list on free sources; 7 declines recorded; floor
  false-positive concern (verify against the shipped taxonomy — caller_input IS
  excluded); **TOAST corruption in transactions.audit_trail (URGENT — EU AI Act
  artifact + hash chain; "missing chunk number 0 for toast value 32384")**.
- `traffic-generation-plan.md` — strale.dev robots.txt blocks AI crawlers at
  the Cloudflare CDN layer (Petter: turn off Managed Content block);
  pydantic-ai-strale/openai-agents-strale/google-adk-strale were NEVER yanked
  on PyPI despite DEPRECATED.md claiming so (DEC-20260504-C class, the April
  incident axis — yank for real); all drafted submission copy has stale counts;
  attribution instrumentation must precede submissions.

## 2026-08-13 morning — screenshot-url resolved + attribution live

**screenshot-url:** the catalog agent's "top customer being 400'd" was a stale
30-day window — the Aug-5 dialect fix (#150) already worked (zero wait-key
400s since; ~24-28 customer ok/day). The REAL problem was the quarantine
itself: it cut x402 access, removing the eligible calls auto-promote needs
(catch-22 for x402-only consumers — floor design note). Manually promoted
with evidence (capability_promoted event); prod-verified with the exact
failing shape (wait_for on strale.dev → 654KB, €0.05). Top customer restored.

**Attribution ([#194](https://github.com/strale-io/strale/pull/194), `8a281a7`, prod-verified end-to-end):**
migration 0081 (client_meta + discovery_hits, 90d retention), capture at
/v1/do + x402 (3 paths) + solution rail + all discovery surfaces + MCP
initialize clientInfo; SDK X-Strale-Client headers (straleio-js /
straleio-python / strale-mcp — PUBLISHES PENDING, Petter); rollup script.
Review caught a genuine HIGH pre-merge: a scripted edit put clientMeta incl.
ip_day_hash into the async 202 RESPONSE BODY — a same-day hash oracle.
Key invariant: joins use client_meta.ip_day_hash (daily-salted) — NEVER
transactions.client_ip_hash (unsalted MED-10 keyspace). Discovery endpoints
now rate-limited 120/min. Prod-verified: tagged catalog fetch → discovery_hits
row; X-Strale-Client → client_meta; rollup executes (first organic wallet
visible, unattributed as expected).

**Tagged submission URLs are now usable** (`/x402/catalog?src=<surface>`) —
directory submissions remain Petter-gated with the corrected copy (see
traffic-generation-plan.md: live numbers, not the stale 456/24 claims).

## Read next session, in order

1. `audit-output/parallel-audits-2026-08-12/SYNTHESIS.md` — the merged prioritized
   worklist (P0: billing fix, audit-trail step-gap, GDPR Art.22 on sanctions/pep,
   product-search Google scraping + ccTLD blocklist gap, bare-fetch sweep + CI guard,
   drift-cron repair, email-pattern-discover).
2. `kyb-wiring-audit.md` + `kyb-coverage-research.md` — Petter's KYB directive, answered:
   free sources support Identity+Bindability KYB in ~12-15 countries; UBO is legally
   gated (Tier-1/2 product, not bank EDD); AT Firmenbuch HVD is free/official and
   misclassified; officer-extraction sweep on NO/CZ/EE/SK/UK/LV is cheap (data fetched,
   not parsed); DK CVR S2S application has a 3-week clock (Petter email).
3. `distribution-playbook.md` — Bazaar facilitator switch (self-indexes 456 endpoints;
   money-path change, needs Petter), drafted submissions for verified gaps.

## Petter decisions accumulated this session

1. Arm the quality floor after reviewing dry-run events (`QUALITY_FLOOR_ENFORCE=true`).
2. Bazaar facilitator switch (distribution's biggest lever; settlement-path change).
3. Doctrine ruling: DEC-20260428-A absolutist vs DEC-20260518-F per-call registry parsing
   (decides GR/MT/HU/BE + whether canadian/japanese-company-data can stay live).
4. hs-code-lookup: product call (claims WCO database, is LLM recall).
5. `.claude/settings.json` holds a live-format API key in a permission rule — move it.
6. DK CVR S2S application email (3-week clock).
7. (Parked from P1: CourtListener token, product-reviews-extract deactivation, datacvr.)

## Working-tree state at handoff

Tree on `docs/parallel-audits-2026-08-12`. Other sessions' untracked files untouched
(.agents/, .codex/, AGENTS.md, seed-seo-solutions.ts, page-exists WIP). Test wallet
~€45. Two review-agent caveats on record: one reviewer checked out branches in the
shared tree against instructions (disclosed, state restored); cross-provider independent
review remains unavailable in-harness — all review passes were same-provider adversarial
(disclosed in every PR body).

---

## Addendum (2026-08-13): Revenue track — Rank-0 triage + demand-driven builds (task #29, PR #196)

### Rank-0 "failures" were stale-window ghosts — no fixes needed

- **pdf-extract**: the June 0/5 window was callers 404-ing on made-up URLs, not a
  capability defect. Current behaviour verified correct.
- **screenshot-url**: the Browserless-v1 dialect bug was already fixed Aug 5; the
  residual harm was the quarantine itself (x402-only cap can't earn the eligible
  calls auto-promote needs — the floor catch-22, documented earlier). Cleared.

### Three demand-grounded capabilities shipped dark (PR #196, main `2a88407`)

Grounded in `failed_requests` + top-customer purchase patterns
(catalog-buildout-strategy.md):

1. **google-news-search** (10¢) — Serper `/news`; time-range map validated pre-call;
   `num_results` must be integer ≥1 *before* the Serper call (review M-1: NaN
   previously would have sliced to empty and still billed).
2. **serp-related-questions** (10¢) — Serper `/search` → peopleAlsoAsk +
   relatedSearches; empty arrays documented as real answers; priced/described as a
   delta vs google-search.
3. **email-auth-check** (3¢) — pure-DNS SPF/DMARC/MX/DKIM posture. Full rewrite after
   review: pct< 100 → `partially_enforced`; RFC-tolerant tag parsing; RFC 7489
   §6.6.3 org-domain fallback (mail.google.com → effective reject, inherited_from
   google.com); empty `p=` DKIM counted as revoked per RFC 6376; multi-record SPF/
   DMARC → invalid_multiple. F-0-006 Bucket C acknowledgment added (pure DNS, same
   class as dns-lookup) — that comment was the only CI failure on the PR.

All three: review-hardened (all H/M/L findings fixed, incl. H-1 fabricated DKIM
example in the manifest), validate-capability clean, live-verified. Dark per
DEC-20260812-A factory rule: `visible=false`, non-x402 until first green week.

### Side-finding

strale.dev has no SPF record — website-only domain, harmless. strale.io (the mail
domain) verified fully enforced.

### Next up

- Promote the three caps after first green week (manual: visible=true + x402_enabled).
- Petter-pending: PyPI yanks (3 framework stubs), SDK publishes with attribution
  headers, distribution submission batch approval.
- Clocks: JP app ID ~Aug 20; DK CVR nudge Aug 27 if quiet; AT/BMJ reply unknown.
- Queued: Greece build (doctrine-cleared; record ToS check per DEC-20260813-A(b)),
  floor x402 catch-22 design patch, remaining catalog ideas.

---

## Addendum (2026-08-13 PM): x402 v2 migration shipped (task #31, PR #200)

Petter signed off #31; shipped same day. **Design changed mid-flight after an
empirical check**: the planned "hybrid body" (one 402 serving both protocol
generations) is provably impossible — x402-fetch v1 zod-parses every accepts[]
entry against a strict bare-name network ENUM ("base"), v2 validators require
CAIP-2 ("eip155:8453") on the same field. Verified against the published
x402-fetch@0.8.0 / x402@0.8.0 tarballs, not guessed.

**Shipped design (zero revenue bet):**
- Legacy paths (`/x402/:slug`, `/v1/do`) serve byte-identical v1 — the
  ~400-600 settlements/week of unknown-version payers see no change.
- New `/x402/v2/:slug` + `/x402/v2/solutions/:slug` aliases always serve v2;
  all discovery surfaces (well-known ×2, openapi, catalog paths) now advertise
  the v2 paths.
- Verify/settle accepts BOTH payload generations everywhere (version-branched
  requirements; CAIP-2 echo normalization).
- `X402_CHALLENGE_VERSION=2` = legacy-path cutover switch, gated on the new
  `x402-payment-payload-version` log counter reaching zero v1 volume.
- New `x402-settlement-watch` job (6h): pages with rollback instructions if
  24h settlements < 50% of trailing-7d baseline (a v1 die-off is otherwise
  invisible — client fails before any X-PAYMENT retry).
- Verify-failure 402s now return spec-shaped PaymentRequired bodies.

**Prod-verified post-deploy:** `/x402/v2/vat-validate|sanctions-check|
solutions/kyb-essentials-se` all 402 + validate against the real
`@x402/core` PaymentRequiredV2 zod schema; legacy path still v1; discovery
fan-out lists 334 v2 URLs.

**Open:** (1) real v2-payload settle against CDP untested — no funded payer
key in .env; needs Petter's wallet or a funded test key (M-2). (2) x402scan
re-submission in progress at close. (3) Deferred LOWs in PR #200 body.
