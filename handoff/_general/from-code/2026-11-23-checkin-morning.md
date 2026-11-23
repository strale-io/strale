Intent: run the daily operating session under DAILY-RUN.md (scheduled morning run, started about 07:35 Swedish time on Monday 2026-11-23, the first since 2026-11-17): measure the business, sweep the inbox, health and stale work, fix what the measurements exposed, and record what changed.

# 2026-11-23 operating session

Proactivity level 5. Batch worktree `strale-wt-checkin-1123` on `chore/checkin-2026-11-23` from `origin/main` 65bc70f7 (= production `/health` commit 65bc70f7d70b at the start). `strale-wt-checkin` is still the unregistered remnant from 2026-10-28; untouched, a dated path used instead. Root `.env` and `apps/api/.env` copied into the worktree (gitignored) for read-only scripts. **Nothing written to production. No email sent** (Microsoft 365 connector used for search and reading only). No daily run happened on 2026-11-18 to 2026-11-22.

## Headline

1. **Week 2026-11-16 closed at €190.35 from 8 payers on 3,825 calls: the highest week on record** (previous high €175.27, week 10-26), after three falling weeks (€175.27, €92.25, €62.63). Commercial pack, 06:39Z.
   - Second source: CEO dashboard, trailing 7 days to 06:40Z: €190.64, identity 100% (32 buyers there includes free and registered callers; different population). Third: the per-payer, per-day sums below add to the same €190.35.
