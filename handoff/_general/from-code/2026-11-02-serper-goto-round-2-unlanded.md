Intent: preserve the round-2 review fixes for the Serper `/goto` repair before this session ends, and state plainly what is still live in production and what has not been verified.

# Serper `/goto` round 2 — applied, pushed, NOT merged (2026-11-02, Swedish time)

**Read this first.** PR #859 merged on 2026-10-31 and is live
(`/health` → `b74350e0`). It carries **round 1 only**. The independent review
ran *after* that push, found ten items, and they were applied in this worktree
but never landed. `origin/main` contains none of the symbols they introduce
(`stripUnresolvedGotoLinks`, `describeResultDomain`, `startSerperBudget`,
`GOOGLE_HOST_RE`).

The PR body of #859 says the review's findings "are addressed in the commits on
this branch". **That sentence is false** — it was written before the review
returned. Corrected here rather than left to mislead the next reader.

## What is live and still wrong

| # | Live defect | Where |
|---|---|---|
| 1 | `google-search` emits unresolved `goto` wrappers in `sitelinks[].link`, `answer_box.link`, `knowledge_graph.website` and `.descriptionLink`. The last two are invisible to the resolver's key set entirely, so they leak **even when `/resolve` succeeds**. Worst of the six. | `google-search.ts` |
| 2 | `brand-mention-search` returns model-written URLs unchecked — it can emit the literal `"(unavailable)"`, or a URL the model reconstructed from the title and snippet. A fabricated source on an `ai_generated` capability (DEC-20260428-B). | `brand-mention-search.ts` |
| 3 | `backlink-check` admits a row with `source_url: ""` when an entry has a breadcrumb but no link, and counts it as a referring domain. A regression this change introduced: previously `extractDomain("")` was `""` and the row was skipped. | `backlink-check.ts` |
| 4 | `keyword-rank-check` reports a rank derived from Google's **display breadcrumb** with `unresolved_positions: []`, so the caller cannot tell the position was never resolved — on the one output whose purpose is to refuse rather than guess. | `keyword-rank-check.ts` |
| 5 | The search's 15 s timeout plus resolution's 8 s can total 23 s against the 15 s `SYNC_TRANSACTION_WALL_MS`, turning the designed refusal into an infrastructure error. The >100-link loop gave *each batch* its own slice, so the bound was per-batch, not total. | `serper-links.ts` + all callers |
| 6 | `unresolved_*_count` counts wrappers anywhere in Serper's response, including surfaces the output never emits. `google-news-search` can count entries beyond its own `num_results` slice. | five capabilities |

Also live: the code emits eight new output fields that **no manifest
declares**. CI's `check-manifest-guaranteed-consistency` only catches the
opposite direction (declared-but-not-in-schema), so it stayed green.

## What this branch now carries

`claude/elastic-jang-31905e`, pushed. 21 files, ~910 insertions. All six above
are fixed, plus four smaller review items:

- `isGotoLink` matches the path case-insensitively and percent-decoded.
- `describeResultDomain` refuses **any** Google host from the link branch, not
  only a `/goto` path — so if Google moves to `/url?q=` or `/aclk` the original
  wrong-answer bug does not silently re-arm.
- `GOOGLE_HOST_RE` is exported from `tos-blocklist.ts` and shared, instead of a
  second divergent copy ("one list, many matchers").
- `resolveSerperLinks` reports every batch's error, not just the last, and
  derives `unresolved` from what the response now *holds* rather than from the
  mapping — so a refused rewrite is never reported as resolved.
- The `failure-classifier` test fixture no longer embeds "HTTP 503", which
  already matched an existing pattern and made that test pass either way.
- Manifests declare the new fields in both `output_field_reliability` and
  `output_schema.properties`.

## What was and was NOT verified

**Verified before this session ran out of budget:**

- `npm run typecheck` at the repository root: clean (after building
  `packages/mcp-server` and `packages/sdk-typescript`, as CI does).
- `serper-links.test.ts`, `serper-goto-links.test.ts`,
  `failure-classifier.test.ts`: 58 tests, all passing.
- `check-manifest-guaranteed-consistency --strict` passing *after* the manifest
  and schema additions — it failed on the reliability entries alone, which is
  how the missing `output_schema` half was found.
- The classifier pattern is load-bearing: removing it fails the first test.

**NOT verified, and nothing should be claimed on it:**

- The full gate set was not re-run after the last few edits (the breadcrumb
  parser, the `<=` blocking fix, the `google-search` double-count fix).
- `npx vitest run src/capabilities/ src/lib/` was last run mid-way through the
  round-2 edits: 6 failures, all confirmed pre-existing at `df047524`
  (`vendor-terms`, `no-drizzle-any-array`, `upstream-replay-contract`,
  `middleware.ip-limit`, `free-tier-rate-limit`, `migration-artifact-audit` —
  the Windows path/line-ending family). They are not this change's, but the
  suite has not been run clean since.
- `apps/api/src/lib/__snapshots__/actionable-errors.test.ts.snap` is modified
  in this branch and **its change was never reviewed or explained**. Check it
  before merging; it may be an unrelated artifact of a test run.
- No CI run, no production verification of round 2.

## Next action

Open a follow-up PR from `claude/elastic-jang-31905e`, run the full gate set,
merge on green CI, then verify in production per DEC-20260504-C by calling
`google-search` and reading the URLs it returns — specifically
`knowledge_graph.website` and `sitelinks[].link`, which is where the live leak
is. Do not treat #859 as the end of this repair.

## Serper renewal

Unchanged from the 2026-10-31 handoff and still due by 6 November: $50 per six
months (Starter, 50,000 credits), which is the pack price rather than the usage.
Letting the key lapse delists seven live tools. The purchase is Petter's.

Credits spent across both rounds: **1** (one search; four `/resolve` calls at 0).
