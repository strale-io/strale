Intent: close out the DEC-20260513-B/C/D bug-fix arc + v1 Identity audit residuals, ship the Phase 3 Harden gate (a) sentinel test, and correct canonical-surface drift on VIES UK-GB coverage. Session ran across strale-research (read-only audit work + Notion updates) and strale-work (3 PRs shipped + merged).

## What shipped

### PR #115 — chore: promote 5 handoff notes (2026-05-11 + 2026-05-13 batch)
Cleared the dirty-tree gate that the audit-residual prompt halted on. Two pre-existing untracked files in the `strale` worktree (`2026-05-11-failure-investigation-de-dk-sk-rootcause.md`, `2026-05-13-hr-ch-price-normalize-dec-20260513-e.md`) + three from `strale-work` (`2026-05-13-a0c-1-v3-list-endpoint-cost-class.md`, `2026-05-13-dec-20260513-bc-cycle-closure-plus-followups.md`, `2026-05-13-restore-hsts-header-cloudflare-pages.md`) promoted to tracked.

### PR #116 — fix(gr-identity): swap manifest fixture from branch entity to parent SA + close v1 audit residuals (merge `4553b75`)
Closed three residuals from the 2026-05-13 v1 Identity coverage audit:
- **GR fixture swap**: `manifests/greek-company-data.yaml` `known_answer.input.gemi_number` changed from `000237954001` (Lamia branch of NBG, `is_branch=true`, empty directors/NACE) to `296601000` (HELLENiQ ENERGY Holdings SA, parent, `is_branch=false`, 11 directors, NACE 19200000). Expected_fields rewritten to match HELLENiQ's response shape; added `industry_code not_null` assertion that the prior branch fixture couldn't sustain.
- **DK + DE quota residuals**: verified operationally healthy via direct query of `test_results` over the trailing 24h. Both 6/6 green = 100% (most recent 20:27 UTC / 20:17 UTC). Met the prompt's ≥95% threshold cleanly. Audit-time `quota_exceeded` errors were correct DEC-20260512-A cost-class gate behaviour, not failures.
- **Audit doc**: copied + extended `apps/api/docs/v1-identity-coverage-matrix-2026-05-13.md` with §10 closeout evidence chain. Table B GR row flipped directors ❌→✅ and NACE ❌→✅. Headline 17 → 20 of 20 v1-ready.

### DEC-20260513-F logged + canonical-surface propagation
Logged in Decisions DB at `35f67c87-082c-81c0-9fbf-c2253cf4e24c`. Title: "v1 Identity coverage verdict — 20 of 20 audited capabilities v1-ready." Scope global, confidence high, supersedes nothing (verdict-documentation DEC). Source PR #116.

Propagated to:
- **Active Vendor Stack page** (`35367c87082c812e88d1dc6bdbfbd4f5`): new chronological update line citing DEC-20260513-F + PR #116, counts unchanged at 20+4+1+5+1.
- **Capability × Country Coverage Matrix page** (`35767c87082c8184ba34e116f673a1d6`): short reference line added.

