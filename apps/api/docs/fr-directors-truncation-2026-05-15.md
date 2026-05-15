# FR directors truncation — root-cause investigation

**Date:** 2026-05-15
**Triggered by:** Batch 2 audit finding ([apps/api/docs/identity-field-coverage-2026-05-15.md](identity-field-coverage-2026-05-15.md), FR per-country detail section).
**Verdict:** **Strale-side cap.** Upstream returns full `dirigeants` array; the FR handler slices it to the first 3 entries.
**Fix shape:** One-line change (raise or remove `slice(0, 3)`), plus manifest schema reconciliation for the companion fields.
**Recommended next step:** Queue a fix prompt. Effort = minutes for the code, ~15 min for tests + manifest update.

---

## RNE / upstream behaviour

The FR capability does **not** call INPI's RNE API directly. It calls **`recherche-entreprises.api.gouv.fr`** ([apps/api/src/capabilities/french-company-data.ts:6](../src/capabilities/french-company-data.ts#L6)), which is the French government's national-data aggregator (operated by etalab / DINUM). Recherche-Entreprises is an open, no-auth, free API that aggregates SIRENE + RNE + multiple ancillary datasets.

The endpoint used is `GET /search?q=<query>&page=1&per_page=1` ([french-company-data.ts:35](../src/capabilities/french-company-data.ts#L35)). The `per_page` parameter controls *how many matching companies* are returned, not how many directors per company. Per the Recherche-Entreprises public documentation, the `dirigeants` field on each company is the **full** statutory representative list as ingested from RNE — no upstream truncation.

The handler itself confirms the upstream returns the full list: line 75 emits `total_directors: allDirectors.length` from the raw response, which is then sliced to 3 for the `directors` field. If the upstream had already truncated, `total_directors` would be at most 3 — and the Batch 2 audit observed values of 15, 20, and 20, proving the upstream returns the full list.

**Conclusion: the upstream is not the source of the 3-entry cap.**

## Strale handler behaviour (the adapter)

[apps/api/src/capabilities/french-company-data.ts:55-58](../src/capabilities/french-company-data.ts#L55-L58):

```ts
const allDirectors = Array.isArray(c.dirigeants) ? c.dirigeants : [];
const directors = allDirectors.slice(0, 3).map((d: any) =>
  `${d.prenoms || ""} ${d.nom || ""}`.trim() + (d.qualite ? ` (${d.qualite})` : ""),
);
```

The cap is the explicit `.slice(0, 3)` on line 56. The companion fields `directors_truncated` (line 74) and `total_directors` (line 75) deliberately disclose the truncation to consumers.

**Inline comment (lines 53-54):**

> Directors: keep the slice(0, 3) but expose truncation transparency via companion fields so consumers know more directors exist beyond the slice.

**Git history:**

- The `.slice(0, 3)` was present at the capability's **original** introduction in commit `094a597` (bulk-add commit "Add 22 new capabilities: 15 EU company registries + 7 validation utilities"). No rationale documented at the time.
- Commit `c523485` (2026-05-09, "fix(P2 doctrine sweep): null instead of fabricated defaults across 5 capabilities") explicitly **kept** the slice and *added* `directors_truncated` + `total_directors` as transparency fields. The commit message labels the cap as "(defensible payload management)" — i.e. the slice was preserved as a payload-size precaution, not because the data wasn't available.

So the cap is intentional but not load-bearing: it was a payload-size hedge introduced at first-implementation, retained for transparency in May 2026, and never benchmarked against actual payload sizes.

## Root cause

The 3-entry cap is a Strale-side payload-size hedge in [french-company-data.ts:56](../src/capabilities/french-company-data.ts#L56). The upstream (`recherche-entreprises.api.gouv.fr`) returns the full `dirigeants` array. There is no source-level limitation. The cap exists because someone wrote `.slice(0, 3)` at first-implementation and the doctrine sweep on 2026-05-09 explicitly chose to keep it while adding transparency rather than to remove it.

## Fix shape options

### Option A — Minimal (remove cap entirely)

```ts
const allDirectors = Array.isArray(c.dirigeants) ? c.dirigeants : [];
const directors = allDirectors.map((d: any) =>
  `${d.prenoms || ""} ${d.nom || ""}`.trim() + (d.qualite ? ` (${d.qualite})` : ""),
);
```

- **Effort:** ~5 min code + ~10 min test + manifest update.
- **Payload risk:** typical major French entities have 15-25 directors at ~50-80 bytes each → 1-2 KB extra payload. Negligible at €0.05/call pricing.
- **Pathological risk:** very large French entities (state-owned, banking groups, mutuelles) may have 50-200+ statutory representatives. A payload of ~16 KB is still well within HTTP norms and Strale's per-response practices but worth a guard.
- **Companion-field handling:** `directors_truncated` becomes structurally always `false`. Can keep for backwards compat or drop. `total_directors` becomes redundant with `directors.length`. Can drop. Either way the manifest's `output_schema` needs an update.
- **Breaking-change risk:** zero for consumers reading `directors` (more entries, same shape). Consumers reading `directors_truncated` will see the value flip from `true` to `false` for major entities — they may have used it as a "should I fetch more?" trigger, which becomes moot.

### Option B — Bounded (raise cap to a safe ceiling) — **RECOMMENDED**

```ts
const DIRECTORS_CAP = 50;
const allDirectors = Array.isArray(c.dirigeants) ? c.dirigeants : [];
const directors = allDirectors.slice(0, DIRECTORS_CAP).map((d: any) =>
  `${d.prenoms || ""} ${d.nom || ""}`.trim() + (d.qualite ? ` (${d.qualite})` : ""),
);
// directors_truncated and total_directors stay; will be false/length for
// the vast majority of entities (capping only the long-tail pathological case).
```

- **Effort:** identical to Option A.
- **Payload risk:** bounded at ~4 KB for the directors block. Predictable.
- **Pathological coverage:** the 50-cap protects against runaway state-entity payloads without changing behaviour for any normal company.
- **Companion-field handling:** `directors_truncated` keeps its honest meaning (true for the rare entity with >50 representatives). `total_directors` keeps its meaning (full count). No manifest change.
- **Breaking-change risk:** zero.

### Option C — Clean (remove cap + companion fields, schema reconciliation)

Drop the slice, drop `directors_truncated`, drop `total_directors`. Update the manifest schema + `output_field_reliability` accordingly. Update any frozen-fixture tests.

- **Effort:** ~30 min — touches manifest + frozen tests + executor.
- **Surface change:** consumers lose two fields. The Capability × Country Coverage Matrix and downstream Counterparty Assurance orchestrator (if it reads these) need re-checking.
- **Justification:** cleaner API. But the cleanup is a future-tense win and the disclosure has product value (a consumer asking "did I get all directors?" gets a yes/no answer).
- Not recommended for v1 — premature cleanup.

### Recommendation

**Option B.** One-liner constant + slice cap raised to 50. Preserves the honest-disclosure pattern from the 2026-05-09 doctrine sweep. Zero breaking-change risk. Closes the FR directors-coverage gap for all normal entities.

## Followups

1. **Queue fix prompt.** Apply Option B. Update the FR per-country detail in [identity-field-coverage-2026-05-15.md](identity-field-coverage-2026-05-15.md) to reflect "full director coverage (cap 50)" after the fix lands.
2. **Capability × Country Coverage Matrix (Notion).** FR's directors-coverage cell should change from "yes (capped at 3, true count 15-20)" to "yes (capped at 50)" once the fix ships.
3. **Same-pattern check for other capabilities.** Grep `apps/api/src/capabilities/` for `.slice(0, 3)` or similar director/officer/UBO truncations. The doctrine sweep on 2026-05-09 touched 5 capabilities — verify whether any of the others (austrian, belgian, german, etc.) carry an equivalent slice that was kept "for payload management." If found, treat as part of the same fix.
4. **No code modified in this session** per investigation-only scope.

---

*Generated by Claude Code 2026-05-15. Read-only investigation. No code changes. Branch: `docs/identity-field-coverage-2026-05-15`.*
