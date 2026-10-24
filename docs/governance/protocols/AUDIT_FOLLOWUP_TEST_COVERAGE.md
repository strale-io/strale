---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Audit-Follow-up Test Coverage Protocol (DEC-20260504-A)"
moved_at: 2026-10-24
---

# Audit-Follow-up Test Coverage Protocol (DEC-20260504-A)

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

**MANDATORY — applies to ANY commit that introduces or substantially modifies a code path in response to a cert-audit finding (Y-, A-, B-, RED-, MED-, CRIT-, F-AUDIT- numbered findings).**

**Trigger:** the commit message references a cert-audit finding code, OR the change adds/modifies a function that runs inside a wallet transaction, an audit-trail builder, a chain-integrity primitive, a spend-cap check, an idempotency check, or any other money/compliance-critical path.

**Background:** PR #43 (2026-05-04) fixed a Date-in-sql-template encoding bug in `spendCapWouldExceed` that shipped as part of cert-audit A-7 (commit `6613bd7`, 2026-04-30). The same audit batch shipped a structurally identical bug in `db-retention.ts` (commit `968bc82`); together they had been silently 500-ing paid `/v1/do` calls for capped users for 4 days and silently failing all retention pruning. Neither had test coverage. The audit pattern was producing new code paths without tests, and the bugs slipped past *because* the audit reviewers focused on the architectural correctness of the fix and not on its bind-encoder shape.

**Required steps (non-negotiable):**

1. **Every cert-audit follow-up commit that introduces a new code path must include at least one regression test** that exercises the new path. The test does not need to be a full integration test — a unit test that captures the structural shape of the fix (e.g. "no Date instance reaches `tx.execute(sql\`\`)` queryChunks") is sufficient.
2. **The test must fail against the un-applied fix and pass against the applied fix.** Verify both directions during PR review. A test that passes regardless of the fix is not a regression test.
3. **If the new path runs DB writes, the test must assert on the bind-parameter shape** — specifically, walk every `tx.execute(sql\`\`)` and `db.execute(sql\`\`)` call and verify no parameter is a `Date`, `Buffer`, or other shape postgres-js's encoder cannot serialize. The PR-43 incident is the case study here.
4. **For commits that touch error-swallowing catch blocks**, the test must include a "swallow visibility" assertion: when the swallowed error fires, the surrounding summary log must surface the failure (not silently report `total: 0` or similar). The `db-retention.ts` fix is the case study — pre-fix every tick logged "pruned successfully" while every rule errored.

**At session end, report:**
- Every cert-audit-finding-numbered commit landed in this session, with the test name(s) covering it.
- Anything that landed without a test, and the explicit reason (e.g. "no test harness for /v1/do route-level integration; deferred per CLAUDE.md test-harness exemption").

**Do NOT mark a cert-audit follow-up as done if the regression test gap is open.** Report what's missing.

**This rule does NOT override:**
- The Capability Onboarding Protocol (DEC-20260320-B).
- The Distribution PR Integrity Protocol (DEC-20260422-A).

**Test-harness exemption:** if the relevant test harness doesn't exist in the repo (e.g. route-level integration testing for `/v1/do` requires a Postgres-backed harness that hasn't been built), the commit may ship with a unit-level regression test that captures the structural shape of the bug, plus an explicit reference to the missing harness in the PR description and Journal entry. The exemption does not apply to cases where the harness exists and the author skipped writing a test.
