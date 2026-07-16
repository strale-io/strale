Intent: Ship Phase 7a — Italy binding-ready Tier 2 via Openapi IT-Stakeholders product (paid per-call, customer pass-through). Lift IT from `tier_2_available: false` to populated `legal_representatives[]` and close the EU30 directors gap for Italy.

# What shipped

PR #135 — https://github.com/strale-io/strale/pull/135 — both CI checks green (validate 19s, check 46s). Two commits:

1. `99faeb4` — feat(t2): Phase 7a IT binding-ready T2 via Openapi IT-Stakeholders
2. `3fbbd31` — fix: CI follow-ups for Phase 7a — taxonomy + COVERAGE.md regen

## Architecture: Option C (split slug)

New capability `italian-company-stakeholders` is a sibling of `italian-company-data`, not a bundled call. Same vendor relationship (Openapi.com), separate product (`IT-stakeholders` vs `IT-advanced`), separate scope. Matches `uk-companies-house-officers` + `gleif-l2-ubo-lookup` precedent. Cost discipline rationale: IT-Stakeholders is paid (€0.10-0.20 + 22% IT VAT ≈ €0.18 ≈ price_cents 20); always-bundling would charge T1-only callers. Customer-paid pass-through per DEC-20260503-A. CA orchestration calls the sibling only when T2 is requested.

## Files

- `apps/api/src/capabilities/lib/openapi-resolver.ts` — extends `OpenapiProduct` union with `it-stakeholders`, adds `PRODUCT_REGISTRY` entry, new response interfaces (`ItStakeholdersData`, `ItStakeholdersManager`, etc.), new canonical Strale shape `StraleLegalRepresentative`, new `mapItStakeholdersOutput`. Wire-shape normalisation: `executeOpenapiCapability` now handles both array-wrapped (existing products) and object-wrapped (IT-Stakeholders) `data` — the new product returns `data` as a single object, not `data: [...]`.
- `apps/api/src/capabilities/italian-company-stakeholders.ts` — new slim capability executor; delegates to resolver; sets `tier_2_available: true`.
- `apps/api/src/capabilities/italian-company-data.ts` — `tier_2_available_reason` updated to point at sibling.
- `manifests/italian-company-stakeholders.yaml` — full manifest with `cost_class: paid_per_call`, `price_cents: 20`, output_field_reliability, limitations including the OPENAPI_ENABLED + addendum gate and the per-call cost note. `personal_data_categories` uses `government_id` (taxonomy enum value covering codice fiscale).
- `apps/api/coverage-matrix/italian-company-stakeholders__it__company-registry.yaml` — `_source_notion_page_id` is a placeholder UUID `00000000-0000-0000-0000-000000000000`; needs real Notion page id (chat-side).
- `apps/api/scripts/smoke-it-stakeholders-mapper.ts` — fetch-mocked smoke (21/21 assertions pass) exercising the mapper against the OAS schema example.
- `apps/api/coverage-matrix/COVERAGE.md` — regenerated to include the new row.

## Verification

- **TypeScript build** clean (`tsc --noEmit` exit 0).
- **Mapper smoke** 21/21 assertions pass — name composition, SOU filter, role mapping (AUN→Managing director, PP→Special representative/agent), date normalisation, source_as_of, provenance.openapi_record_id.
- **Openapi-resolver offline regression** 44/44 still pass — array-vs-object normalisation does not regress IT-Advanced, ES-Advanced, PT-Advanced, or any WW-Top country.
- **Coverage-matrix schema validation** 48 files scanned, 0 violations.
- **CI gates**: check-tier-coverage (clean), check-manifest-guaranteed-consistency (clean), check-cost-class-coherence (clean), manifest-completeness (passes after `tax_id` → `government_id` taxonomy fix).
- **Live smoke deferred**: `OPENAPI_ENABLED=true` + addendum countersignature (Openapi case 151296) required. The OAS-schema-driven mapper smoke is the offline substitute.

# Open / next

