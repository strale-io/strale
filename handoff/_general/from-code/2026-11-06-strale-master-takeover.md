Intent: the Strale master after the 2026-11-06 account takeover (session session_01Ms71ZkYLtEVEsZBfEXzD9i, parent wow-core takeover session_01Ms71ZkVFM5MB5PU8UKr6Lz) resumed from `2026-11-06-orchestrator-state.md` and worked its list in order.

[BACKFILL] Cloud session; no Notion write was made.

## Lease

`bus.mjs lease --check --session session_01Ms71ZkYLtEVEsZBfEXzD9i --parent session_01Ms71ZkVFM5MB5PU8UKr6Lz` → active (account gmail, lease of 2026-11-06T21:12:55Z; it names wow-core and codex-dispatcher, no strale entry yet). Run with `--parent` until the lease gets a strale entry. The bus repo had to be attached with add_repo first.

## PRs

| PR | State | Next |
|---|---|---|
| #949 polish-company-data label | Independent review of de8140d4 PASS-WITH-NITS. Its MEDIUM finding: the row's `capability_type` is still `ai_assisted` (hybrid column, never rewritten), which types the tool "ai" in the audit body and ties it to Anthropic's health gate. Fixed in b8965627: block 0146 also sets `stable_api`, guarded on `ai_assisted`. The M089 ledger row was regenerated, since it was never on main. Delta review PASS-WITH-NITS. Main merged in; auto-merge on. | After deploy: `GET /v1/capabilities/polish-company-data` shows `"transparency_tag":"algorithmic"` (DEC-20260504-C). |
| #953 RECURRING.yaml due-list | Independent review PASS-WITH-NITS. All findings fixed in c95bdff7. The daily-run row was set to 2026-11-06 after #952's run. Auto-merge on. 55/55 `handoff:test`. | None once merged. Session start now prints overdue rows. `weekly-review` is 75 days overdue. |
| #952 daily check-in (another session) | Its block 0147 uses ledger id **M089**, which collides with #949. Its session could not merge (classifier). | Once #949 merges: merge main into `chore/checkin-2026-11-06`, renumber its ledger row to M090 (`check-migration-ledger.mjs --update` after removing its row), add 0146 to the BLOCKS order test, run an independent review, enable auto-merge. Post-deploy: `vendor:status` Serper healthy, expiry 2027-05-05. |
| #954 FATF lists (`fix/aml-fatf-lists-2026-10`) | Grey list = the 18 jurisdictions of 30 Oct 2026; black list unchanged (KP, IR, MM). Test 6/6. Independent review PASS-WITH-NITS: rebuilt the list per plenary (Feb, Jun, Oct 2026) from independent sources, exact match. Customer-visible: BVI entities now score 25 ("medium") instead of 10. Auto-merge on. | Merges itself. Follow-ups in its body: EU list, MM label, secrecy-list source. |
| #955 ai-sdk and cli pre-publish fixes (`fix/ai-sdk-cli-prepublish`) | The pre-publish check found both packages ready apart from: `--provenance=false` missing from the documented first publish; the README x402 example failing strict tsc (now `FetchLike`); Node 20 claimed while ai@7 needs 22; no LICENSE file; unencoded slug in how_to_pay. All fixed; the README example passes `tsc --strict` against the tarball. Draft; independent review running at the time of writing. | After review: ready, auto-merge. Then Petter publishes locally (command in the PR body), then the session runs the production smoke contract in the PR body and adds both to the approved list in `DISTRIBUTION_PR_PREFLIGHT.md` §2. |
| #950 x402 alert | Draft. Do not merge (three review rounds). | Per-payer burst cap redesign, as its body says. |

## FATF source note

fatf-gafi.org answers bots with a Cloudflare challenge (`cf-mitigated: challenge`). It was not worked around (DEC-20261023-A). The list comes from the FinCEN release of 30 Oct 2026 (four removals, no additions named, call-for-action unchanged) and the ComplyAdvantage plenary note (full 18). RegReportingDesk agrees but derived its list. Recheck after each plenary (February, June, October). A RECURRING.yaml row for that belongs in the next change to the file.

## Open, not started

