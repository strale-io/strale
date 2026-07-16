# Handoff — prompt-optimize truncation fix

**Intent:** Fix the `prompt-optimize` capability bug surfaced by `/activity` (6 production x402 failures) and ship it.

**Date:** 2026-06-17
**Mode:** Quick (single-capability bug fix)
**Branch / PR:** `fix/prompt-optimize-truncation` → [PR #145](https://github.com/strale-io/strale/pull/145)

## What happened

Ran `/activity since-last` (window 2026-06-08 → 2026-06-17): 525 external calls, mostly an x402 catalog sweep. Two real signals:
1. **`prompt-optimize` failing in production** — 6 calls from a "Jobright" content-generation pipeline (Agent1→Agent2 lanes) erroring with `Unterminated string in JSON`.
2. The 17 `no_matching_capability` logs were **not real gaps** — almost all from a competitor agent-marketplace experiment ("Arbor" / `tryarbor.vercel.app` / repo `Imhaohao/miyohacks`, pinging from `agentdex.dev`) forwarding generic LLM "bid request" prompts at `/v1/do`. Only genuine signals: no flight-search capability exists, and the keyword matcher is brittle when a real task (USD→CHF conversion) is buried in a large context envelope. Both backlog-only, not urgent.

## The fix (PR #145)

Root cause: `prompt-optimize` asks Claude to echo the full improved prompt back inside a JSON envelope (output ≈ input), but `max_tokens` was hardcoded at 1500 → any prompt over ~1KB truncated mid-string → `JSON.parse` crashed.

Changes to `apps/api/src/capabilities/prompt-optimize.ts`:
- Scale `max_tokens` to estimated input size (floor 1500, ceiling `MAX_OUTPUT_TOKENS = 8000`).
- Reject inputs > `MAX_PROMPT_CHARS = 18000` upfront, before the paid API call. Limit is *derived from* the 8000-token ceiling so accepting a prompt implies it can be optimized in one pass (no silent truncation at the top of the range).
- Detect `stop_reason === "max_tokens"` → actionable error instead of a parser crash.
- Guard `r.content[0]` access; unify the two malformed-output paths into one consistent retryable message.

## Verification

- tsc clean; `validate-capability` 19/19; `checkReadiness` → `ready: true`, 0 issues.
- smoke-test: structural pass; live step blocked by ALLOW_MATRIX (paid cap from `internal_test`) — same on `main`, not a regression. Verified live execution out-of-band: 20000-char input rejects pre-call; ~16.7KB prompt optimizes in one pass; normal prompt returns full JSON.
- `/go` six-lens review: 0 HIGH. 4 MEDIUM all fixed in-branch (unsafe content access; char-limit↔ceiling inconsistency; unified error messages; reworded truncation error).

## Follow-ups (deferred, not in this PR)

- **Shared `parseJsonEnvelope` helper.** Altitude lens found ~80 caps inline the same `JSON.parse(match)` pattern, and **8 output-proportional caps carry the identical latent truncation bug**: `translate`, `summarize`, `code-convert`, `pii-redact`, `web-extract`, `pdf-extract`, `image-to-text`, `prompt-compress` (the last already grew the guard by hand). A shared helper that checks `stop_reason`, extracts `{...}`, and try/catches the parse would retire the bug fleet-wide. Migrating ~80 sites is its own PR.
- **Matcher robustness** — real tasks buried in large context envelopes return `no_matching_capability` (Arbor traffic). Low priority unless that traffic grows.
- **Flight search/comparison** — unserved capability (only `flight-status` exists). Bot-protected scraping territory; backlog.

## State at handoff

PR #145 open against `main`; merging on green CI. Once merged, Railway auto-deploys from `main` and the fix goes live.
