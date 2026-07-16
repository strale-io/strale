Intent: Resolve the DEC-20260518-D capability-state vs jurisdictional-state mismatch left by PR #131's labeling sweep for UK + DK `ubo_availability` flags. Either activate the integration end-to-end (Path A: GREEN) or flip the flag to honest unavailable (Path R/RED).

## Outcome — PR #132 merged

Per-country (static analysis only; live smoke flagged as v1.0 pre-launch follow-up):

- **UK: GREEN.** `apps/api/src/capabilities/beneficial-ownership-lookup.ts` has a working Companies House PSC integration; the UK Counterparty Assurance solution bundle (`seed-solutions.ts:1792-1797`) calls it as step 2 with `jurisdiction: $input.country_code`; it returns populated `beneficial_owners[]` on real PSC data. Refined the `ubo_availability_reason` on `uk-company-data.ts:150` to customer-friendly language ("Beneficial ownership data available via UK PSC register."). Lifted `apps/api/coverage-matrix/beneficial-ownership-lookup__uk__beneficial-ownership.yaml` from `Committed → Live`, with `sourcing_pattern: Free open data → Direct API` and `last_verified: 2026-05-18`. Regenerated COVERAGE.md.

- **DK: RED.** `beneficial-ownership-lookup.ts:37-54` explicitly rejects all non-UK jurisdictions and returns `supported_jurisdiction: false`. Grep confirmed: no DK→UBO call path exists anywhere in the codebase. cvrapi.dk (the upstream for `danish-company-data`) does not expose UBO data. The PR #131 reason string itself admitted "handler integration pending; flag reflects jurisdictional availability" — the exact DEC-20260518-D violation. Flipped `danish-company-data.ts:151-152` from `ubo_availability: available` → `unavailable_no_registry` with reason: "Danish beneficial ownership data integration in progress; coverage in v1.1." DK YAML unchanged — already `Committed`, correct pre-integration state.

CI: `validate` + `check` both pass (after a COVERAGE.md regeneration fixup pushed as a follow-up commit). PR squashed-merged, branch deleted, HEAD on `main`. Full audit-trail in `audit-output/ubo-activation-uk-dk-2026-05-18.md` (in repo).

## What's open

Three follow-ups flagged in the audit-output file and PR description — chat-side filing required (this CC session does not have Notion MCP write access):

1. **v1.1 — ship DK UBO integration.** Add a DK branch to `beneficial-ownership-lookup.ts` consuming either datacvr.virk.dk system-to-system access (separately queued for identity data, can ride along) or OpenOwnership BODS DK extracts (the YAML's stated plan). On ship: flip `danish-company-data.ts` `ubo_availability` back to `available` with customer-friendly reason, and lift `beneficial-ownership-lookup__dk__beneficial-ownership.yaml` from `Committed → Live`.

2. **v1.0 pre-launch — live UK UBO smoke test.** Run a real Counterparty Assurance call against a known-good UK entity (Companies House `00006245` / BP P.L.C. is a safe choice) and confirm the response carries a populated `beneficial_owners[]` and that the `ubo_availability: available` flag is internally consistent with the array. This PR's UK conclusion is static-analysis only.

3. **v1.1 consideration — add `integration_pending` to the `ubo_availability` enum.** Current enum (`available`, `restricted`, `unavailable_no_registry`) has no precise bucket for "register exists in this jurisdiction but Strale has not yet integrated." DK currently lives in this gap and is labeled `unavailable_no_registry` as a least-bad match. A dedicated value would improve customer-facing honesty.

## Non-obvious learnings

- **PR #131's labeling sweep set UK + DK to `available` on jurisdictional grounds, not capability grounds.** The DK case was self-incriminating — the reason string literally said "handler integration pending; flag reflects jurisdictional availability." This is exactly the failure mode DEC-20260518-D was written to prevent: a flag that reads "available" while the response carries `ubo: []` empty is worse than honest "unavailable." Future labeling sweeps should encode the DEC-20260518-D rule in the gate (a reason string containing "pending" or "jurisdictional" alongside `available` should fail validation).

- **UK has two YAML rows for the same evidence type.** `uk-company-data__uk__beneficial-ownership.yaml` (Live since 2026-04-20 — PSC fields embedded in Companies House identity response) and `beneficial-ownership-lookup__uk__beneficial-ownership.yaml` (was Committed, now Live — standalone BO capability with deeper PSC extraction). Per DEC-20260517-A primary-key disambiguation, this is intentional — two capabilities, one evidence type, both can serve a CA call. The Live YAML on the identity slug had already been correct; only the standalone-capability YAML needed lifting.

- **`unavailable_no_registry` is being overloaded.** It currently means both (a) the jurisdiction has no public BO register at all, and (b) the jurisdiction has one but Strale hasn't integrated it. These are distinct customer-facing meanings; conflating them costs explainability. Adding a third enum value is a small fix that pays back.

## Cost

Zero external calls. Zero billable API consumption. Static-analysis path only — no Railway prod queries, no Companies House calls.

## Session-close warnings (all pre-existing, not introduced)

- 1 uncommitted handoff file from PR #131 work (`2026-05-18-evidence-tier-labeling-sweep-pr-131.md`, age 0h) — that's the PR #131 author's commit, not this session's.
- 11 executors added to filesystem in PR #131 without active DB row (Austria, Bulgaria, Cyprus, etc.) — these are the deactivated EU registries from earlier sweeps; expected per the DEACTIVATED list semantics.
- `us-company-data-cobalt` still in `lifecycle=validating` (never tested) — pre-existing.
