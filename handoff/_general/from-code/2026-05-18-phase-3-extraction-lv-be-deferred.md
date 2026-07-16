Intent: Ship Phase 3 of the free legal_representatives extraction sweep for BE and LV per the chat-side prompt. Discovery-first per country; halt if no free path exists.

## Outcome

**LV shipped → PR #134** — https://github.com/strale-io/strale/pull/134 (OPEN, base `feat/phase-1-class-a-relabel-fr-sk-uk`, stacked on PR #133).

- Added second CKAN `datastore_search` call to data.gov.lv `amatpersonas` open dataset (resource id `e665114a-73c2-4375-9470-55874b4cfa6b`)
- Surfaces canonical `legal_representatives[]` on `latvian-company-data` output; flips `tier_2_available: true` when officers returned
- Role normalization: stable English enum (`board_chair`, `board_member`, `council_member`, `council_chair`, `procurist`, `liquidator`); unknown LV codes pass through
- Each entry carries: `name`, `role`, `start_date`, `rights_of_representation`, `representation_with_at_least`, `entity_type`
- Honest coverage caveat: dataset is current-active-officers snapshot only — no resignations/history. Disclosed in `tier_2_available_reason`
- Smoke-verified live: airBaltic (2 officers, board_chair + board_member), Latvenergo (5 officers), 40003020121 fallback (2 officers)
- Coverage matrix bumped: tier_2_coverage 3/5 → 4/5, last_verified 2026-05-18
- Cost: €0 — free CKAN datastore, no auth, no infra. License CC0 1.0 preserved in provenance.

**BE deferred → not implemented.** Source research confirmed no free path:
- `cbeapi.be`: no officer endpoint (existing handler comment validated)
- KBO Open Data CSV bulk: 8 files (enterprise, establishment, denomination, address, contact, activity, code, meta) — function table explicitly excluded
- KBO Public Search Web Service SOAP: paid (€50 / 2000 requests, ~7-day onboarding with Belgian bank transfer)
- Alternative Tier-2 vendor `crossroadsbankenterprises.com` (api.kbodata.app/v2 `/enterprise/{ent}/roles`): paid + needs DEC-20260428-A vetting

Recommendation: defer BE to a "Paid Tier-2 vendor onboarding" phase that bundles license + redistribution + primary_source_reference vetting with budget approval.

## Verification

- `tsc --noEmit` clean (full project)
- `validate-capability --slug latvian-company-data` — 19/20 (single Gate 5 failure on `task` and `company_name` entry-point fixture coverage is pre-existing on origin/main; not introduced this session)
- `smoke-test --slug latvian-company-data` — 11/11 green, live 24-field response in 1272 ms
- Live spot-checks: 3/3 entities returned officers with correctly normalized roles and dates
- `/go` six-lens review: 0 HIGH, 4 MEDIUM (1 fixed inline as `f623d73`: registry name diacritics; 3 flagged in PR body as follow-ups), 1 pre-existing LOW (alias-block indentation inherited from c2e4974)

## Non-obvious learnings

1. **CKAN datastore numeric-FK filter quirk.** The amatpersonas resource stores `at_legal_entity_registration_number` as a numeric column. The CKAN `filters` JSON value must be sent **unquoted** (`{"at_legal_entity_registration_number":40003245752}`); wrapping as a string returns zero rows. Hand-built template literal used for exactly this reason — comment in `fetchOfficers` flags it.

2. **LV officers dataset is a separate package.** The entities master (`uz` package, resource `25e80bf3-...`) does NOT include officers. Officers live in their own `officers` package (id `096c7a47-33cd-4dc9-a876-2c86e86230fd`) at resource `e665114a-...`. ~280k active rows, current state only.

3. **LV redaction state.** `latvian_identity_number_masked` is `DDMMYY-*****` — last 5 digits already redacted at source post-2022. No further client-side scrubbing needed. `birth_date` field exists in schema but always empty in observed rows.

4. **BE/EU registry directors landscape.** Per the 2026-05-18 source-side research artifact (`audit-output/registry-source-research-2026-05-18.md`): exactly **zero** EU national registries have free + structured per-record director APIs across BE, NL, DE, AT, FI, ES, PT, IT (these need paid/PDF/registration). Within that group, BE specifically has no free path even at the document level — KBO bulk explicitly omits the function table. Implications for the EU30 binding-ready KYB roadmap: BE = always-paid; budget required before extraction is possible.

5. **Stacked-PR base flip via `gh pr edit --base`.** My branch was inadvertently created when local `main` was carrying Phase 1's unmerged commit (`c2e4974`). Used `gh pr edit 134 --base feat/phase-1-class-a-relabel-fr-sk-uk` to convert #134 into a stacked PR — scopes the diff to LV-only while preserving history. Non-destructive; auto-promotes to `main` when #133 merges.

## Open

- **PR #134 awaiting #133.** Phase 3 LV PR depends on Phase 1 PR #133 merging first. Both are OPEN as of session end.
- **Working-tree state.** Branch was switched back to `main` between session work and `/end-session`. The latvian-company-data.ts file in the worktree was reverted to origin/main state (uncommitted local change). My committed work on the LV branch is intact on origin — the worktree revert is local-only and does not affect PR #134.
- **Phase 4 (SE + DK credential-gated)** queued per the phase-prompt cadence; the prompt for it should arrive after #134 lands.
- **MEDIUM follow-ups from /go review** (documented in PR body, not blocking):
  - Pass A.1: raw `fetch` vs `safeFetch` policy gap in `callDatastore` (URL is compile-time constant; smell flagged for future)
  - Pass A.2: name-lookup path is serial (entity → officers) with worst-case 30s; will flip to async more often per DEC-22
  - Pass B.1: `tier_2_available` boolean conflates "data unavailable" with "entity has no officers"; cross-handler shape question worth platform-wide follow-up rather than per-country fork

## Cost

€0 platform cost (LV is free CKAN). No vendor signups. No paid API spend.

## Artefacts

- PR #134: https://github.com/strale-io/strale/pull/134 (LV; OPEN, stacked on #133)
- Commits on `feat/phase-3-extraction-lv`: `1f5808f` (main implementation), `f623d73` (diacritics fix from reviewer)
- Research source for the BE-no-free-path conclusion: `audit-output/registry-source-research-2026-05-18.md`
