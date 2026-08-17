Intent: act on the morning /activity findings — build the missing page-existence capability, fix activity-report mislabeling, verify the Swiss/Estonian company_name fix in prod — then fix the onboard --strict chicken-and-egg the capability build exposed.

## What shipped (3 PRs, all awaiting merge)

- **PR #175 — `page-exists` capability.** Content-aware existence check (soft-404 detection, no LLM, €0.02, monitoring). Motivated by an x402 agent burning 6 uptime-check calls on OpenTable/Resy venue URLs. Built by a sonnet subagent, then hardened through a six-lens review that found 7 HIGH defects pre-PR (address-shaped "404" titles, URL-normalization false redirects, raw-HTML phrase scanning, timeout_ms=0 disabling the fetch bound for unauthenticated x402 callers, clean-200 overclaiming confidence:high on SPA shells — empirically reproduced on Resy). All fixed pre-PR. DB row exists via the onboarding pipeline (validate 19/19, smoke 11/11, readiness clean) but is HELD at `lifecycle=probation, visible=false, x402_enabled=false` because prod's deployed code can't execute it yet.
  **→ Post-merge activation is a named 2-step in the PR body (DEC-20260504-C): verify executor live in prod, then `UPDATE capabilities SET visible=true, lifecycle_state='active', x402_enabled=true WHERE slug='page-exists'`. Without step 2 the motivating agent can't reach it.**
- **PR #176 — activity-script hygiene.** Solution transactions (capability_id NULL by design) now labeled `solution:<slug>` instead of "unknown"/"null"; failed_requests broken down by real failure_type with glosses instead of the hardcoded (wrong) "no_matching_capability" label; window-failed-requests surfaces failure_type + error_detail. Sibling manifests (uptime-check, url-health-check) got cross-pointer limitations; synced to DB via targeted SQL (backfill doesn't sync limitations — see learnings).
- **PR #177 — onboard --strict cost-class seed.** New capabilities could never pass --strict (or use --discover): fixture verification runs through the A0b gate BEFORE the DB row exists → refused as unclassified. Fix: seed the gate's cache from the manifest, INSERT-MODE ONLY — the review caught that my first version seeded on backfill too, which would have laundered drifted manifests (estonian's free_unlimited YAML over DB paid_prepaid) past the ALLOW_MATRIX into live paid spend. Also fixed: --discover --strict silently onboarding with zero verified fixtures on discovery failure. 5 regression tests, verified red(4)/green(32) both directions per DEC-20260504-A.

## Verified, no build needed

- Swiss/Estonian `company_name` fix (PR #173) confirmed live in prod: Swisscom → CHE102753938, Tallink Grupp → 10238429. The 2 "no_matching_capability" rows in the morning report were actually `missing_fields: uid` failures from this machine's own IP 4 minutes before #173 landed — pre-fix testing, not a customer gap. (The mislabeling that caused the misread is what PR #176 fixes.)
- The "unknown"/"null" transaction was ONE legitimate x402 solution call (lead-email-verify, €0.20, completed) — reporting defect, not data corruption.

## Open / follow-ups

1. **PR #175 activation steps after merge+deploy** (see above — this is the one that must not be forgotten).
2. Spawned-task follow-ups noted in PR #177: lint pin for `seedCostMetaForOnboarding`, CI wiring for the two cost-gate guard scripts (neither runs anywhere), cost_class enum validation in validateManifest (would flip 11 legacy `paid_per_call` manifests to failing — policy call), CLAUDE.md manifest template omits cost_class/maintenance_class.
3. Pre-existing, flagged not touched: estonian-company-data coherence violation (declared free_unlimited, reads ANTHROPIC_API_KEY) — the concurrent session appeared to be fixing it; uptime-check still uses raw fetch(redirect:"follow") (redirect-SSRF gap page-exists avoids); page-exists could use a known_bad test suite on a stable 404 URL.
4. Close-check RED: 6 circuit breakers opened 09:25–09:42 UTC (approval-security-check, image-to-text, eu-regulation-search, danish/us-company-data, us-court-search). None touched by this session — timing matches the concurrent readiness/p0-baseline session's prod catalog sweep. Needs an owner.

## Non-obvious learnings

- `onboard.ts --backfill` does NOT sync output_field_reliability / description / limitations to DB despite its banner claiming so. For pre-launch caps: delete rows + fresh onboard. For launched caps: targeted SQL. (Saved to memory.)
- A concurrent session shares this working copy and switched branches mid-session (feat/pii-retention-tier → readiness/p0-baseline). PR #177 was committed via a temporary git index against origin/main — no checkout — to avoid disturbing it. Worth avoiding two active sessions in one checkout.
- Six-lens review earned its cost twice: caught a live-spend security hole (backfill seed override) and an empirically-verified wrong-answer product defect (Resy SPA confidence:high).

## Cost

~€0.10 test-account spend (2 prod verification calls); a handful of free onboarding/smoke executions of page-exists against example.com/wikipedia.
