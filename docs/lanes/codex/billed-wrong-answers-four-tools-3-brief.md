Intent: Codex builder brief: final review fix for billed-wrong-answers-four-tools (round 3).

# Brief: billed-wrong-answers-four-tools final fix

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-15.
  - This follows an independent review of `codex/billed-wrong-answers-four-tools-2` at 48a77e23, which ran the full code test suite.
  - The verdict was NO-GO on one item. Everything else in both earlier briefs was confirmed done.
- **This is the last run in this family.** Keep the change to exactly what is below.
- **Branch:** push only `codex/billed-wrong-answers-four-tools-3`. It starts from `codex/billed-wrong-answers-four-tools-2`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. All tests run offline.

## Fix these

1. **The GB refusal fails a repo-wide test (blocking).**
   - **What fails:** `apps/api/src/lib/actionable-errors-round2.test.ts`, the test "eori-validate.ts:145 fix names its field and accepted format". It checks every `inputRefusal(...)` call in `apps/api/src/capabilities/*.ts`. The third argument, the fix text, must:
     - start with "Send ";
     - contain `'eori'`;
     - end with a period;
     - quote only lowercase words that are `input_schema` properties in the capability's manifest.
   - **The fix:** in `apps/api/src/capabilities/eori-validate.ts`, change only the third argument of the GB `inputRefusal` call to exactly:
     `"Send 'eori' with an EU member-state or XI prefix; check GB numbers with HMRC's 'Check an EORI number' service at https://www.gov.uk/check-eori-number."`
   - Leave the first two arguments unchanged.
2. **One doc comment is stale (low).**
   - **Where:** `apps/api/src/capabilities/startup-domain-check.ts`, the comment above `isDomainAvailable`. It still says "True only on NXDOMAIN (ENOTFOUND): no such name exists."
   - **The fix:** reword it to say:
     - NXDOMAIN counts as available only when RDAP answers `not_found`;
     - RDAP `found` or `no_registration_event` means registered, with no DNS;
     - a missing RDAP base or a failed lookup throws `RdapUnavailableError`, and the caller reports that domain as `null`.
   - This is a comment-only change.

## Leave the rest alone

Make no other change. Leave every test, manifest, executor and config file as it is, apart from the two items above.

## Verification to run

- **Build first:** `npm --workspace=packages/sdk-typescript run build` and `npm --workspace=packages/mcp-server run build`. Without the MCP build, two unrelated MCP 429 tests fail locally.
- **Full code suite:** `npm --workspace=apps/api run test:code`. It must show 0 failed. Report the counts.
- **Upstream-catch lint:** `npm --workspace=apps/api run lint:upstream-catches -- --base $(git merge-base origin/main HEAD)`.
- **Other checks:** `npm run typecheck`, `npm run env:check`, `npm run claims:check` and `npm run models:check`.

## Report

Write `docs/lanes/codex/billed-wrong-answers-four-tools-3-report.md` with:
- the files changed;
- the verification commands and their results, including the full-suite counts;
- anything not done, and why.
