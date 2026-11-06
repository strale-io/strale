Intent: Codex builder brief: phone-validate marks reserved fictional numbers as not valid.

# Brief: reserved fictional phone numbers (phone-validate)

- **Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw), on Petter's instruction of 2026-11-06 to fix what external benchmarks found.
- **Branch:** push only `codex/phone-fictional-ranges`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. All tests run offline.

## Why

An external benchmark sent `+13055550150` to `phone-validate`. We answered valid; the right answer is invalid. In the North American Numbering Plan, line numbers 555-0100 to 555-0199 are reserved for fiction and are never assigned. libphonenumber treats them as valid.

## What to change

1. In `apps/api/src/capabilities/phone-validate.ts`, after parsing, flag NANP numbers whose exchange is 555 and whose line number is 0100–0199, for any area code. That is, E.164 `+1NPA5550100` to `+1NPA5550199`. For those numbers:
   - return `valid: false`;
   - add a stable `reason` field, `"reserved_fictional_range"`, or use the existing reason or warning field if the executor has one;
   - keep every other existing field and the output shape.
2. Keep it data-driven: put the rule in a small table (country, pattern, reason) so that more reserved ranges can be added later. Add only the NANP 555-01XX range now, and add no others without a cited source.
3. In `manifests/phone-validate.yaml`, add one `limitations` entry or note saying that reserved fictional ranges are reported as not valid. Do not change the description beyond that, and do not claim live line checks.

## Tests

Extend the existing phone-validate tests, or add some. Cover:
- `+13055550150` is not valid, with the reason;
- `+13055550100` and `+13055550199` (the boundaries) are not valid;
- `+13055550200` and `+13055550099` are unchanged from today;
- a non-NANP number is unchanged.

The tests must fail without the change.

## Done when

- The phone-validate tests pass and `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first, if typecheck needs them.
- `docs/lanes/codex/phone-fictional-ranges-report.md` lists the files changed, the tests, and anything not done.