- **After deploy**: run `npx tsx apps/api/scripts/onboard.ts --manifest manifests/italian-company-stakeholders.yaml` to create the DB row.
- **After addendum lands**: live smoke against Eni S.p.A. (codice fiscale 00484960588) — should return populated `legal_representatives[]`.
- **Chat-side**: replace placeholder `_source_notion_page_id` with real Notion page id once row created in Provider Coverage matrix DB.
- **Chat-side**: update Active Vendor Stack page (id `35367c87082c812e88d1dc6bdbfbd4f5`) — IT-Stakeholders SKU now in use.
- **Memory update**: entry 25 (or wherever IT capabilities state is captured) should reflect IT now binding-ready T2.
- **Phase 7b**: NL + ES + AT paid per-call sprint — different upstream needed per the registry-source-research doc (Openapi public catalog has no non-Italian Stakeholders SKU).

# Non-obvious learnings

1. **Cross-worktree write conflict materialised mid-session.** Another concurrent agent session in `C:\Users\pette\Projects\strale-work` checked out `feat/phase-1-class-a-relabel-fr-sk-uk` then `feat/phase-3-extraction-lv` over the top of my in-flight edits. My uncommitted edits to `openapi-resolver.ts` + `italian-company-data.ts` were wiped by their `git switch`; only my untracked NEW files survived (italian-company-stakeholders.ts, manifest, coverage-matrix yaml, smoke script). Recovered by creating an isolated worktree `C:\Users\pette\Projects\strale-phase7a` via `git worktree add`, copying the surviving files, and re-applying the two edits. **Lesson**: when working in a shared worktree (strale-work), commit immediately after each non-trivial edit — uncommitted state is not safe across concurrent agent sessions. Better still: spin a dedicated worktree (`git worktree add`) at the start.

2. **IT-Stakeholders wire shape differs from other Openapi products.** Returns `data` as a single object (`Stakeholders` schema in the OAS), not `data: [...]`. The generic `executeOpenapiCapability` assumed array-only. Extended the guard to accept both shapes; preserved IT-Advanced / ES-Advanced / PT-Advanced / WW-Top behaviour. Future Openapi products may follow either convention — the normalisation is now in place.

3. **`SOU` (Sole Owner) is filtered from `legal_representatives[]`.** Openapi's `managers[]` universe mixes director-like roles (AUN, PP, AD, PCDA, LIQ) with shareholder relations (SOU). The latter are not binding representatives, so they get filtered. Documented via `NON_REPRESENTATIVE_ROLE_CODES` set in the resolver — extensible if Openapi adds other shareholder-only codes.

4. **Per-manager multi-role flattened to primary role in v1.** Openapi's `managers[]` entries may carry multiple `roles[]`. v1 surfaces only the first role; multi-role exposure deferred to v1.1 if customer demand surfaces. Limitation documented in manifest.

5. **`personal_data_categories` taxonomy is canonical and enforced.** `tax_id` is not in the enum; canonical key for tax codes / codice fiscale is `government_id`. CI fails loudly on non-taxonomy values (`manifest-completeness.test.ts`). Worth memorising.

6. **`COVERAGE.md` is auto-regenerated and gate-checked.** Adding a new coverage-matrix YAML row requires running `npm run coverage-matrix:summary` to keep `COVERAGE.md` in sync — the `coverage-matrix:check` CI gate fails if stale.

# Cost

Zero this session — all verification offline (mocked fetch). Live smoke remains gated behind addendum + `OPENAPI_ENABLED=true`.

# Stop-conditions observed

- Worktree clean: yes (after creating isolated worktree)
- HEAD on feature branch: yes (`feat/phase-7a-it-stakeholders`)
- IT-Stakeholders API accessible: not exercised live; OAS-schema-driven mapper smoke pass substitutes
- Smoke 0 stakeholders: not applicable (fetch mocked; OAS sample populated)
- /go review HIGH/CRITICAL: PR opened; CI green; no blocker findings yet (six-lens review can be requested via /ultrareview if Petter wants)
- Tests fail: no
