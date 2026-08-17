# PII fixture audit — all PII_ARRAY_FIELDS across tier-coverage fixtures

Date: 2026-05-18
Branch: chore/pii-fixture-audit-legal-representatives
Outcome: ALL CLEAN in scope — zero handlers re-captured, zero git-history leaks in `apps/api/tests/fixtures/tier-coverage/`. One out-of-scope follow-up surfaced (see "Related exposure surface" below).

## Trigger

During Phase 2 (2026-05-18), the first CZ fixture capture committed 7 real Skoda
board members' names + DOBs + nationality unscrubbed. Caught pre-commit. Root
cause: `legal_representatives` was not in
`apps/api/scripts/capture-tier-fixtures.ts`'s `PII_ARRAY_FIELDS` set. PR #136
(NO) and #137 (CZ) added it inline. The to-do prompting this audit was scoped to
`legal_representatives`; in practice the sweep covers the full
`PII_ARRAY_FIELDS` set so the conclusions transfer to the other PII keys.

## Step 1 — capture script verification

`apps/api/scripts/capture-tier-fixtures.ts:91` includes `"legal_representatives"`
in `PII_ARRAY_FIELDS`. The scrubber at line 109 replaces any populated array
under those keys with the literal string `"[REDACTED]"`. Confirmed.

Caveats on the scrubber (relevant to the audit's validity window):

- **Shallow.** `scrubFixture()` iterates `Object.entries(output)` — top-level
  keys only. A nested PII array (e.g. `{ company: { directors: [...] } }` or
  `{ subsidiaries: [{ directors: [...] }] }`) would not be reached. No current
  executor produces nested PII arrays, so this is latent.
- **Type lie.** The scrubber replaces a populated `T[]` with the literal
  string `"[REDACTED]"`. The tier-coverage gate
  (`check-tier-coverage.mjs`) checks key presence and treats the string as
  populated. Any future fixture-typed consumer (replay harness, type
  generator, downstream contract test) must skip or cast `PII_ARRAY_FIELDS`
  keys. Pre-existing accepted trade-off; not introduced by this audit.

## Step 2 — fixture enumeration (scope: `apps/api/tests/fixtures/tier-coverage/*.json`)

Grep across `apps/api/tests/fixtures/tier-coverage/*.json` for the full
`PII_ARRAY_FIELDS` set (`directors`, `partners`, `shareholders`, `owners`,
`beneficial_owners`, `shareHolders`, `share_holders`, `managers`, `officers`,
`legal_representatives`):

| Handler | PII field present | Value | Verdict |
| --- | --- | --- | --- |
| brazilian-company-data | partners | `"[REDACTED]"` | clean |
| cz-company-data | legal_representatives | `"[REDACTED]"` | clean |
| french-company-data | directors | `"[REDACTED]"` | clean |
| greek-company-data | directors | `"[REDACTED]"` | clean |
| italian-company-data | shareholders | `[]` (empty) | clean |
| japanese-company-data | directors | `null` | clean |
| norwegian-company-data | legal_representatives | `"[REDACTED]"` | clean |
| slovak-company-data | directors | `"[REDACTED]"` | clean |

All other fixtures (AU, AT, BE, BG, HR, CY, NL, EE, FI, HU, IE, LV, LT, LU, MT,
PL, PT, RO, SG, SI, ES, SE, CH, UK, US) carry no `PII_ARRAY_FIELDS` keys —
nothing to scrub. Only two fixtures (`cz`, `norwegian`) reference
`legal_representatives` specifically; both already redacted.

## Step 3 — git history check

Searched every commit that touched `apps/api/tests/fixtures/tier-coverage/`:

```
git log -p --all -- apps/api/tests/fixtures/tier-coverage/ \
  | grep -E '^\+.*"(directors|partners|shareholders|owners|beneficial_owners|shareHolders|share_holders|managers|officers|legal_representatives)":' \
  | grep -v '\[REDACTED\]' | grep -v 'null' | grep -v ': \[\]'
```

Zero matches. Every PII-array key ever added to a tier-coverage fixture in this
repo's history landed as `[REDACTED]`, `null`, or `[]`. No commit pushed real
PII through this directory.

Methodology caveat: the `^\+` filter only inspects additions, not removals.
A commit that added unredacted PII and a subsequent commit that removed it
would show as `-` in history and be invisible to this grep. The conclusion is
still defensible for the CZ incident specifically because the pre-commit catch
meant the unredacted fixture never reached `git commit` — there is no SHA
where it landed.

Touching commits, for reference:
- `7d1977b` feat(t2): Phase 2 legal_representatives extraction for CZ (#137)
- `a2bff2f` feat(t2): Phase 2 legal_representatives extraction for NO (#136)
- `4ff8fdd` fix(tier-coverage): capture HR/CH/UK fixtures (PR #125 follow-up)
- `77e2eee` feat: add check-tier-coverage.mjs CI gate

## Step 4 — verification

No code or fixture changes. `tsc --noEmit` / test suite not re-run because the
diff is documentation-only (this audit report). Baseline state matches
origin/main.

## Related exposure surface (out of scope; tracked as follow-up)

Outside this audit's scope but surfaced by the six-lens review: two manifest
`output_schema.example` blocks contain real natural-person names. These are
hand-authored, never passed through `scrubFixture()`, and live in the public
repo:

- `manifests/french-company-data.yaml:30–33` — three real TotalEnergies SE
  board members in `output_schema.example.directors`.
- `manifests/brazilian-company-data.yaml:30–32` — one real partner name +
  role in `output_schema.example.partners`.

This is the same class of personal data the CZ near-miss surfaced. The
`PII_ARRAY_FIELDS` guard in `capture-tier-fixtures.ts` does not touch
`manifests/`. Flagged for chat-side as a separate remediation to-do.

## Conclusion

The PR #125 / #136 / #137 pattern — adding fields to `PII_ARRAY_FIELDS` inline
with the capture run that surfaced them — caught the GDPR exposure before any
unredacted PII reached a commit. No remediation required within scope.

**Validity window.** This audit's clean finding holds as long as:

1. Every new array-of-natural-persons field added to an executor is also added
   to `PII_ARRAY_FIELDS` in `capture-tier-fixtures.ts` before its first
   capture.
2. Every fixture under `apps/api/tests/fixtures/tier-coverage/` is captured
   via that script (hand-edited fixtures bypass the scrubber entirely).
3. No executor begins emitting a nested PII array (the scrubber is
   shallow — only top-level keys are reached).
4. Manifests' `output_schema.example` blocks are independently policed; this
   audit did not cover them.

If any of (1)–(4) shifts, re-run this audit.

For future tier-coverage captures that surface a new PII array field, the
expected pattern is:

1. Capture run surfaces the new field.
2. Add the field name to `PII_ARRAY_FIELDS` in `capture-tier-fixtures.ts`.
3. Re-run capture before committing the fixture.

Refs Notion to-do `36467c87-082c-8117-8053-cb47e30a2c9f`.
