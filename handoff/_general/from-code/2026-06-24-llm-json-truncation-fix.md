# Handoff — readme-generate / price-compare LLM-JSON truncation fix

**Intent:** Fix the `readme-generate` (and related `price-compare`) production 500s surfaced by `/activity`, where the model's JSON output was truncated or followed by trailing prose and the naive parse crashed. Ship it.

**Date:** 2026-06-24
**Mode:** Quick (two-capability bug fix, same family as #145)
**Branch / PR:** `fix/llm-json-truncation` → [PR #146](https://github.com/strale-io/strale/pull/146)

## What happened

`/activity since-last` (window 2026-06-17→24) flagged two real capability bugs under an x402 catalog sweep:
- **`readme-generate`** failed 3/3: "Unterminated string in JSON at position ~7800". A comprehensive README exceeds the hardcoded `max_tokens: 3000`, so the JSON truncated mid-string and `JSON.parse` threw a raw `SyntaxError` → 500.
- **`price-compare`** failed 3/3: "Unexpected non-whitespace character after JSON". The greedy `/\{[\s\S]*\}/` regex over-captured trailing prose that contained a `}`, so `JSON.parse` choked after the first object.

Both are the failure family PR #145 fixed for `prompt-optimize`.

## The fix (PR #146)

New shared helper `apps/api/src/capabilities/lib/llm-json.ts`:
- `parseLlmJsonObject(response, label)` — reports `stop_reason === "max_tokens"` truncation as an actionable (output-neutral) error, extracts the first **balanced** top-level object, and returns a clean error (never a raw `SyntaxError`; attaches the parse error as `{ cause }` for logs).
- `extractFirstJsonObject(text)` — single-pass, **string-literal-aware** brace scanner (ignores braces inside JSON strings, respects escapes), so trailing prose is dropped.

Call-site changes:
- `readme-generate.ts`: `max_tokens` 3000 → **8000** (output size is driven by the generated README, NOT the input — so a fixed generous ceiling, not input-scaled like #145). Parse via helper.
- `price-compare.ts`: `max_tokens` 2000 → **4000** (long offer lists). Parse via helper.

Both ceilings are well under Haiku 4.5's 64K output limit and the ~16K non-streaming HTTP-timeout threshold (confirmed via the `claude-api` skill).

Regression test `llm-json.test.ts` (14 cases) covers both prod failure shapes + brace-in-string, truncated-mid-string-with-braces (exact prod shape), empty/non-text content, and preamble-unbalanced-brace degradation.

## Verification

- tsc clean; `validate-capability` 19/19 (both); `checkReadiness` ready:true 0 issues (both); 14/14 unit tests; `lint:no-bare-catch` clean.
- smoke-test: structural + non-paid steps pass; paid live step blocked by ALLOW_MATRIX (`paid_prepaid` from `internal_test`) — expected, same on `main`, not a regression (same as the #145 handoff noted).
- **Live execution verified out-of-band** (direct executor call, bypassing the cost-guard): both prod repro inputs now succeed — ~12KB READMEs (22/17 sections) where it previously truncated 3/3.
- Six-lens `/go` review: 0 HIGH remaining. Applied: output-neutral truncation message, `{ cause }` on the malformed-JSON rethrow, JSDoc single-block note + a degradation test.

## Follow-ups (deferred, not in this PR)

- **Fleet-wide migration onto `parseLlmJsonObject`.** ~80 capabilities still inline the greedy-regex parse, **including `prompt-optimize.ts` itself** (which has the truncation guard but is still vulnerable to the trailing-prose over-capture). The #145 handoff already flagged this as its own PR; this PR only fixed the two caps with confirmed production failures.
- **`readme-generate` silent input truncation.** `project_description` is silently `.slice(0, 4000)`'d with no caller signal — pre-existing, unrelated to this JSON bug. Candidate for the migration PR (mirror `prompt-optimize`'s explicit-reject pattern).

## State at handoff

PR #146 open against `main`; merge on green CI. Railway auto-deploys from `main` on merge; the fix goes live then. Pre-existing untracked working-tree files (`.agents/`, `AGENTS.md`, `audit-output/`, `handoff/_general/from-code/*`) were left untouched — only the four fix files were staged.
