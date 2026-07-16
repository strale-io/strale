Intent: Ship a fourth structural CI gate (`check-tier-coverage.mjs`) Phase 1 WARN-ONLY that compares captured response fixtures against manifest declarations, then close the first round of manifest-drift findings it surfaced.

## Outcome

Three pieces of work landed across two PRs:

### PR #125 — the gate itself (merged 2026-05-17T08:40:28Z, commit `1888b0c`)

Files shipped:
- `apps/api/scripts/check-tier-coverage.mjs` — gate that compares fixtures vs manifest declarations; surfaces GUARANTEED_EMPTY, UNDECLARED_RELIABILITY, UNDECLARED_SCHEMA findings; Phase 1 always exits 0
- `apps/api/scripts/capture-tier-fixtures.ts` — live-capture helper with `scrubFixture()` (PII array fields → `"[REDACTED]"`, ephemeral timestamps → `"[CAPTURE_TIMESTAMP]"`)
- `apps/api/tests/fixtures/tier-coverage/` — 31 captured fixtures (then 33 after follow-up)
- `apps/api/scripts/tier-coverage-allowlist.txt` — grandfathered findings for Phase 2 promotion path
- `.github/workflows/ci.yml` — wired the gate after `check-manifest-guaranteed-consistency.mjs`

Initial capture pass cost ~€1.56 for the 11 Openapi-routed countries; free for the 19 direct registries.

### PR #125 follow-up commit `4ff8fdd` — HR/CH/UK fixtures

Used `railway run` to inject prod env vars + targeted `--slug croatian-company-data,swiss-company-data,uk-company-data`. All 3 captured cleanly. Allowlist grew 8 → 10 (CH + UK added for the 4 new UNDECLARED findings these fixtures exposed). HR clean.

Resolved the "6th capability" mystery: it's `australian-company-data` (intentionally deactivated 2026-04-29 per DEC-20260428-A as Tier-1-violating duplicate of `au-company-data`). NOT a credential gap. There is no second UK capability.

### PR #126 — manifest-drift cleanup (merged 2026-05-17T08:48:17Z, commit `cb305b0`)

Additive declarations following FI commit `64d8a30` pattern:
- `swiss-company-data.legal_form_id`: guaranteed / integer
- `uk-company-data.jurisdiction`: guaranteed / string|null
- `uk-company-data.sic_codes`: common / array of string
- `uk-company-data.has_charges`: guaranteed / boolean

Tier-coverage WARN baseline dropped 12 → 9 findings; allowlist trimmed 10 → 8 (both CH + UK removed).

## Open

Out of scope for this session, explicit follow-ups:
- `german-company-data` fixture — OpenRegister 402 paid-feature wall, subscription decision pending
- `danish-company-data` fixture — cvrapi.dk free-tier transient quota, resolves on reset
- `canadian-company-data` fixture — dropped from PR #125 (executor returns mostly-null for the health-check input); needs a separate fix-the-executor PR before its fixture can be re-added
- Remaining 8 grandfathered slugs in `tier-coverage-allowlist.txt` (brazilian, estonian, french, japanese, norwegian, polish, swedish, us) — each represents real manifest-drift candidates. Same `64d8a30`-pattern fix possible per slug. No urgency since gate is WARN-only.
- Phase 2 STRICT promotion — mechanical 2-line change: flip `process.exit(0)` to `if (strict && newFindings.length > 0) process.exit(1);` and add `--strict` to ci.yml invocation. Should happen after the remaining 8 slugs are either fixed or formally accepted as long-lived allowlist entries.

## Non-obvious learnings

- **/go six-lens review caught a CRITICAL PII issue** that I'd have shipped: the initial fixture capture committed real director names + maiden names (ENGIE board, Petrobras board, Slovak SME at company called SEXES). Solo founder reviewing PRs alone won't catch GDPR-class concerns in JSON fixtures — the automated reviewer agent did. Added `PII_ARRAY_FIELDS` scrubber as part of the same PR.
- **The gate's UNDECLARED grouping by slug**: UK had 3 missing-from-reliability fields but counted as 1 finding line (slug-grouped). PR #126 expected to drop 12→8 but actual was 12→9 because of this. Worth knowing for future "what does N findings really mean" questions.
- **Railway CLI worked smoothly** for injecting prod env into local capture scripts (`railway run -- npx tsx ...`). Avoided having to paste secrets into local .env. Petter has Railway logged in as `petter@strale.io`, project=Strale, env=production, service=strale.
- **`gh run watch --exit-status` quirk** (from prior session memory `feedback_gh_run_watch_exit_status_unreliable.md`) confirmed again: re-verified each CI run with `gh run view --json conclusion` after the watcher returned. Both reads returned `success` so the quirk didn't bite this time.
- **/go skill's /simplify step** doesn't exist in this repo's `.claude/skills/` (only `go` and `vendor-switch`). Skipped during /go invocation; noted in PR #125 report.

## Cost

- ~€1.56 — initial PR #125 capture pass (11 Openapi-routed countries at ~€0.14/call)
- ~€0.50 — re-capture after PII scrub fix (same 11 countries, second call within same session; Openapi token cache may have absorbed some)
- ~€0 — PR #125 follow-up HR/CH/UK capture (HR Sudreg free-tier, CH Zefix free with creds, UK Companies House free)
- ~€0 — PR #126 (manifest-only edits)

Total Openapi spend this session: ~€2.00. No other paid-API spend.

## Notion canonical surface implications

Customer-facing CH + UK capability docs (OpenAPI/MCP/A2A) refresh on next deploy with the 4 new declared fields. Provider-Coverage Matrix tier counts for CH + UK may need micro-adjustment if the 4 fields land in a Tier 1/2/3 canonical framework — chat-side post-merge if so.
