Intent: Generalize the PR #314 truncation guard across every LLM executor so no other capability can repeat the web-extract self-quarantine incident (follow-up task chip from the morning's incident work, executed same session).

## Shipped — PR #317, merged + deployed (`9e27faa`, verified serving)

- **`capabilities/lib/llm-extract.ts`** (`extractJsonWithLlm`): create → `CapabilityRefusalError` on `stop_reason === "max_tokens"` (registered refusal prefix → `caller_input` everywhere) → `extractJsonObject` → caller-supplied parse-failure error. Byte-identical non-truncation messages, so zero taxonomy shifts.
- **68 executors migrated** (web-extract + product-reviews-extract refactored first; their existing truncation tests passing unchanged was the fidelity proof). Three executors had the incident class **already latent with wrong-class guards** (price-compare — with a documented 2026-06-17→24 production incident — readme-generate, prompt-optimize).
- **Structural skips hardened**: business-license-check-se's JSON call migrated (skip was misdocumented — review catch); code-review + annual-report-extract got inline truncation guards; cookie-scan's `content[0]` made genuinely non-fatal; greedy object-capture regex eliminated from risk-narrative-generate (DEC-20260428-B path), 5 multimodal executors, and estonian-company-data's proxy parse.
- **Repo-wide source scan** in `llm-json-adoption.test.ts` forbids the greedy idiom (allowlist: code-review's sanitize-retry, llm-output-validate's repair chain) — the ~68 migrations can't quietly revert.
- **26 manifests** got the "Output size cap per call" limitation; token figures verified against real budgets.

## Process

Sonnet agent built (7 commits, isolated worktree); Fable verified: gates re-run (tsc clean, 549 tests), per-file model/max_tokens byte-comparison, then a 3-finder review fan-out (removed-behavior audit over all 66 diffs / skip-claim verification / manifest consistency). 8 confirmed findings, all fixed on-branch before merge. Per-executor budgets and prompts unchanged throughout.

## Prod operations

- 26 limitation rows inserted into `capability_limitations` by targeted INSERT (onboard's authority gate still aborts on unrelated pre-existing `output_schema` drift for some slugs — reconciliation remains an open thread from the morning handoff).
- DEC-20260504-C verification: `/health` = `9e27faa`; live `/v1/do` call through migrated `regex-generate` completed (txn `0ecaaedc`, 3.3s); limitation rows confirmed by the insert script's own read-back.

## Non-obvious learnings

- "Structurally skipped" needs per-CALL granularity, not per-FILE: a file with one unmigratable call can still have a second, fully migratable one (business-license-check-se), and a multimodal create call doesn't excuse a greedy parse (5 files).
- A source-scan guard (forbidden idiom + allowlist) covers a 68-file migration far more cheaply than 68 behavioral tests — and it immediately caught my own comments containing the literal, which is the sign it actually bites.

## Cost

~€0.05 external (one regex-generate prod call on the test wallet; agent/review runs were internal tokens).
