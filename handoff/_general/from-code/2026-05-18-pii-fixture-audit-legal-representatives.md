Intent: Sweep apps/api/tests/fixtures/tier-coverage/ for unredacted PII in legal_representatives + the full PII_ARRAY_FIELDS set following the 2026-05-18 CZ pre-commit near-miss (7 Skoda board members caught before PR #137 landed). Verify capture-tier-fixtures.ts scrubber covers the field and that git history never leaked real PII through the directory.

## Outcome

- **All clean within scope.** 33 tier-coverage fixtures swept. 8 carry PII_ARRAY_FIELDS keys (br/cz/fr/gr/it/jp/no/sk); all show `"[REDACTED]"`, `null`, or `[]`. Other 25 carry no PII-array keys.
- **Git history clean.** Zero commits ever pushed unredacted PII through `apps/api/tests/fixtures/tier-coverage/`. The PR #125/#136/#137 inline pattern (add field to PII_ARRAY_FIELDS during the capture that surfaced it) caught the GDPR exposure pre-commit.
- **PR opened.** https://github.com/strale-io/strale/pull/138 (chore/pii-fixture-audit-legal-representatives). Single-file diff: the audit report at `audit-output/pii-fixture-audit-legal-representatives-2026-05-18.md`.

## Open

- **PR #138 awaits Petter review/merge** — audit-only, no code changes.
- **Notion to-do `36467c87-082c-8117-8053-cb47e30a2c9f`** — close after merge.
- **Out-of-scope follow-up surfaced by /go six-lens review (the substantive finding):** two manifest `output_schema.example` blocks carry real natural-person names — same class of PII the CZ near-miss surfaced:
  - `manifests/french-company-data.yaml:30-33` — three real TotalEnergies SE board members (JACQUES ANDRE ASCHENBROICH, MARIE CHRISTINE COISNE, LISE CROTEAU) in `directors`.
  - `manifests/brazilian-company-data.yaml:30-32` — one real partner (CLAUDIA KICH DA SILVA, 16-Presidente) in `partners`.
  - These were never passed through `scrubFixture()` — manifests are hand-authored and `PII_ARRAY_FIELDS` only runs at capture time on executor output. Flagged in PR #138 body; recommend a separate remediation to-do.

## Non-obvious learnings

- **Scrubber is shallow + type-lying.** `scrubFixture()` iterates `Object.entries(output)` — top-level keys only. Nested PII arrays (e.g. `{ company: { directors: [...] } }`) would not be scrubbed. Also: the scrubber replaces a populated `T[]` with the literal string `"[REDACTED]"`, which `check-tier-coverage.mjs` accepts as populated but any future fixture-typed consumer (replay harness, type generator) must skip or cast for PII_ARRAY_FIELDS keys. Pre-existing design trade-off, now documented in the audit doc's Step 1 caveats.
- **Audit methodology gap (worth knowing for future PII sweeps):** the git-history grep `git log -p --all ... | grep '^\+'` only catches additions, not removals. An added-then-reverted commit would be invisible. Conclusion still defensible for the CZ incident because the pre-commit catch meant the unredacted fixture never reached `git commit` — there's no SHA where it landed.
- **Audit-scope discipline matters.** The audit's narrow scope (tier-coverage fixtures) intentionally excluded `manifests/` and similar PII-bearing surfaces. The /go six-lens reviewer surfacing the manifest exposure is exactly the gain pattern documented in `feedback_session_end_review_gate` — a second pass catches what the scoped sweep was structurally blind to.
- **Working-tree hygiene:** branch started in detached HEAD on stale commit (f618870) with three handoff files marked untracked but already tracked-identical in origin/main. Resolved by removing the conflicting untracked copies (hash-verified identical to origin/main blobs) before checking out a fresh branch off origin/main. The `.agents/`, `AGENTS.md`, prior `audit-output/` files, and three handoff files remain untracked and pre-existed this session — none staged into PR #138.

## Cost

Trivial. Single Sonnet review subagent x2 parallel + Opus orchestrator. No external API calls; no fixture re-captures.

## References

- PR: https://github.com/strale-io/strale/pull/138
- Audit doc: `audit-output/pii-fixture-audit-legal-representatives-2026-05-18.md`
- Capture script: `apps/api/scripts/capture-tier-fixtures.ts:81-120`
- Tier-coverage gate: `apps/api/scripts/check-tier-coverage.mjs`
- Trigger PRs: #136 (NO `legal_representatives`), #137 (CZ `legal_representatives`)
- Six-lens precedent: PR #125 (`/go` skill caught a similar PII pattern 2026-05-17)
