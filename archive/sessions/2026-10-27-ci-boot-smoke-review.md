# H2 CI boot-smoke independent review

Technical: GO on the uncommitted diff based at b4505794, rounds: 2.
Operational: GO with local verification limitations, round: 1.

Both independent read-only reviewers read REVIEW.md. Findings addressed:

- Missing/empty captured tier fixtures could pass; now rejected.
- Test-only capability sources could satisfy the pre-filter input count; the effective runtime set is now required.
- Identity and cost checks could scan zero matching records; required effective counts added.
- Manifest consistency now requires parsed records while explicitly allowing zero guaranteed fields.
- PII must allow absent ignored scratch on clean CI; tracked scan roots remain required, with a regression for the distinction.
- Empty-input CLI coverage expanded across scripts and filtered subgroups.

Both reviewers ran the boot-probe tests and diff whitespace validation successfully. The technical reviewer confirmation-read the PII fix. No remaining technical or operational finding was reported. Neither reviewer certified a real database or image boot: Postgres user switching and Docker are unavailable locally. CI must supply that evidence before merge.

Verification counts and initial-failure resolutions are recorded in [the receipt](../receipts/2026-10-27-test-run-ci-boot-smoke.json). The [handoff](../../handoff/_general/from-code/2026-10-27-ci-boot-smoke.md) contains the full gate inventory and remaining Actions verification.

## Round 2

Fresh read-only technical and operational review of the uncommitted Round 2 changes, based at b4505794. Reviewer read REVIEW.md. One blocking finding was raised and fixed: a false job-level condition on required `check` could produce a successful skipped check after smoke failure. `check` now uses `always()` and executes a mandatory shell guard before all other steps. Confirmation review executed the actual guard through the eleven-case workflow truth table and confirmed docs-only skips pass while failed/cancelled smoke and failed classification fail. Probe tests and actionlint also passed. No further code findings. Manual simplify review found no shared helper in block 0125 to reuse; its historical body was preserved.

Verdict: code GO; operational acceptance remains conditional on real Postgres 16/dist boot, Docker image execution and egress evidence. This sandbox cannot change to the postgres UID and has no Docker socket, so neither review nor author claims those checks passed. The orchestrator retains final review and shipping responsibility; no commit, push or PR was made.
