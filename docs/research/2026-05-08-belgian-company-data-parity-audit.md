# belgian-company-data parity audit — 2026-05-08

Read-only audit against four parity questions raised in chat session 2026-05-08 after comparative analysis vs Topograph's BE catalog.

## Capability state at audit time

- **Provider file:** [apps/api/src/capabilities/belgian-company-data.ts](apps/api/src/capabilities/belgian-company-data.ts) at HEAD `1d2e267` (the source commit of merge `089a8c9` on origin/main).
- **Manifest entry:** [manifests/belgian-company-data.yaml](manifests/belgian-company-data.yaml) — single-file YAML manifest; auto-discovered by [auto-register.ts](apps/api/src/capabilities/auto-register.ts).
- **VAT helper:** [apps/api/src/lib/vat-derivation.ts:64-68](apps/api/src/lib/vat-derivation.ts#L64-L68) (`deriveVatBE` — strips dots/hyphens/spaces, requires exactly 10 digits, prepends `BE`).
- **Last shipped commits affecting this capability:**
  - `1d2e267` 2026-05-08 — `feat: add jurisdiction field to SK/CZ/BE/EE/PL company-data capabilities` (PR #67).
  - `284a70b` 2026-04-29 — `feat(belgian-company-data): drop Browserless fallback; CBEAPI as sole path`.
  - `6f79b1e` earlier — manifest YAML backfill phase.
- **Test files:** none. No `belgian-company-data.test.ts` exists. Coverage is only via the manifest-driven onboarding pipeline's auto-generated 5-suite fixture set.

## Findings

### Question 1 — VAT-format input acceptance

**Verdict:**
- Accepts `0403.170.701` (KBO with dots) — **yes** (intended; primary path).
- Accepts `0403170701` (KBO without dots) — **yes** (intended; primary path).
- Accepts `BE0403170701` (VAT-prefixed) — **yes, but accidentally** (via the substring-fallback regex, not an explicit branch).
- Accepts `BE 0403.170.701` and similar mixed forms — **yes**, same accidental substring path.

**Evidence:** [belgian-company-data.ts:22-35](apps/api/src/capabilities/belgian-company-data.ts#L22-L35).

```ts
const KBO_RE = /^0?\d{3}\.?\d{3}\.?\d{3}$/;

function findKbo(input: string): string | null {
  const cleaned = input.replace(/[\s]/g, "");
  if (KBO_RE.test(cleaned)) {
    const digits = cleaned.replace(/\./g, "");
    return digits.padStart(10, "0");
  }
  const match = input.match(/0?\d{3}\.?\d{3}\.?\d{3}/);
  if (match && KBO_RE.test(match[0])) {
    return match[0].replace(/\./g, "").padStart(10, "0");
  }
  return null;
}
```

For `BE0403170701`: the anchored `KBO_RE.test` on the cleaned input fails (the `B` and `E` aren't digits). The substring fallback at line 30 then matches `0403170701` (a 10-digit substring) and re-tests it against `KBO_RE`, which passes. Result: `0403170701`. The CBEAPI lookup proceeds with the correct KBO.

**Behavior on unrecognized format:** `findKbo` returns `null`, and the executor falls through to fuzzy name search (line 154-156: `searchQuery = kbo ?? trimmed; isKbo = !!kbo`). So a malformed input like `BE-INVALID` would be passed to CBEAPI's `/api/v1/company/search?name=BE-INVALID`. CBEAPI would return zero results, and the executor would throw `No Belgian company found matching "BE-INVALID".` from [line 106](apps/api/src/capabilities/belgian-company-data.ts#L106). Not silent — but the error message frames it as "no match" rather than "input format unrecognized," which is misleading.

**Gap severity: minor** — input is accepted in practice via accidental coverage, but:
- The `input_schema` description on the manifest only declares `enterprise_number (e.g. 0404.616.494)` — VAT format is undocumented.
- The behavior depends on a subtle regex-substring interaction; future refactors could regress it silently.
- The error message for malformed VAT-prefix inputs is misleading.

### Question 2 — Legal-form standardization

**Verdict:** raw vendor field only. **No ISO 20275, no internal taxonomy, no code/text pair, no normalization.**

**Evidence:** [belgian-company-data.ts:122](apps/api/src/capabilities/belgian-company-data.ts#L122):

```ts
business_type: company.juridical_form ?? null,
```

The output field `business_type` is the raw `juridical_form` string from CBEAPI's response. The manifest's `output_schema.example` ([manifests/belgian-company-data.yaml:29](manifests/belgian-company-data.yaml#L29)) shows `business_type: Société anonyme` — confirming the value is localized natural-language text (likely French or Dutch depending on the entity's primary language). No `business_type_code` field. No standardization layer.

A repo-wide grep for `iso[_-]?20275`, `legal[_-]?form[_-]?taxonomy`, `juridicalForm.*map`, `business_type_code` returns zero results outside test fixtures. There is no shared legal-form classification layer in the codebase that this capability could draw from.

**Cross-sibling note:** [slovak-company-data.ts:179-180](apps/api/src/capabilities/slovak-company-data.ts#L179-L180) returns both `legal_form` (text) and `legal_form_code` from RPO. [latvian-company-data.ts:138](apps/api/src/capabilities/latvian-company-data.ts#L138) returns `company_type` + `company_type_code`. CZ returns only the code. Cross-sibling shape is divergent (filed P2 to-do); BE is a third variant — single text field with neither code nor taxonomy.

**Gap severity: major** — customers building cross-jurisdiction filters (e.g. "show me all limited-liability entities across BE/SK/LV") cannot do so reliably from BE responses without per-language knowledge of the long tail of 146 BE legal forms.

### Question 3 — NACE code surfacing

**Verdict:** single first-activity code returned as bare numeric string in `industry` field. **No description, no array, no NACE-BEL → NACE level-4 mapping.**

**Evidence:** [belgian-company-data.ts:110-116, 130](apps/api/src/capabilities/belgian-company-data.ts#L110-L116):

```ts
const activities = Array.isArray(company.activities) ? company.activities : [];
const nace =
  activities.length > 0
    ? (activities[0] as Record<string, unknown>).nace_code ??
      (activities[0] as Record<string, unknown>).code ??
      null
    : null;
// ...
industry: nace ? String(nace) : null,
```

Behavior:
- Pulls `activities[0].nace_code` from CBEAPI; falls back to `activities[0].code`; otherwise null.
- Returns single string only — no description, no version (NACE-BEL 2008 / NACE Rev.2 indistinguishable).
- Discards all activities beyond the first.
- No NACE-BEL → NACE Rev.2 / ISCED mapping. NACE-BEL has BE-specific extensions at level 4–5 (e.g. `47.78.6` Belgian-specific subcode for "Retail sale of religious articles") which an unaware consumer would treat as malformed NACE.

**Manifest reliability** ([manifests/belgian-company-data.yaml:130](manifests/belgian-company-data.yaml#L130)): `industry: rare`. This is honest about how often the field is populated, but the description on [line 6](manifests/belgian-company-data.yaml#L6) advertises `Returns name, status, type, address, registration date, NACE code, ...` — promising NACE coverage that the implementation rarely delivers and never enriches.

**Gap severity: moderate** — single bare code without description is a usability gap, though it's the same shape as IE's `nace_v2_code` (single, bare). The bigger gap is the missing NACE-BEL identifier — consumers can't tell if `47.78.6` is malformed or a valid Belgian extension.

### Question 4 — Officer role standardization

**Verdict:** **the capability returns `directors: []` hardcoded for every company.** No officer/director data is ever surfaced. No standardization layer exists because there's nothing to standardize.

**Evidence:** [belgian-company-data.ts:131](apps/api/src/capabilities/belgian-company-data.ts#L131):

```ts
directors: [],
```

Literally the empty-array literal. CBEAPI's response is not consulted for representatives, statutory officers, or any role data. The CbeCompany interface declared on [line 52-66](apps/api/src/capabilities/belgian-company-data.ts#L52-L66) does not even type a `representatives` or `officers` field — the executor wasn't designed to surface them.

**Manifest dishonesty** ([manifests/belgian-company-data.yaml:131](manifests/belgian-company-data.yaml#L131)): `directors: guaranteed`. The `output_field_reliability` annotation says `directors` is always present and non-null. That's technically true (`[]` is non-null), but functionally misleading: every customer that filters or asserts on `directors.length > 0` will get zero results. The manifest's `expected_fields` test fixture ([line 103-105](manifests/belgian-company-data.yaml#L103-L105)) asserts `operator: not_null` which passes against `[]` — so the smoke test gives a green light for a field that never carries data.

**Gap severity: major** — three layers:
1. The data isn't there (CBEAPI's free tier may not expose it; or it does but the executor doesn't read it — needs verification).
2. The manifest claims it's there guaranteed.
3. No role-standardization layer exists, but that's moot until layer 1 is fixed.

## Cross-cutting observations

1. **`findKbo` truncation bug for non-0-prefix 10-digit KBOs.** The substring fallback at line 30 has a corner case: for an input that's exactly 10 digits and doesn't start with `0` (rare but legal — pre-2008 enterprise numbers can have first-digit ≠ 0), the regex `0?\d{3}\.?\d{3}\.?\d{3}` matches only the first 9 digits, then `padStart(10, "0")` prepends a `0` — turning input `1234567890` into output `0123456789`. Silent corruption to a different valid KBO. Affects only the minority of pre-2008 numbering, but is a real correctness bug.

2. **Manifest description vs reality drift.** [Line 6](manifests/belgian-company-data.yaml#L6) advertises `Returns name, status, type, address, registration date, NACE code, and derived BE VAT number.` — but the executor delivers NACE rarely, directors never (always empty), and the description doesn't mention `directors` even though the field is in the output. The description was written before `directors: []` was hardcoded; nobody updated either side.

3. **Cross-sibling output-shape divergence widens.** BE's `business_type` (single text) vs SK/LV's `legal_form` + `legal_form_code` pair vs CZ's `legal_form_code`-only vs SI's `legal_form` text-only — four different shapes across nine identity capabilities for the same conceptual field. Already a P2 to-do (https://www.notion.so/35967c87082c8108a800e9a368f75184 is the jurisdiction backfill, separate; the legal-form shape reconciliation is the unfiled twin).

4. **No unit tests for `belgian-company-data`.** The `apps/api` test directory has no `belgian-company-data.test.ts`. Coverage is only via the auto-generated onboarding pipeline's 5-suite fixtures, all of which key off the AB InBev (`0417497106`) example. The `findKbo` truncation bug isn't caught because the AB InBev fixture starts with `0`. Same for the directors-always-empty issue — the manifest's `not_null` assertion accepts `[]` as passing.

5. **`registration_date` is `common` in reliability ([line 129](manifests/belgian-company-data.yaml#L129)) but `equals "1977-08-02"` in expected_fields ([line 100-102](manifests/belgian-company-data.yaml#L100-L102)) — the test asserts a specific date for AB InBev, which would be expected since AB InBev's start date is stable, but the `common` reliability suggests the field is sometimes null** for other entities. If a customer relies on `registration_date` for filtering, they need to handle null. Documented honestly, but the description on line 6 doesn't caveat it.

6. **VAT derivation is purely algorithmic** (`deriveVatBE` strips dots and prepends `BE`) — there's no VIES check that the VAT is actually registered. For BE this works because BE VAT == BE + KBO digits is structural, but the capability never validates the entity is actually VAT-registered (which would require a VIES live check). The manifest's `vat_number: guaranteed` is technically truthful (the format is always derivable) but a customer interpreting "VAT number guaranteed" as "VAT-registered" would be wrong. Same pattern across CZ/PL/SE/NO/DK/FI/HR/IT/ES — this is a known shape, not a BE-specific issue, but worth noting for parity since Topograph likely returns VIES-validated VAT.

## Recommended follow-ups

Ranked by signal strength + ease.

1. **Fix `directors: []` hardcoded.** *S effort. Can ship today.*
   - Investigate whether CBEAPI's `/api/v1/company/{kbo}` response carries `representatives`, `officers`, `legal_representatives`, or any equivalent field. The executor's `CbeCompany` interface ([line 52-66](apps/api/src/capabilities/belgian-company-data.ts#L52-L66)) doesn't declare one, but `[key: string]: unknown` allows any field — could be that CBEAPI does surface them and the original author skipped reading them.
   - If CBEAPI does carry officer data → wire it through, return real array with `{name, role}` entries.
   - If CBEAPI does NOT carry officer data → demote manifest `directors` from `guaranteed` to `rare` (and update the description to remove the implied claim), or remove the field from the output entirely until KBO Open Data ships. Either is more honest than `[]`-pretending-to-be-data.
   - **Rule 12 carve-out:** if the fix wires CBEAPI's officers, that's a new code path → unit test required (mock CBEAPI response with/without `representatives`). If the fix just demotes the manifest field, no new code path → no test required.

2. **Fix `findKbo` substring-fallback truncation bug.** *S effort. Can ship today.*
   - Replace the substring-then-regex pattern with a deterministic clean-and-validate: strip `BE` prefix and non-digits, then check for exactly 10 digits.
   - Adds explicit BE-prefix recognition (also closes Q1's documentation gap).
   - **Rule 12 carve-out:** new code path → regression test required. Test should assert `findKbo("1234567890") === "1234567890"` (no truncation), `findKbo("BE0417497106") === "0417497106"` (prefix stripped), and `findKbo("BE 0417.497.106") === "0417497106"` (mixed format normalized).

3. **Update manifest description and expected_fields to match reality.** *S effort. Can ship today.*
   - Description on line 6 should drop `NACE code` (rare, undescribed) and `directors` (always empty) until the underlying paths actually deliver.
   - `expected_fields[].directors` ([line 103-105](manifests/belgian-company-data.yaml#L103-L105)) should be removed if the `[]` hardcode persists, or upgraded to a length assertion if officers are wired.

4. **Surface NACE description, not just code.** *M effort. Blocked on CBEAPI's `activities[].description` field availability.*
   - If CBEAPI doesn't carry it, requires a NACE-BEL lookup table (manageable: ~700 codes at level 4) bundled with the capability or a small reference data table.
   - Consider returning `nace_codes` as an array (matching CZ's plural shape) rather than `industry` singular — folds into the existing P2 reconciliation.

5. **Add ISO 20275 / internal legal-form taxonomy mapping.** *M effort. Blocked on legal-form-shape P2 reconciliation across siblings.*
   - Without a cross-sibling agreement on the shape (`legal_form` + `legal_form_code`? `legal_form` + `legal_form_iso20275`? add taxonomy as separate field?), one-off BE work would just deepen the divergence.
   - Recommend deferring until the P2 reconciliation prompt picks a shape, then applying uniformly.

6. **Defer comprehensive officer/director + role standardization to KBO Open Data SFTP migration.** *L effort. Blocked on FPS Economy SFTP credentials (registration email sent 2026-04-29).*
   - The KBO Open Data spec ([docs/research/2026-04-29-be-kbo-open-data-ingest-spec.md](docs/research/2026-04-29-be-kbo-open-data-ingest-spec.md)) lists `establishment.csv` and `denomination.csv` files but not a dedicated representatives file. Need to verify the actual file set when SFTP arrives — KBO Open Data may or may not include officer data in the free re-user tier; the chargeable Cookbook content does.

**Rule 12 carve-out (audit-follow-up test coverage):** items 1, 2, and 4 above introduce new code paths if executed and require their own regression tests as part of those follow-up prompts. Item 3 is a manifest-only change; no code path; no test required. Items 5 and 6 are scoped out of this audit's follow-up — they will land in the P2 reconciliation and KBO migration prompts respectively, and those prompts will own their test coverage.

## Verdict summary

| Question | Verdict | Severity |
|---|---|---|
| Q1 — VAT-format input | accepts (accidentally via substring) | minor |
| Q2 — Legal-form standardization | raw text only, no taxonomy | major |
| Q3 — NACE surfacing | first code only, bare, no description, no NACE-BEL mapping | moderate |
| Q4 — Officer/director standardization | hardcoded `[]`, manifest claims `guaranteed` | major |

Two of the four parity gaps (Q2, Q4) are major. Q4 also surfaces a manifest-vs-reality dishonesty that's worth fixing for its own sake regardless of Topograph parity. Q1 is fine in practice but undocumented; Q3 is a usability gap rather than a correctness one.

The `findKbo` truncation bug surfaced as a cross-cutting observation is independent of the Topograph parity questions but is the highest-priority correctness issue in the audit findings.
