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
