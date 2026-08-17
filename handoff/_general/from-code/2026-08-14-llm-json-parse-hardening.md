Intent: Run the incremental activity check, then fix the company-enrich parse failure it surfaced — and the same bug class across every sibling capability carrying the identical code.

## What shipped

**PR #212 — `fix/company-enrich-json-parse`** (open, base `main`)
Root cause of the 2026-08-14 07:22Z x402 failure on `openai.com`: the executor stripped ```json fences with anchored regexes (`/^```(?:json)?/` and `/```\s*$/`). The closing strip is anchored to `$`, so when the model appended an explanatory note *after* the fence, both fence and prose stayed in the string handed to `JSON.parse`. The model's JSON was well-formed the whole time — the parser was the bug.

The two symptoms were one thing: the extraction came back all-null, and a model that found nothing tends to explain itself afterwards. That note is what broke the parse.

- New `apps/api/src/capabilities/lib/llm-json.ts` → `extractJsonObject()`: fenced block first, else a string/escape-aware balanced-brace scanner. Not `/\{[\s\S]*\}/` — that runs to the last brace in the string and over-captures on trailing prose. Truncated output returns `null`, never partial data.
- `hasSubstance` guard in company-enrich. **Fixing the parse alone would have made this call start *succeeding*** — returning an object of nulls, billing €0.50, and violating the manifest's own `guaranteed`/`not_null` contract. A throw is never charged (DEC-14).
- 22 tests. Regression direction verified both ways.

**PR #214 — `fix/llm-json-adoption`** (open, stacked on #212)
Five siblings carried the identical anchored strip: `web-extract`, `pii-redact`, `pdf-extract`, `invoice-extract`, `annual-report-extract`. All swapped onto the shared extractor.

Added `isEmptyExtraction()` to the shared helper. **Emptiness-based, not manifest-based** — `invoice-extract` declares no `guaranteed` fields at all (every one is `common`/`rare`), so a rule derived from `output_field_reliability` would never fire there. "Nothing anywhere" is both harder to trip and universal, and it avoids duplicating manifest field lists five more times.

The guards are deliberately **not uniform**, and the tests assert each asymmetry so nobody tidies them into consistency:
- `pii-redact` guards `redacted_text` directly. The generic check does not work there — `REDACTION_PROMPT` asks for all nine `entity_counts` keys, and zero counts as information, so a blank redaction passed. That is the one shape that must never succeed: the caller treats empty output as clean output and loses their input.
- `web-extract` has **no** guard. Its `extract` is a free-text ask, so "that field is not on this page" is an answer, not a failure, and `page_title` still populates — both manifest-guaranteed fields are present even when `data` is empty.
- `llm-output-validate` was **not swapped**. Its anchored strip is one step in a six-step *string* repair chain over caller-supplied text, not an extract-and-parse, and it never throws because reporting invalid JSON is its product. It gained the scanner as a last-resort fallback; its existing greedy branch still owns top-level arrays.

## Non-obvious learnings

**A tolerant parser is a billing change, not just a bug fix.** This is the load-bearing insight of the session. Before, a model that extracted nothing usually also broke the parse, so the call threw and DEC-14 meant no charge. Making the parse tolerant converts that silent-failure path into a billable success returning a shell of nulls. Any future "make the parser more forgiving" change on a paid capability needs a companion emptiness guard, or it quietly starts charging for nothing.

**The prompt can defeat the guard.** `pii-redact`'s prompt hardcodes nine zeroed `entity_counts`, and zero is legitimately information — so a generic "is everything empty" check sees a populated object and passes a blank redaction through. Guards on AI output have to be read against the prompt that shapes that output, not just against the schema.

**`smoke-test` step 2 cannot verify any paid capability.** `ALLOW_MATRIX` refuses `paid_prepaid` from `internal_test` context to protect vendor credits. So for every capability in both PRs except `llm-output-validate` (free), live execution is unverified locally — and a local run proves little anyway, since local Browserless is v2 and prod is v1. End-to-end confirmation belongs in prod after deploy.

**`annual-report-extract` is deactivated** (`auto-register.ts:116`, DEC-20260421-SE-B — allabolag.se scrape banned under DEC-20260420-H). Its `validate-capability` failure is pre-existing, and the edit to it is **inert** until reactivation. Kept in anyway: excluding it would need an allowlist entry in the very source guard meant to stop the pattern returning.

**Branch-state hazard in a shared working copy.** Mid-session the checkout was switched off `fix/llm-json-adoption` onto `fix/settlement-monitoring-gaps` by a parallel session, which committed `cb6b53d` there — and the next commit (mine) landed on *that* branch. Caught only because a reviewer flagged an unrelated commit in the diff. Recovery: cherry-picked into a temporary worktree (avoids yanking the shared checkout out from under the other session), pushed from there, then `reset --mixed` + targeted `checkout --` to restore the branch to origin state without touching the two pre-existing tracked modifications. **Check `git branch --show-current` immediately before every commit in this repo** — `git checkout -b` at the start of a session does not guarantee you are still there later.

Related: `fix/settlement-monitoring-gaps` is built on top of `ccf4688`, so it carries PR #212's commit. Its PR will include those changes unless #212 merges first.

## Open

- Both PRs are open and unmerged. **#212 must merge before #214** (GitHub will retarget #214 to `main` automatically).
- **Re-run `company-enrich` for `openai.com` in prod after deploy.** Either a real enrichment or the new "No company information could be extracted" error is correct; which one appears tells us whether openai.com is scrapeable from prod at all.
- `browserless-extract.ts:76` still uses the greedy `/\{[\s\S]*\}/` and backs ~47 country-registry capabilities. Deliberately out of scope — highest fan-out, own PR.
- `SUBSTANTIVE_FIELDS` in company-enrich duplicates the manifest's `output_field_reliability` with no drift guard. `lib/null-field-ratio.ts` already derives this generically from `capability.outputFieldReliability` but is wired only into `test-runner.ts`, not the live execute path in `do.ts`. Generalising it there would cover every AI-synthesis capability and delete the hardcoded list.
- No manifest carries a limitation describing the new hard-fail behaviour. Agents read `limitations` off `/v1/capabilities`, so the documented contract now understates it. Not done here because a `limitations` edit does not propagate to the DB row via `--backfill` — it needs delete + re-onboard.
- All new errors map to `error_code: "execution_failed"`, so an agent can only tell "retry" from "give up" by reading prose.
- Both PRs echo up to 300 chars of raw model output (derived from a scraped third-party page) into the customer-facing error, which persists to `transactions.error` and the shareable audit record. Kept deliberately — that field is exactly how this bug was diagnosed — but the stricter option is to log it server-side and return a clean message.

## Activity snapshot (the trigger)

Window 2026-08-13 22:42 → 2026-08-14 10:50 CET: 6 external calls, **0 completed, 6 failed**, all x402, so no revenue and no charges. Zero signups, zero site searches. Four of six failures were correct behaviour (`price-compare` US refusal, `sitemap-parse` on a genuinely-404 python.org sitemap, `french-company-data` no-match). One coverage gap: `exchange-rate` USD→COP ×2 — ECB reference rates don't cover COP, and the capability presents as general FX. One real defect: `company-enrich`, fixed above.

Traffic profile reads as a survey, not a workload — one call per capability across five unrelated verticals, deliberately off-happy-path inputs. Likely an agent or benchmark harness sampling the x402 catalog.

## Cost

No external spend. No paid capability was executed live (ALLOW_MATRIX blocked it); the only live run was `llm-output-validate`, which is free.
