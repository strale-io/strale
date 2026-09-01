---
doc_type: implementation-plan
topic: x402-price-representation-parity
status: agreed
complete: true
phase: M2
authority_scope: none
authority_active: false
created_at: 2026-09-01
decision_record: DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6
money_critical_path: true
base_sha: 68c93e66237423e3b8d284d528f36950e85291ba
review_route: codex-fallback-after-claude-opus-and-sonnet-timeouts
reviewed_by: codex-gpt-5.6-sol-xhigh
---

# x402 price representation parity plan

Claude Opus and Claude Sonnet were each attempted first with non-persistent
sessions; both timed out without a verdict. The founder-authorized independent
Codex fallback reviewed the revised plan and returned `PASS`.

## Intent

Remove the known precision loss from the legacy x402 manifest and OpenAPI
payment annotations so every advertised price represents the exact USDC atomic
amount used by the challenge and settlement path.

This is implementation conformance for an existing active pricing decision. It
does not create a new price, change `EUR_USD_RATE`, alter catalog EUR prices,
introduce channel discounts, or activate repo-native decision authority.

## Evidence and constraints

- The active Notion decision at
  `https://app.notion.com/p/35467c87082c8124bcc5e2c2597c76c6`
  requires one EUR catalog price converted through one `EUR_USD_RATE`, with no
  separate USD tier, discount, or cap.
- The source-qualified candidate record is
  `docs/decisions/records/DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md`.
  Its body and the collision-resolution report are immutable historical
  evidence and will not be edited.
- `eurCentsToMicroUsd()` already defines the exact integer amount used as USDC
  atomic units. `/x402/catalog` publishes the corresponding clean numeric value.
- `getX402Manifest()` currently uses `toFixed(2)` and therefore turns a two-cent
  EUR price at the default rate from exact USD `0.0216` into `0.02`.
- `buildX402Operation()` currently uses `toFixed(3)` and turns the same price
  into `0.022`.
- x402 v2 remains the recommended protocol generation; the payment requirement
  itself is denominated in token atomic units. Public decimal metadata may use
  the token's full six-decimal precision.
- Linear connectivity is unavailable in this Codex environment. No Linear issue
  is in scope; record the degraded connection in the session handoff.

## Implementation

1. Add a pricing helper in `apps/api/src/lib/x402-gateway.ts` that renders the
   integer micro-USD amount as an unsigned, fixed six-decimal USD string. Build
   the string from the integer atomic amount, not floating-point formatting.
   Keep the existing human-facing dollar-string helper and make it reuse the
   canonical decimal representation where appropriate.
2. In `apps/api/src/routes/x402-gateway-v2.ts`, derive manifest and OpenAPI
   amounts from each row's canonical EUR `priceCents` through that helper.
   Preserve field names, currencies, methods, paths, cache behavior, ordering,
   free-tier filtering, challenge generation, verification, and settlement.
3. Add two-cent EUR capability **and solution** fixtures so both duplicated
   manifest/OpenAPI mappings are exercised. Use separate fail-before tests for
   the two known defects:
   - manifest capability and solution prices must be `"0.021600"`, not `"0.02"`;
   - OpenAPI capability and solution amounts must be `"0.021600"`, not
     `"0.022"`.
   Separate cases ensure the first assertion cannot hide the second defect.
4. Add a cross-surface parity test parameterized over the two-cent capability
   and solution. For each, assert that the v2 402 challenge amount is `"21600"`,
   `/x402/catalog` is numeric `0.0216`, manifest and OpenAPI strings are
   `"0.021600"`, and parsing either decimal string to micro-USD yields
   `"21600"`.
5. Extend the existing mocked-facilitator v2 harness. Pin
   `EUR_USD_RATE=1.08` before module import, drive a valid two-cent v2
   verify→settle flow, capture both facilitator calls, and assert:
   - the challenge amount is `"21600"`;
   - `verify` receives requirements with amount `"21600"`;
   - the returned verified handle retains those exact requirements;
   - `settle` receives the same requirements object with amount `"21600"`.
   This observes the actual settlement input without submitting a real payment.
6. Run the two manifest/OpenAPI cases before applying the production fix and
   retain the exact command, base SHA, and both failing assertions. Then apply
   the fix and rerun the focused and repository suites.
7. Write an append-only implementation-verification report under
   `archive/sessions/`. It will state that the historical collision-resolution
   report correctly recorded `drift-open` at its own point in time and that the
   later PR closed the drift. Do not mutate either immutable decision artifact.
8. Enforce byte preservation with both recorded base blobs and a diff guard:
   - decision record blob: `ab54b39f1f43f63825064cdeb0a733ebb1b8cce7`;
   - collision report blob: `26cdda318a066f604dde12cbc868e9512348ce78`;
   - before commit and again at the merge tip run
     `git diff --exit-code 68c93e66237423e3b8d284d528f36950e85291ba HEAD -- <decision-record> <collision-report>`
     and verify both `git rev-parse HEAD:<path>` values still equal the recorded
     blobs.
9. Run the repository `go` skill before the outward transition. Require product,
   technical/money-path, and exact-commit independent reviews; use Claude Opus
   first and founder-authorized Codex fallback only on real provider failure.
10. Push, open a PR, wait for repository and disposable-database CI, and merge.
    First poll `/health` until its `commit` equals the merged SHA. Then wait for
    the existing 60-second catalog and 300-second discovery cache windows and
    verify one live two-cent capability (`csv-clean`, or another catalog row
    whose exact USD value is `0.0216`) across:
    - `/x402/catalog`;
    - `/.well-known/x402.json`;
    - `/openapi.json`;
    - the decoded `PAYMENT-REQUIRED` header from `/x402/v2/:slug`.
    Record that the catalog value is `0.0216`, the two discovery strings are
    `"0.021600"`, and all three convert to the challenge amount `"21600"`.
    Do not submit a payment or trigger production settlement.

## Required verification

- Separate fail-before/pass-after manifest and OpenAPI regressions for both a
  capability and a solution.
- Parameterized capability/solution cross-surface parity test.
- Mocked facilitator verify→settle capture with exact requirement identity.
- Existing x402 gateway conversion tests, including above-one-euro no-cap.
- Existing x402 challenge schema tests.
- Existing x402 catalog route tests.
- API typecheck and relevant lint/static checks.
- MCP server build, because it imports API discovery contracts indirectly.
- `npm run context:test` and `npm run context:check` after adding reports.
- `git diff --check` and clean exact-commit tree.
- Base-SHA diff and blob-ID immutability guard for the protected decision and
  collision report.
- GitHub `check` and `integration-db` jobs.

## Rollout and rollback

- No database migration, environment change, vendor call, or new capability.
- The change only increases decimal precision on two public discovery surfaces;
  it does not alter what a payer is challenged or charged.
- Discovery caches expire within their existing cache windows. Public
  verification should wait for deployment plus cache refresh.
- Rollback is the normal code rollback if a scanner rejects six-decimal strings.
  Charging remains unaffected in either direction.

## Completion criteria

- All five price representations are numerically identical at micro-USD
  precision for both capability and solution fixtures, and the mocked
  facilitator receives the same requirement at verify and settle.
- The active pricing decision has no known implementation drift.
- Immutable historical evidence remains byte-for-byte unchanged.
- All required reviews and CI gates pass, the PR is merged, a handoff and Journal
  entry are created, and every verification session is completed.