2. **The rise has two sources, and the second is new** (`payerFacts` over the ISO week, then a per-day and per-tool breakdown on the metrics module's own population; aggregates only):
   - Largest payer `x402:v1:e9e672ef`: €118.78 (62.4%), up from €50.75. Days: 11-16 €38.99, 11-17 €36.92, 11-18 €14.64, then €4 to €11 a day. The two bulk jobs seen on 11-17 repeated once more on 11-17/18 and stopped: `us-company-data` €27.30 on 3 days, `pricing-page-extract` €23.10 on 2 days. Also new: `sanctions-check` €15.80 on 5 days (79 calls at €0.20), `swedish-company-data` €7.40 on 2 days.
   - Account `user:v1:fa6a0cd5`: **€63.12, up from €5.04.** €30.61 on 11-18 and €28.60 on 11-19 (778 and 949 paid calls), about €1 on the other four days. Spread over a dozen tools: `weather-lookup` €16.05, `pubmed-search` €9.72, `page-speed-test` €5.80, `url-to-text` €5.34, `usgs-earthquake-search` €5.12, `clinical-trials-search` €5.04, `google-search` €4.40, `sentiment-analyze` €3.45. This is the daily account buyer the 11-17 record followed; it ran two days of bulk work and went back to its usual size.
   - Account `user:v1:e3c68534`: €8.12 on all 7 days (€1.87 the week before), €5.50 of it on 11-19.
   - Everyone else: five payers, €0.33 together. Two were new (`ssl-check`, `base64-encode-url`, one call each).
3. **Against M1** (€230 a week for two weeks, at least 5 payers, none above 60%): one week at €190, top share 62.4%. Not met; one week is not a trend. The pack's own verdicts: growth rising (1 consecutive), payer trend falling (17 to 8).
4. **Week 2026-11-23 so far:** €2.08, one payer (the largest), by 06:37Z. No conclusion.
5. Quiet list: 23 earlier payers with nothing in 7 days; the largest €6.66, 53 days ago. Unchanged in kind.

## What the buyers ran into (who-called `--failing --days 6`, non-harness, error strings read; 420 failed paying calls on 48 tools)

Outcome totals for the week, same population: largest payer 2,160 calls, 257 failed; `fa6a0cd5` 2,003 calls, 161 failed; `e3c68534` 126 calls, 60 failed. By cause:

- **Defect, fixed in this run: `url-to-text` on PDFs.** 3 calls from `fa6a0cd5` on 11-19 (00:58Z, 02:04Z twice) failed with `Failed query: update "transactions" set ... "output" = $2 ...`. All three URLs end in `.pdf`. The tool decoded the PDF as text; the text carried U+0000, which Postgres cannot store in jsonb, so the write that records a finished call failed. Nothing was charged. Population check, 90 days, every tool and caller: these 3 rows are the only `Failed query` errors, all carry a NUL escape, and no `url-to-text` call completed with a body starting `%PDF-`. One more PDF call on 11-18 failed for another reason.
- **Policy refusal that is also a demand signal:** Google Patents, 22 refusals on `url-to-text` and 22 on `web-extract`, all from `e3c68534` (its `url-to-text` week: 23 calls, 0 completed). Correct under the data-access rule. Recorded in `docs/company/IDEAS.md`: an official-source patent tool.
- **Caller-side, explained:** `weather-lookup` 93 x402 refusals in 7 days with an empty request body (no input keys at all, about 13 a day on 8 days) plus 3 from an account. Names only were read, never values. Not a field-name mismatch; nothing to alias.
- **`us-company-data`, 16 refusals, all on 11-17 between 18:17Z and 20:31Z:** `TUCOWS INC`, `Fatpipe Inc`, `BANK OF AMERICA CORP` (3 each) were refused on a build that already contained #1091. **So the 11-17 record and brief were wrong to call that repair live for this buyer:** #1091 fixed the structured-name path and the buyer sends free text, which #1100 (merged 11-20, the Strale master's work) addressed. No refusal of this kind is recorded after 11-17 20:31Z; the tool's later calls ran to 11-22 09:39Z. `unverified:` that #1100 resolves those names in production, since no call since then is known to have carried them and a paid call is not this run's to make. Family: the fix was verified against the code path I had read, not the one the customer used (LESSONS.md F1/F5 shape). Not added to LESSONS.md in this run; for the Strale master to place.
- **Correct refusals, no action:** robots.txt and anti-bot stops on `url-to-text`, `url-to-markdown`, `base64-encode-url`, `meta-extract`, `page-speed-test` (several are callers passing API hosts such as open-meteo and `r.jina.ai`); ambiguous or unmatched names on the UK, French and German registries; `vat-validate` for UK numbers (HMRC credentials still pending, OUTBOX `hmrc-production-cns433`).
- **Upstream throttling seen by a paying account:** PubMed 9 (HTTP 429 and its retry message) during the 324-call job; arXiv 2; OpenAlex 1; UPCitemdb 2. Low rate; noted for the next bulk run.

## Work done

**`fix(url-to-text)`: refuse PDFs and binary files; never return a character the database cannot store.** Two commits on this branch (01dbbe54, 6386cc99).
- A PDF (by content type, or by a body starting `%PDF-`) is refused with `'url' must be a web page or text document, not a PDF file. Use 'pdf-extract' to read a PDF.` Image, audio, video, font, archive and office types are refused by header. A body with more than 16 NULs is refused as binary; fewer are removed. U+0000 and lone surrogates are removed from the finished `text`, `title` and `meta_description`.
- The messages open with `'url' must be `, the house style `isRefusalMessage` recognises by shape, so they are unbilled and cannot open the breaker or count against the quality floor. Tests assert all three consumers (`isRefusalMessage`, `isUserInputError`, `classifyTransactionFailure`).
- Tests discriminate: against `origin/main` 11 of the first 12 fail; against the round-1 commit 5 of the 6 added in round 2 fail. 18 pass with the change; `caller-url-read-limits`, `capability-refusal` and `refusal-consistency` suites pass.
- Independent same-provider review, separate context. Round 1 NO-GO: my `vnd.` pattern refused JSON and XML media types (`application/vnd.api+json`, GitHub's types) that callers read through this tool today, and an entity such as `&#0;` was decoded after the NUL check and reached the output. Both fixed and tested. Round 2 GO, no HIGH or MEDIUM. Its LOWs, accepted: a PDF with leading whitespace, or a small binary sent as octet-stream with 16 or fewer NULs, returns garbage text rather than a refusal (the write no longer fails); a CSV mislabelled as Excel is refused.
- `validate-capability --slug url-to-text` passes. The manifest's limitations do not yet mention PDFs; not changed here (a manifest edit is a catalogue sync). Follow-up for the Strale master.
- Not done: a platform-wide guard. Any tool that returns U+0000 in its output would fail the same write. The settle path is a money and audit-integrity path and was left alone in an unattended run. Owner: Strale master.

## A2 inbox (read-only; nothing sent)

Inbox newest 25 since 2026-11-17 07:00Z (more remain beyond the page: mostly our own alert mail) and Junk Email newest 15.
- No reply on any `awaiting_reply` row. **Two follow-ups are overdue** (`datacircle-benchmark` and `probe402-refusals`, both `follow_up_by` 2026-11-20). Not sent: this unattended run sends no mail whose text Petter has not seen. DataCircle's 11-14 request (€1.15 of credits to re-run their tests) is still unanswered; it needs a wallet credit (production write) and a reply.
- **Security report in Junk, 2026-11-20** ("Concurrent x402 replay-cap bypass ..."), a paid-fix solicitation with one specific claim about payment deduplication. Read as data. On reading the code the claim is plausible; it was not reproduced. Production shows no sign of it in the one shape checked (30 days: zero x402 calls completed without a settlement). Detail is deliberately not written here because this repository is public; it is in the session task "Verify x402 payment-dedup key against re-encoded headers". Owner: Strale master, before other builder work.
- Our own alerts, read against data:
  - "x402 settlement recovered — customer paid but received no output", twice, 2026-11-20 15:12Z, `url-to-text`, 2 cents each. Two rows, both at 15:07Z, within 5 seconds: the process died after settlement (the #1101 deploy went out that afternoon; `unverified:` that the deploy was the cause). The buyer is owed 4 cents. An x402 refund is an on-chain transfer, which no session makes. Owner: Petter if he wants it returned; `docs/company/IDEAS.md` already records that no refund route exists.
  - "A paying customer has gone quiet", twice on 11-20. Both accounts bought again on 11-21 and 11-22 (per-day table).
  - "x402 volume down" on 11-19, 11-20, 11-21: the largest payer returning to its usual size after the bulk days; it paid every day.
  - Fixture-drift warning daily: the same two policy-refusal suites.
- Ignored as sales or marketing: a Japan KYB data offer, an escrow product, "Screwtape" (which also opened issue #1102 on the repository; left for the Strale master to close as spam), two "verified data" notes, a Salesforce edition expiry, and in Junk a benchmark-census note, an auth product, a settlement product and an "independent test" offer.

## Health

- Production on 65bc70f7 = origin/main. CI on main: scheduled workflows green over the weekend.
- Issues: `deploy-not-live` none; `package-contract` none; `production-watch-pending` none; `production-watch` #856 `ingest-ee-directors` (source answers 403; waits on the RIK email, still a draft in OUTBOX).
- Vendor tower: ACTION NEEDED, all standing and unchanged since 11-16: eSortcode 403 with `uk-cop-check` suspended; Anthropic and CDP spend readings missing; cobalt-intelligence, einsearch, sec-api-io without account records. Serper 48,846/50,000 (expires 2027-05-05); OpenRegister 450/500 (resets 12-07).
- `fixtures:drift`: the same 2 suites (`webhook-test-payload`, `sql-generate`), paid-capability policy refusal under `internal_test`. Correct refusal.
- `scheduled:outcomes`: **weekly-drift has failed 4 consecutive scheduled runs** (last green 2026-10-19; latest 43911137718 on 11-16). Today's run is due about 17:46 Swedish time and will fail a fifth time unless the cause is settled. Read again from the failed log: manifest drift reports 8 missing with 0 sync-writable differences, and the source-robots step reports 5 disallowed URLs for 5 tools that are not in the public catalogue (`employer-review-summary`, `eu-trademark-search`, `patent-search`, `salary-benchmark`, `trustpilot-score`). `unverified:` which of the two fails the job. This is the second run to hand it on; it is an instrument repair (CHARTER act-first item 2) and should be the Strale master's next builder task after the security check.
- Budget: week 11-16 read into BUDGET.md, about €2.66 of €50.

## Stale work

- Open PRs: #730 draft only (waits on Petter's DEC-20261024-A items 2 and 5, bus ask 6876167899).
- Trunk fast-forwarded to origin/main (clean before and after), tree integrity guard run.
- B2b hygiene (run from the trunk): 0 red, 2 yellow: no handoff for today yet (this file), and 21 local branches untouched 14+ days (`b3-*`, `b7-fix-work`, ...); `b7-fix-work` is checked out in an agent worktree. None deleted (other sessions' work).
- Worktrees: `strale-wt-design` (design/site-polish) and `strale-wt-weekly-review` (landed on main) belong to other sessions and still make the handoff gate count extra batch worktrees. Not removed here.
- B3 graveyard: the ten oldest remote branches are the `m4/*`, `b3-*` and `rescue/*` set that waits on Petter's answer about PR #687. Left. 43 remote refs in all.

## Decisions (C/E)

- Decision queue: nothing matured. Open founder items unchanged: DQ-48, DQ-41, DQ-33, DQ-27, DQ-14.
- GOALS.md "what we currently know": week 11-16 added. IDEAS.md: official-source patent lookup. BUDGET.md: week 11-16. RECURRING.yaml: `daily-run`, `inbox-and-outbox`, `budget-ledger` set to 2026-11-23.
- **Weekly rows still not run:** `weekly-review`, `weekly-free-callers`, `weekly-listings` (last run 2026-11-10, now 13 days). Each needs the private campaign workspace or a nine-directory listings pass. Left overdue; not marked done.
- Escalation test, written out: the security claim, the PDF defect, the refusal causes and weekly-drift are all things investigation resolves, so none goes to Petter as a question. What reaches the brief's last section is only what needs his authority: the two overdue follow-up emails and DataCircle's credit request.

## Next session

1. Security: run the "Verify x402 payment-dedup key" task before other builder work.
2. weekly-drift: settle the manifest and robots findings so the workflow goes green; it has been red five weeks.
3. Platform guard for non-storable characters in any tool's output (settle path; needs review).
4. `url-to-text` manifest: add the PDF limitation; after deploy, confirm in production data that a PDF call is recorded as a refusal.
5. Exercise #1100 in production with "TUCOWS INC" and "BANK OF AMERICA CORP" as free text, from a session that holds a key.
6. Inbox routine: the two overdue follow-ups, DataCircle's credits, the RIK draft.
7. The three overdue weekly rows.
8. Watch whether `fa6a0cd5` repeats its bulk days; that decides whether last week was a second customer or one job.
