Intent: investigate the "SQS 0 / Price unavailable" empty fallback card Petter spotted on strale.dev/capabilities/vat-validate, fix the immediate bug + the broader class it represents (cross-repo type drift in trust-endpoint normalizers), and use the "low usage" window to do as much structural prevention as possible before volumes grow.

# Outcome — vat-validate fixed; trust-endpoint wire shape now cents-canonical; Layer 2 generalised; dispute loop closed

## Immediate bug — vat-validate empty fallback card

**Root cause** (verified against live wire + source files): three contracts for the same concept, nothing pinning them together.

- Backend service (`execution-guidance.ts`): emits `fallback_capability` / `fallback_sqs` / `fallback_price_cents`
- Route serializer (`internal-trust.ts:formatGuidanceForResponse`): renamed `fallback_price_cents: 2` → `fallback_price: "€0.02"` (formatted string, integer dropped)
- Frontend normalizer (`api.ts:normalizeExecutionGuidance`): read `slug` / `name` / `quality_score` / `price_cents` — none of which existed on the wire shape

Every read fell to its `?? 0` / `?? ""` default → empty card rendered as "SQS 0 / Price unavailable" on every capability page with a configured fallback. Confirmed against `eori-validate` (same broken render). The diagnosis Petter pasted at the start of the session was correct on every point; verified independently against live wire + source.

**Three other dropped fields in the same normalizer**:
- `cost_envelope.worst_case_with_retries` silently dropped
- `cost_envelope.fallback_price` silently dropped
- `execution_guidance.config` (`max_attempts`, `base_delay_ms`) never normalized

## Fix — backend (commit `1ba75dd`)

The wire shape now carries integer cents only, never pre-formatted currency strings. Removed:
- `if_strategy_fails.fallback_price` (string) → replaced by `fallback_price_cents` (integer)
- `cost_envelope.{primary_price, worst_case_with_retries, fallback_price}` (strings) → all replaced by `*_cents` integers
- The `formatPrice` helper itself — display formatting is the consumer's responsibility

Plus: `if_strategy_fails` now carries `fallback_capability_name` (looked up alongside the slug) so the frontend doesn't need a second round-trip to resolve the display name.

Petter's call: "low usage now, change while we can" — drop the lossy strings entirely rather than maintain a deprecated lossy field forever.

## Fix — frontend (commit `8df95de`)

`normalizeExecutionGuidance` rewritten to read the actual wire field names (`fallback_capability` / `fallback_capability_name` / `fallback_coverage` / `fallback_sqs` / `fallback_price_cents` / `fallback_verification_level`). Defensive add: when `fallback_capability` is empty/null, the whole `fallback` object is `null` so the UI's `{guidance.fallback && ...}` guard hides the card cleanly. Empty data must not render as "SQS 0".

`cost.fallback_price_cents` and `cost.worst_case_with_retries_cents` now populated. `config.{max_attempts, base_delay_ms}` passed through. Regex currency parser removed — the wire shape carries `primary_price_cents` directly.

`mergeTrustResponse` helper extracts the duplicated "build trust_summary from flat API fields" block (was at `api.ts:340-342` and `534-536`, near-byte-identical). Both `fetchSolutionTrust` and `fetchCapabilityTrust` call it now. The next bug here would have been fixing one and forgetting the other.

`normalizeQualityProfile` and `normalizeReliabilityProfile` got clarifying comments explaining the `score → rate` (pass-rate semantic) vs `score → value` (score-with-detail semantic) rename — same source field, different output names by design.

## Structural prevention

**Layer 2 generalised** (`apps/api/scripts/check-shape-contracts.mjs`, replacing `check-audit-record-shape.mjs`). Now a registry-driven script that handles a list of `(interface_name, backend_file, frontend_file)` contracts. Currently registers `AuditRecord`. Future shared interfaces register here. CI + weekly cron both updated. Run with `--list` to see registered contracts. Docstring distinguishes when this pattern fits (same-named interface on both sides) from when it doesn't (wire-shape ↔ consumer-shape — use a contract test for those).

**Frontend contract test** (`strale-frontend/src/lib/api.contract.test.ts` + `__fixtures__/trust-vat-validate.json`). 4-test battery against a frozen fixture of the actual wire response. Asserts the original failure mode would now fail loudly: `fallback.capability_slug === "vat-format-validate"`, `fallback.price_cents > 0`, `cost.fallback_price_cents > 0`, `config.max_attempts === 3`. Test file's docstring includes the curl command to regenerate the fixture when the wire shape legitimately changes.

**CLAUDE.md updates** — new "Wire-shape rule for /v1/public/ops/trust/* endpoints" section: cents canonical, no lossy formatted strings, additive `*_formatted` fields when a pre-rendered display value is needed. Pointer to the contract-test pattern for wire-shape ↔ consumer-shape cases.

