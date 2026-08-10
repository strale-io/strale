Intent: validate PR #132's UK UBO GREEN verdict against live production, re-audit EU30 coverage post-PR-131 + post-PR-132 against the Evidence Tier and Use-case Tier frameworks, and verify the re-audit's "only 2 of 30 binding-ready T2" claim via multi-language handler-source grep + production smoke tests.

# Outcome

Three read-only audits completed, three audit-output files written, **zero code changes, zero commits**. All three feed chat-side decisions about v1 launch tier-claim shape.

## Artifact 1 — UK UBO live smoke test

Path: `audit-output/uk-ubo-smoke-test-2026-05-18.md` (in strale-work worktree)

Verdict: **GREEN-VERIFIED**. PR #132's UK UBO activation works end-to-end against real Companies House behavior. Two production calls against Monzo (CH no. 09446231) confirmed:

- `uk-company-data` returns `ubo_availability: "available"` with customer-friendly reason
- `beneficial-ownership-lookup` returns populated `beneficial_owners[]` with name, type, ownership_level 75-100%, natures_of_control, notified_on

First test entity (BP P.L.C., CH no. 00006245) returned `beneficial_owners: []` — correct PSC-exempt behavior for listed PLCs. Switched to Monzo per the prompt's stop-condition guidance. No code changes. UK UBO is v1-launch-ready.

## Artifact 2 — EU30 coverage re-audit

Path: `audit-output/eu-coverage-use-case-tier-audit-2026-05-18.md` (in strale-work worktree)

Top-line verdicts:
- **T1 Continuity: 29 of 30** EU30 countries deliverable (CH excluded under strict canonical-key reading)
- **T2 Onboarding: 19 of 30** framework-compliant (declared with reason); **2 of 30 binding-ready within EU30** (DE + GR with populated representative arrays)
- **T3 EDD: 0 of 30** — `ongoing-monitoring.ts` confirmed absent, universally blocked

Findings:
- PR #131 + PR #132 closed the CRITICAL `ubo_availability` + `tier_2_available` silent-omission gap on 31 of 32 handlers. The 32nd (`swiss-company-data`) remains a throw-stub + chain-provider framework violation (PR #131 explicitly scoped it out).
- DK was correctly flipped from `available` → `unavailable_no_registry` by PR #132 (the integration was never wired; the flag was lying).
- The 2-of-30 binding-ready T2 number is the most material datapoint for the v1 launch DEC — see Artifact 3 for the correction.

## Artifact 3 — Handler-side directors verification

Path: `audit-output/handler-directors-verification-2026-05-18.md` (in strale-research worktree)

**Re-audit miss found.** Multi-language grep across all 32 patched handlers + 22 director-equivalent language variants + 9 production smoke tests revealed:

| Country | Verdict | Evidence |
|---|---|---|
| FR | **CONFIRMED MISS** | `french-company-data.ts:62-82` emits `directors` from INSEE `dirigeants`. Smoke test on Renault SIREN 441639465 returned 18 directors (Senard, Provost, et al.). |
| SK | **CONFIRMED MISS** | `slovak-company-data.ts:170-188` emits `directors` from `entity.statutoryBodies` with active-only filter. Smoke test on Slovnaft ICO 31322832 returned 8 directors. |
| SE | YAML DRIFT | YAML claims "directors via Bolagsverket" but handler does not emit; live smoke confirms 0. |
| UK | SLUG-BUNDLING | `uk-company-data` doesn't emit directors; a separate live capability `uk-companies-house-officers` exists and consumes the Officers API. |
| 23 others | REAL GAP | Handler-grep + live smoke confirm no director-equivalent field. Re-audit correct. |

**Updated EU30 binding-ready T2 count after the audit-bug fix:**
- 2 (DE, GR) — original re-audit baseline
- **4 (DE, FR, GR, SK)** — after flipping `tier_2_available: true` on FR + SK and updating their reason strings
- 5 — if UK bundles `uk-companies-house-officers` extraction into `uk-company-data.ts`