### PR #117 — feat(test): canonical-input sentinel test for identity capabilities (DEC-20260513-D Phase 3 Harden gate (a))
Three commits stacked on `feat/identity-fixture-shape-sentinel`:
1. `e5b5ac9` — observation mode (script + allowlist + CI invocation without `--strict`)
2. `a129d48` — `fix(french-company-data): add company_name not_null assertion` (Step 4 surfaced FR's missing name-field assertion; one-line manifest fix, no fixture entity change)
3. `2a669f4` — enforcement mode (`--strict` added)

Static manifest-introspection node script at `apps/api/scripts/check-identity-fixture-shape.mjs`. Pattern mirrors sibling gate (b) `check-manifest-guaranteed-consistency.mjs` (already shipped PR #111). Allowlist file at `apps/api/scripts/identity-fixture-shape-allowlist.txt` (empty at v1 ship). CI invocation at `.github/workflows/ci.yml:76` runs `--strict`; exit 0 on clean tree, exit 1 on new violations.

v1 criteria (kept tight per prompt scope):
1. `is_branch` equals-assertion must NOT be `true` (catches GR original-fixture bug shape).
2. `status` equals-assertion must be in per-country active set (SI exempt via `PER_SLUG_EXEMPTIONS` with DEC-20260513-F reference).
3. `expected_fields` must include at least one assertion on a recognised name field.
4. `known_answer.input` must contain at least one identifier matching country's canonical regex.

All three runtime + static gates from the DEC-20260513-B/C/D arc are now live:
- Runtime: `guaranteed-fields-sentinel.ts` (PR #109)
- Static gate (a): this PR #117
- Static gate (b): `check-manifest-guaranteed-consistency.mjs` (PR #111, earlier)

### Phase 2 (Understand) journal entry — halted, already existed
Pre-check found existing chat-authored entry: "Course correction: trust-in-pipeline blind spot (CH bad-fixture cascade + SK burst-misdiagnosis + DK silent auto-recovery)" at `35f67c87-082c-81ce-ab3c-dfa08b6391a2`. Authored 2026-05-13 18:57 UTC by claude-chat. Substantively more thorough than the prompt's proposed body — covers all three causal chains in 6/4/3 steps respectively, names "trust-in-pipeline blind spot" as 1st-occurrence pattern, includes three additional named patterns + a chat-side analog addendum. Stop condition fired correctly; no duplicate written.

Pre-existing entry's only gap: cites the in-flight PRs (#117, #111) as "running in CC at time of writing" — the merge SHAs and PR #116 (which post-dated this entry) aren't cited. Cosmetic; doesn't affect substance. Petter can append a one-line supplementary entry if desired, or leave as-is.

### HMRC sandbox retest — support ref 2026-CNS433
Report at `apps/api/docs/hmrc-sandbox-test-report-2026-05-13.md` (in `strale-research` worktree). All 4 tests PASS: OAuth token (200), unverified lookup `553557881` Credite Sberger Donal Inc. (200), verified lookup with requester `436189915` returning `consultationNumber: "YQD-VNF-WWX"` (200), authenticated 404 regression on prior-test VRN `553557817` returning documented `NOT_FOUND` body (404). VRN selection sourced from HMRC's canonical mock-data CSV at `github.com/hmrc/vat-registered-companies-api/blob/main/public/api/conf/2.0/test-data/vrn.csv`. Diagnosis: the prior 5 May report's 404 was correct behaviour for a non-provisioned identifier, not a configuration issue. Production credentials remain in flight via HMRC support ticket.

### VIES UK-GB coverage verification + canonical-surface corrections
Findings doc at `apps/api/docs/vies-uk-gb-coverage-verification-2026-05-13.md` (in `strale-research`). **Verdict: REFUTED with no code impact.**

Empirical:
- VIES REST rejects GB at country-code level: `{"actionSucceed":false,"errorWrappers":[{"error":"INVALID_INPUT"}]}`. Rejection is structural, independent of VAT number.
- XI is in VIES (XI calls accepted normally).
- DE/FR controls work (FR call shape passed; DE had transient `MS_UNAVAILABLE`).
- HMRC production API confirmed reachable, requires auth (401 without credentials).

Code-side: **Strale's `vat-validate.ts` already handles this correctly.** Header docstring (lines 9-14) explicitly documents `EU27+XI → VIES`, `GB → HMRC v2`. `vies.ts:16-21` `EU27_PREFIXES` lists 26 EU codes + `"XI"` (with explicit post-Brexit-protocol comment); GB is not in the list. `hmrc.ts:prefixes: ["GB"]`. Whoever wrote the capability understood post-Brexit reality from day one.

Drift was canonical-surface only:
- **Active Vendor Stack page**: "v1 stack — global legs" table VAT row corrected. Was: `VAT (EU27) | VIES | … | EU27 + UK (DE/ES suppress name/address)`. Now: two rows — `VAT (EU27 + XI) | VIES | …` and `VAT (GB) | HMRC Check a UK VAT Number API v2.0 | …`. Plus chronological update line citing the findings doc.
- **Capability × Country Coverage Matrix**: "Vendor → coverage summary" table VIES row corrected from "All EU + UK" → "EU27 + XI (Northern Ireland)"; HMRC row added. Plus chronological update line.

### Closing prompt: Active Vendor Stack page VAT row split (2026-05-14 morning)
First update attempt used pipe-table markdown syntax (`| col | col |`) which didn't match Notion's stored format — table cells are stored in `<td>` form per the enhanced markdown spec. Retry with `<td>` syntax succeeded on both pages. Both pages now show split correctly post-verify-fetch.

## Cost

- ~€1.00 wallet spend on test account (v1 Identity audit's 19+1 prod `/v1/do` calls × €0.05).
- ~€0 on VIES (unauthenticated public API).
- ~€0 on HMRC sandbox (free).
- ~€0 on Notion writes.

## Non-obvious learnings

- **Notion `update_content` table-row edits require `<tr>/<td>` syntax**, not pipe-table form. Chronological flat-prose edits work with flat text. Same call, different anchor strategies. Worth a line in any future Notion-update-pattern doc.
- **Notion `update_content` operations within a single call are independent on match failure** — the chronological-line edit succeeded while the table-row edit silently failed (no match found). The retry pattern: fetch back → verify which ops landed → retry the failed ones with corrected syntax. No data-loss risk; only extra round-trip.
- **The cost-class gate (DEC-20260512-A) is doing exactly what it should at audit time.** DK and DE returning structured `quota_exceeded` errors instead of consuming wallet was correct, designed behaviour. The audit's verdict "DK and DE quota-exhausted at audit time" was accurate; the closeout via canary signal showed the broader operational picture via the substrate that already records it.
- **`strale-research` lacks `node_modules`.** Scripts that import `dotenv` / `postgres` / etc. can't run from there. Workaround: copy the script to `strale-work/apps/api/scripts/_tmp-*.ts` and run from there with the trunk `.env` as inline DATABASE_URL source. Used twice this session (canary query for DK/DE, HMRC sandbox retest).
- **The valvat claim about VIES post-Brexit was correct.** VIES rejects GB at country-code level (`INVALID_INPUT`), structurally, not number-by-number. Strale's `vat-validate.ts` author knew this. The drift was purely in human-readable canonical-surface text that summarised the stack with a stale "EU27 + UK" framing.

## Open / queued follow-ups (no PRs in this session)

1. **Cosmetic NO + UK manifest example-fixture drifts** (audit Findings §5): NO's `output_schema.example` shows Equinor but fixture is DNB; UK's example shows fake-name co but fixture is Tesco. Neither blocks v1. Queued.
2. **HMRC production credentials**: support ref 2026-CNS433 reply pending. Sandbox integration verified; production blocker is HMRC-side, not Strale-side.
3. **Manual-pin lifecycle vs auto-pin lifecycle conflation** (DK-pattern from Phase 2 journal): the circuit-breaker half-open probe doesn't distinguish auto-pin from manual-pin lifecycles. No Phase 3 commitment yet; structural options in the Phase 2 entry.
4. **OpenAPI / MCP description copy for `vat-validate`**: would benefit from clearer per-country provenance copy (EU27+XI vs GB). Separate content prompt.
5. **strale.dev coverage page**: may have similar "VIES covers EU27 + UK" stale claim. Sweep recommended via a future content prompt that goes through Brand & voice.
6. **v1.1 sentinel extensions** for gate (a): directors-must-be-asserted check, live-call mode, non-Identity capability coverage. Watch for value vs false-positive ratio.

## Uncommitted artifacts in `strale-research`

Four audit/research doc files in `apps/api/docs/`:
- `hmrc-sandbox-test-report-2026-05-13.md` (HMRC support ref 2026-CNS433 evidence)
- `v1-identity-coverage-matrix-2026-05-13.md` (audit doc; also lives committed in `strale-work` main at `4553b75` via PR #116, so this strale-research copy is now redundant)
- `v1-launch-audit-2026-05-13.md` (pre-existing from earlier session)
- `vies-uk-gb-coverage-verification-2026-05-13.md` (this session's verification findings)

Recommendation: the matrix file is fully captured by PR #116's committed copy and the Notion mirror — can be deleted from strale-research. The HMRC + VIES docs are genuinely strale-research-only artifacts; Petter can either promote them via a chore PR (matching the PR #115 pattern) or leave them as worktree-local research notes.

## State at close

- strale-research: detached HEAD `5c22c77`, working tree has the four audit-doc untracked files. Behind `origin/main` by 4 commits but that's expected for strale-research's role.
- strale-work: on `main` at `dd9a082` (PR #117 merge), tree clean.
- strale: HEAD at `f6188708` (older, pre-PR-#115). Two untracked handoff files there have already been promoted via PR #115 — next `git pull --ff-only` in strale will make those tracked. No action required.
