# vat-validate multi-provider refactor — session handoff

**Intent:** Refactor vat-validate from VIES-only to a per-country provider router (VIES + Brreg + Swiss UID + HMRC stub) without breaking the manifest pipeline's authority guard.

## Shipped

- **Router refactor.** `apps/api/src/capabilities/vat-validate.ts` now parses the input, dispatches by country prefix, and wraps every call with substrate-level cache + stale-fallback + a no-op `withRateLimit` seam. ~150 lines, replaces the previous ~200 line VIES-only executor.
- **Per-country providers** at `apps/api/src/capabilities/lib/vat-providers/`:
  - `vies.ts` — EU27 + XI (extracted from old executor; unchanged behaviour)
  - `brreg.ts` — Norway (free, no auth, NLOD open-data)
  - `uid-ch.ts` — Switzerland + Liechtenstein (free public services tier, 20/min)
  - `hmrc.ts` — UK (OAuth2, throws structured "credentials pending" until Petter sets `HMRC_CLIENT_ID`/`HMRC_CLIENT_SECRET` after HMRC Developer Hub approval)
  - `types.ts` — shared `VatProvider` interface
- **Cache bumped to 48h** (was 24h) and lifted to substrate level so every provider gets the same resilience treatment.
- **HMRC consultation reference number** plumbed through `provenance.source_reference` for verified-mode UK calls when `HMRC_REQUESTER_VRN` is set.
- **Manifest limitations updated** — 4 multi-provider-aware entries replacing the original 3 VIES-only entries. DB-synced via `--backfill --force`.
- **Privacy policy + frontend** shipped to support the HMRC application (separate concern; see commit a1a60cb on strale-frontend, then 488806c).
- **CLAUDE.md** corrected to reflect Railway US East (was incorrectly "EU region").

Commits:
- `dbecdf7` — refactor(vat-validate): per-country provider router with 48h cache substrate
- `243f765` — chore: correct Railway region in CLAUDE.md (US East, not EU)

## Deliberately not shipped (deferred)

### Manifest-canonical metadata reconciliation

The vat-validate capability's `name`, `description`, `input_schema`, `output_schema`, `data_source`, and `output_field_reliability` in DB still reflect the single-provider VIES era:

- `name`: "EU VAT Validation + VIES Enrichment"
- `description`: VIES-only
- `data_source`: "VIES (EU VAT Information Exchange System, European Commission)"
- `output_field_reliability`: all 5 fields marked `guaranteed`

The manifest at `manifests/vat-validate.yaml` was reverted to match DB on those six fields (with a header comment explaining why). The onboarding pipeline does not currently support updating manifest-canonical fields on existing capabilities — `--force-override-authority` was tried, but it explicitly does NOT bypass manifest-canonical drift errors per `apps/api/src/lib/capability-field-authority.ts` line 287-294 ("manifest-canonical violations STILL throw — real manifest-drift bug").

**Why this is acceptable for now:** per-call audit-trail provenance is already honest. Each provider module sets `provenance.source` when it executes (e.g. `data.brreg.no/enhetsregisteret` for NO calls), so audit records reflect the actual upstream the customer was served from. Only the catalog-level metadata (capability detail page, search index) is temporarily stale.

**Why NO/CH known_answer test fixtures were not added:** the DB's `output_field_reliability` says `company_name` and `company_address` are `guaranteed`, but Brreg legitimately returns blank when an entity isn't in the MVA register, and Swiss UID's public `ValidateVatNumber` always returns blank by design (boolean-only endpoint). Adding NO/CH known_answer fixtures with the current DB metadata would cause `not_null` assertions to fail and tank SQS for the wrong reason. Defer until the system fix lands.

### Tracked fix

Notion To-do: **Multi-provider capabilities as first-class shape** (page `34f67c87-082c-8166-aaf6-dcaa53bfd8ec`). Priority P2, Effort L, Owner "Claude code", Status Inbox.

Scope summary: add `capability_providers` sub-table; derive top-level metadata (data_source = aggregate, output_field_reliability = MIN across providers); update authority taxonomy so multi-provider capabilities can update their derived aggregate fields via standard `--backfill`; record per-provider name in `test_runs` and per-call audit. Sequence before the company-registry direct-API migration starts to avoid compounding the same friction across N more capabilities.

The To-do body has the full scope, constraints (Scoring Integrity, Onboarding Protocol), and first-reads list.

## HMRC application status

In progress. Privacy policy is the prerequisite Petter was missing (now shipped). When the form is resumed:

- Q1 (server location): "Outside the EEA with adequacy agreements" — UK-US Data Bridge / DPF UK Extension applies via Railway US East.
- Q2 (privacy policy URL): https://strale.dev/privacy

HMRC review takes up to 10 working days after submission. While waiting, Petter can register the sandbox app and exercise `hmrc.ts` against test VRNs by setting `HMRC_USE_SANDBOX=true` + `HMRC_SANDBOX_CLIENT_ID/SECRET`.

## Coverage summary

- **EU27 + XI** — live via VIES (unchanged)
- **Norway** — live via Brreg (new today)
- **Switzerland + Liechtenstein** — live via Swiss UID (new today)
- **United Kingdom** — wired, awaiting HMRC production credentials

## Verification

- Type-check: `tsc --noEmit` — clean
- `npx tsx scripts/validate-capability.ts --slug vat-validate` — 19/19 passed
- `npx tsx scripts/smoke-test.ts --slug vat-validate` — 11/11 passed, SQS 80.8
- `npx tsx scripts/onboard.ts --manifest ../../manifests/vat-validate.yaml --backfill --force` — clean run, 4 limitations synced, capability persistence done