- `spawn_task` for the EU-list follow-up timed out (MCP 60 s), so it may or may not be queued. The full brief: update `EU_HIGH_RISK` in `aml-risk-score.ts` from the current Delegated Regulation (EU) 2016/1675 consolidation, with an as-of date and a source note; reconsider MM `prohibited`; source `SECRECY_JURISDICTIONS`; extend `aml-risk-score.test.ts`.

- **EU high-risk list in `aml-risk-score` (`EU_HIGH_RISK`) is stale.** It still holds PA, JM, BB, GI, UG (delisted by the EU in 2025) and misses later additions. It needs research against the current Delegated Regulation (EU) 2016/1675 consolidation.
- `apps/api/src/data/error-codes.ts` `AI_ASSISTED_SLUGS` is a stale snapshot (polish-company-data, token-count, secret-scan and others). Only `scripts/populate-error-codes.ts` reads it.
- From the orchestrator list, still open:
  - item 1, the business-summary email job;
  - item 7, the PC forms brief;
  - the 402 Index route;
  - the DQ-41 promotion path;
  - cost trims;
  - the robustness programme files;
  - the Codex branch reviews (no result yet).
- From #952's record: robots-disallowed listed tools (`customs-duty-lookup`, `container-track`); `exchange-rate` with 31 % paid failures.

## Environment notes

- The clone starts shallow, so `context:generate` and the context check report `*_NOT_ANCESTOR`. Run `git fetch --unshallow origin main` first. `OPERATOR_ACTION_PREPARED_REF_INVALID` needs `git fetch origin ad67e433f0bdb894999293ab3286aff8ab858ed6`.
- `context:generate` refuses the primary checkout. Work in a batch worktree (`strale-wt-recurring`).
- `BWS_ACCESS_TOKEN` is set but no `bws` CLI is installed. `STRALE_OPS_READ_TOKEN` does not exist yet, and ops-read has no capability-field check.

## Later the same evening (same session)

- **Merged and live:**
  - #952: Serper renewal reconciliation, block 0147, ledger M090.
  - #954: FATF lists.
  - #956: EU high-risk list from the 2026-01-29 consolidation; Myanmar labelled "high".
  
  Production served `720648b0` after #955; later merges deploy the same way.
- **#958:** an EDD recommendation floor for EU-listed and call-for-action countries, with DPRK and Iran raised to at least "high". Its review passed, and auto-merge is on.
- **Lease:** the gmail lease of 2026-11-06T22:10:51Z names `strale:session_01Ms71ZkYLtEVEsZBfEXzD9i`. Run the check without `--parent`.
- **DQ-39 scheduled task disabled:** `trig_013VyLUKWy4R4RGrKkG75BG3`. It was bound to an archived session, and DQ-39 closed on 2026-10-28; firing it would have moved or switched off the Serper tools.
- **Codex (dispatcher `session_01Ms71ZkgxYwvXNPwXQ4mezS`):**
  - The `swallowed-failures-wave2` brief (4f342c01) was withdrawn. It is billing-path work, so promise-audit rule 5 keeps it with Claude. The dispatcher confirmed it never received or ran it.
  - `url-to-markdown-parse-bound` was queued at 23:46 Swedish time as task `task_e_6aee58cc7388832998dd61ec621b3a41`. The result lands on `codex/url-to-markdown-parse-bound`.
  - **Next:** run an untrusted-input review, open the PR, then report to the wow-core master: "Codex works for Strale: <slug> → <PR>".
- **Plans:** Petter asked for them to be regenerated after archiving the old sessions.
  - #957 holds the figure-free revenue plan and the robustness program R1–R7.
  - The full revenue plan, with figures, was sent to Petter as a file and stays out of the repository, as decided on 2026-11-06.
- **Open question to Petter:** did his yes to DQ-42 cover delisting `eu-trademark-search` (option 3)?

## Night of 2026-11-07, 00:00–03:30 Swedish time (same session)