## Lossy-formatter audit (commit `24acf40`)

Grepped every `formatPrice` / `.toFixed(2)` / formatted-currency pattern in the codebase. Two categories:
- Legitimate display strings (~20 hits): error response messages, email body strings, log lines, `notes` arrays, the seo-audit ratio (number, not string).
- One that looks suspect but isn't: `/.well-known/x402.json`'s `price: cap.x402PriceUsd.toFixed(2)`. The x402 protocol spec REQUIRES the string format (USDC is 6-decimal-precision, not integer cents) and pairs it with a `currency` field for unambiguous parsing. Documented inline so a future reviewer doesn't try to "fix" it and break facilitator compliance.

The trust endpoint was the only real instance of the anti-pattern.

## Dispute notification email (commit `24acf40`)

`POST /v1/transactions/:id/dispute` now fires a `sendAlert` (severity: `warning`) to `ALERT_RECIPIENTS` with the full context: dispute ID, transaction ID, capability slug, submitter context (account user vs anonymous), contact email, affected field, full reason text, pre-computed 30-day Art. 22(3) deadline. Fire-and-forget so a Resend outage doesn't fail the dispute submission.

The capability slug is now joined onto the dispute lookup (so the alert subject says "Dispute received — vat-validate (txn 8a3b...)" rather than just a transaction id). The previous `void capabilities;` import-suppress shim is obsolete and removed.

## Two-endpoint stitching pattern (capability detail page)

Investigated. The split (`/v1/capabilities` for the lightweight catalogue, `/v1/public/ops/trust/capabilities/:slug` for heavy trust data) is legitimate — merging would make every list-page request pay for trust data. The seam *was* where the bug lived, but the contract test now catches that exact regression class. Not worth a refactor.

## Production state

- Backend: 4 commits this session, all on main, all pushed
  - `1ba75dd` trust-endpoint cents-canonical + Layer 2 generalised
  - `24acf40` dispute notification email + x402 manifest defensive comment
- Frontend: 1 commit this session
  - `8df95de` normalizer rewrite + dedup builder + contract test
- 407 backend tests + 4 frontend contract tests passing
- AuditRecord shape contract holds (Layer 2 clean)
- The frontend's `__fixtures__/trust-vat-validate.json` reflects the *new* wire shape my backend changes produce. Once Railway redeploys (auto-triggered by the push), the live wire matches the fixture.

## Open — explicitly deferred

1. **Admin review surface for `dispute_requests`** — web UI for triaging incoming disputes (~2-3h). Today: dispute_id stored + email alert + DB query for triage. Reasonable v1 posture.
2. **Frontend "Contest this result" link rendering** on AuditRecord page when `gdpr.art_22_classification ≠ data_lookup` — type field is in place; needs UI design (Lovable territory).
3. **Shared types package (`packages/api-types`)** — explicitly NOT doing per the cost-benefit analysis; the grep + frozen-fixture combo gets 80% of the value at 5% of the cost. Worth revisiting if we keep adding cross-repo response shapes.

## Non-obvious learnings

- **The lossy-formatter pattern is contagious by default.** Every place a backend pre-formats a price/score/anything-formattable into a string and drops the underlying integer is a place where the consumer has to either regex-parse the string or read a fictitious `*_cents` field that defaults to 0. The wire-shape rule (cents canonical, no formatted strings) prevents the entire class.

- **The Layer 2 shape-check pattern only catches "same-named interface drift"**, not "wire-shape ↔ consumer-shape field-name mismatch". Those need a contract test with a frozen fixture. Both seams are now covered explicitly. The script docstring distinguishes the two cases so the next session doesn't try to extend the shape-check into the wrong territory.

- **The two-endpoint stitching pattern is not the root cause** even though the bug lived at the seam. The root cause is the lossy formatter + the field-name mismatch. Fixing those at the source removes the failure mode regardless of whether you stitch one or two endpoints.

- **Anthropic's `/v1/models` API only publishes the alias for Sonnet 4.6** (no dated snapshot, despite Sonnet 4 and 4.5 having dated snapshots). Confirmed against the prod ANTHROPIC_API_KEY. Setting `RISK_NARRATIVE_MODEL` to a fabricated snapshot would 404 every call. Y-10 instrumentation captures `provenance.model_resolved` per call so audit replay still works on the alias today; pin once Anthropic publishes a dated snapshot.

- **The `void capabilities;` import-suppress shim** was added when the dispute route imported the table for a future use that hadn't materialised. The lossy-formatter audit forced the join (capability slug for the alert subject) which made the shim obsolete. Worth checking other "future-use" suppressions when the surrounding code changes.

## Cost

Zero external API spend this session — all changes were code, no migrations, no DB schema changes (beyond what was shipped earlier in the prior session). Commits are no-config-change deploys; Railway auto-redeploys from main.
