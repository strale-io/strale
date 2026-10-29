Intent: H7e PR B (platform-hardening T7), the H7c known_answer tightening that `apps/api/src/capabilities/__fixtures__/upstream/README.md` left open.

# H7e PR B — known_answer contracts tightened (2026-10-29)

- The upstream replay test now judges 32 executors (was 12). 18 manifests got
  known_answer checks on values only a parsed answer has. Two
  (`no-bankruptcy-check`, `postal-code-lookup`) already failed the
  perturbation proof and only needed recording. Five stay out, with reasons
  in the README.
- Four known_answer inputs proved nothing and were replaced: `cve-lookup`
  (`test_value` placeholder), `eori-validate` (an invalid EORI), 
  `api-health-check` (a URL that answers 404), `ted-procurement`.
- **Executor bug fixed:** `ted-procurement` sent ISO alpha-2 (`SE`) to TED's
  alpha-3 buyer-country filter, so every country-filtered search returned zero
  notices to customers. It now resolves any ISO form or name to alpha-3
  (`EL` maps to Greece). Unit test plus the replay, whose recorded request
  carries `SWE`.
- The recorder redacts `cve-lookup` advisory details and `ted-procurement`
  notice descriptions (free text that named a natural person).
- Live: `record-upstream.ts --check` 32/32 without drift.

Evidence: [receipt](../../../archive/receipts/2026-10-29-test-run-h7c-known-answer-tightening.json).

## Not done here

- Production known_answer suites are unchanged until
  `npx tsx scripts/sync-known-answer-fixtures.ts --slugs <the 18>` runs with
  operator DB access (fixture refresh is platform authority, DEC-20260812-A).
  Without it, production keeps the old weak checks and old inputs, including
  the 404 URL for api-health-check and the placeholder for cve-lookup.
- `validate-capability.ts` and `checkReadiness` need the operator DB and were
  not run; the ted-procurement executor change does not touch its schema or
  manifest fields beyond the known_answer input.