- **Merged and live:**
  - #959: `eu-trademark-search` delisted, as Petter approved.
  - #961: one IBAN table from the SWIFT registry; the UAE weekend fixed.
  - #962: legal dates, salary thresholds, filing deadlines, employer costs.
  - #963: VAT, corporate tax and EU membership from the Commission's TEDB.
  - #965: the reference-data register `config/reference-data.yaml`, with 82 datasets. `refdata:check` runs in PR CI. Due rows go to the weekly drift issue and to session start (`orient.mjs`).
  - #966: the sanctions and PEP `lists_queried` disclosure narrowed to the Dilisense catalogue: 120 included lists, the paid development-bank lists removed, Wikidata removed.

  Production served `1ab908a5` (#966) at about 02:45.

  Reference for the last two: #965 (R2 register) and #966 (first due rows).
- **#964 (R1, url-to-markdown):** after six independent review rounds, the last PASS-WITH-NITS with its nits fixed in 2cc51691, it is ready with auto-merge on.
  - **What it does:** the conversion runs in one worker (8 s, 384 MB heap, 2 MiB input), behind linear, windowed text checks.
  - **After merge:** confirm the deploy commit and one ordinary conversion in production.
  - **R1 stays open:**
    - per-caller fairness, because one free account can keep the single converter busy;
    - `browserless-extract.ts` `htmlToText`, which is quadratic and serves 8 tools that fetch a caller's URL. This is the next R1 batch.
- **DQ-46 (Petter):** publish the narrowed sanctions `data_source`, both sample responses and the PEP limitation. Compliance text is report-only (`manifest-publication-policy.ts`), so publishing it needs his yes, as DQ-36 did.
- **Flaky test fixed:** the `attribution.test.ts` raw-IP check could fail by chance. It now uses a pinned date.
- **CI note:** one run lost a vitest fork in `readability-convert.test.ts` after every test had passed. It did not reproduce, the re-run was green, and the review found no code cause. If it recurs, look at runner memory.
- **Next (R2):** clear the undated harm-A register rows before 2026-12-15. `SECRECY_JURISDICTIONS` still has no source.

## Morning of 2026-11-07 (same session)

- **Merged and live:**
  - #969 (DQ-46): the narrowed sanctions and PEP text is published. Verified at `13bbaf47`.
  - #970 (DQ-47): pep-check's public limitations are now exactly the manifest's three, with no OpenSanctions and no "LLM fallback". Verified at `9dd7ecd8`.
- **AI model upgrade (Petter asked; plan stated, no objection):**
  - **Prices:** Haiku 5.5 is $0.10/$0.50 per M tokens up to 100K-token prompts, against Haiku 4.5's $1/$5. Sonnet 5.5 is $2/$10, against Sonnet 4.6's $3/$15.
  - **Step 1, this PR:** every Claude caller reads the answer by block type through `messageText` in `lib/llm-response.ts`, and a model safety decline becomes a registered refusal. On Haiku 4.5 this changes nothing.
  - **Step 2:** move `capability_default` to Haiku 5.5. Before that, three things are needed:
    - remove `temperature: 0` (competitor-compare, and llm-extract's option), because Haiku 5.5 rejects it;
    - decide thinking per role (`disabled` keeps 4.5's behaviour, and the `max_tokens: 10/100` name resolvers need it);
    - compare old and new outputs on golden inputs.
  - **Blocked:** no Anthropic key reaches this sandbox, and installing `bws` to read one was refused. The live comparison needs a test-tier key.
  - **Order after that:** digest (Sonnet 4 → 5.5), then risk-narrative last, with per-flag citation checks.
- **Step 1 is live:** #971 (`messageText`, refusals as registered refusals) has merged and production serves `78bbdf55`.
- **Step 2a (this PR):** wraps calls without changing any model.
  - **Registry settings:** a model's registry entry carries the request settings it needs (`settings`, applied in `anthropic-client.ts`).
  - **Candidate slot:** `MODEL_CANDIDATES.capability_default` holds Haiku 5.5 with thinking disabled, sampling dropped and `max_tokens` ×1.3.
  - **Comparison script:** `apps/api/scripts/compare-models.ts` runs 57 tools on both models: those that call the role, are not deactivated and do not fetch a page.
- **To run the comparison**, from the PC, which has the key: `cd apps/api && npx tsx scripts/compare-models.ts --role capability_default --out compare.json`. Then `npm run receipt -- --kind audit --topic model-compare-capability-default --from apps/api/compare.json`.
- **Step 2b:** promote the candidate into `MODELS`/`MODEL_PRICES` only if the comparison shows no regressions. Remove `temperature` (competitor-compare, llm-extract) in the same PR.