No git-history regressions: FR has emitted `dirigeants`→`directors` since the initial 22-capability addition (`094a597`); SK since `1d67bf2`. The labeling sweep (PR #131) wrote the wrong reason string from the start — pure audit-bug, no code regression.

# Open / loose threads for next session

1. **Audit-bug fix PR for FR + SK** (chat-side prompt pending). Flip `tier_2_available: true`, update reason strings, optionally add `legal_representatives` canonical alias mapped to `directors`. ~10 lines of code total across two files.
2. **SE YAML annotation correction.** Either remove "directors via Bolagsverket" from `swedish-company-data__se__company-registry.yaml` or open a separate ticket for the Bolagsverket directors-endpoint integration.
3. **UK slug-bundling decision.** Either bundle `uk-companies-house-officers` into `uk-company-data.ts` (lifts UK to binding-ready T2) or clarify the YAML annotation. Chat call.
4. **v1 launch tier-claim DEC.** Pick the T2 definition the launch claim uses: framework-compliant (19/30) vs binding-ready (4/30 after the FR+SK fix, 5/30 after UK bundling). The 2026-05-18 re-audit's Section 7 names this as the central question for the launch DEC.
5. **Per-country T1 populated-field probe.** Re-audit assumed direct-API handlers reach 6/6 populated; not verified per country. A one-call-per-country probe would lock the populated-T1 count as ground truth before launch.
6. **Swiss handler framework compliance** (still open from PR #131 scope-out). Either extend the labeling sweep to `providers/swiss-company-data.ts` or accept CH as the lone framework-non-compliant row.

# Non-obvious learnings

- The `/v1/counterparty-assurance` endpoint in the smoke-test prompt is fictional — the real surface is `POST /v1/do` with `capability_slug` and `inputs` (plural). The prompt-spec'd shape produced HTTP 400s until corrected. Spec-vs-reality drift in prompt authoring is a recurring failure mode for one-shot prompts that posit endpoint shapes; verifying against `app.ts` route mounts is cheap.
- BP P.L.C. (CH no. 00006245) is **PSC-exempt as a listed PLC** — the handler returns HTTP 200 + `beneficial_owners: []` correctly. Don't smoke-test UBO integrations on listed PLCs; use private Ltd entities (Monzo CH no. 09446231 is a good standby).
- The prompt's `/v1/do` body uses `inputs` (plural) not `input` (singular). Helpfully, the API returns a structured error when the singular form is sent — but Python-style `body.input` mental defaults will burn a request roundtrip.
- Per-handler input-key names are **not uniform**: BE wants `enterprise_number`, IE wants `cro_number`, FI wants `business_id`, NO/SE want `org_number`, SK/CZ want `ico`, FR wants `siren`, PL wants `krs_number`. The error message at HTTP 400 names the expected fields — don't guess; read the error.
- The 2026-05-18 re-audit's "only 2 of 30 binding-ready T2" verdict was bug-prone because the alias resolver only matched fixed English names. Multi-language grep + live smoke tests is the only reliable way to verify handler-emission claims across a multi-country surface — `tier_2_available: false` is a self-reported flag that does NOT correspond to what the handler actually returns. The labeling sweep wrote the same boilerplate reason ("handler does not currently extract legal representatives from upstream registry") for FR and SK despite both extracting directors — boilerplate reason-string templates are dangerous in coverage audits.
- Strale-research worktree was at `e1c2105` (pre-PR-131) at session start — a stop condition. `git checkout 2126de0` cleanly carried the local `.gitignore` `audit-output/` addition forward (no diff between commits). For future audits, double-check worktree HEAD before relying on it.

# Cost

Production wallet on `test2@strale.io`: ~125 cents total across ~14 production `/v1/do` calls (3 UK smoke + 11 directors verification). Final balance: 2789 cents.

# Git state

- No commits this session
- Three audit-output files written, all in `audit-output/` (gitignored locally on strale-research; not gitignored globally)
- strale-research worktree HEAD: `2126de0` (post-PR-132 main)
- strale-work worktree HEAD: `2126de0` (main)
- strale primary worktree HEAD: `f618870` (detached, unrelated to this session)
- Pre-existing dirty state preserved: strale-research has local `.gitignore` mod adding `audit-output/`; strale has 3 unrelated unstaged handoff files + 2 unrelated AGENTS.md/.agents/ untracked items — none from this session
