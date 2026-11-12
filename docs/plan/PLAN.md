# Plan

Master-owned: only the master edits it, in a state PR; a lane PR never does.
Rules and lint: wow-core `templates/STATE_FILES.md` "Project plan". The founder reads this file, not the task queue.
Moved from `docs/plan/BASELINE-2026-11-11.md`, which keeps the full evidence, the struck list (section 3) and the stale register lines (section 6). No revenue figures in this file: the repository is public.

Outcome: the first revenue bar in `docs/company/GOALS.md` (named M1 there; it is not this plan's milestone M1): two weeks in a row with at least 5 distinct external payers and no single payer above 60%, the target of the 2026-11-06 revenue plan; confidence is low.
Outcome date: 2026-12-06
As of: 2026-11-12   Last checked against code and production: 2026-11-12
Moat: not found yet; the candidate is the flagship of DEC-20261023-B, official-source company and compliance data where every call carries its provenance and an audit record. Nothing yet shows it is hard to copy.
Distribution: agent-tool listings (MCP registries, framework packages, directories) plus pay-per-call over x402 with no signup; which of them brings payers is unmeasured until M3.

## Milestones

Dates follow the growth-readiness triage (strale-io/strale#1011), which the founder approved and merged on 2026-11-11. The revenue plan's kill-or-continue checkpoints stay on 22 Nov and 6 Dec. M1 to M3 here are this plan's milestones, not the revenue bars of the same names in GOALS.md.

| Id | Date | Milestone |
|---|---|---|
| M1 | 2026-11-22 | Sellable: no listed paid tool charges for a failed or wrong answer, the "a failed call costs nothing" copy is true or narrowed, and signup shows the Terms before the account is created |
| M2 | 2026-11-29 | Listed: PyPI and npm releases live with smoke receipts, strale-cli and strale-ai-sdk published, Smithery, mcp.so and Context7 corrected, the four directory submissions open, the Claude connector submitted |
| M3 | 2026-12-06 | Converting: a weekly payer-by-source report with a receipt, and the outcome read from it |

## Items

Ids follow the baseline's section 4 (A launch blocker, B soon after, C nice to have, D not doing); the baseline row holds the verified state. Money paths stay Claude-built.

| Id | Class | Milestone | Owner | Item | Done when | Status |
|---|---|---|---|---|---|---|
| A-1 | launch-blocker | M1 | fleet | Promise-audit T1 waves 2 and 3: listed paid tools that bill an answer when the upstream failed (audit rows 5-9, 15-17, 19-21, 23-24, 26, 28-33, 35). Merged: 2a (#1014, rows 7, 8, 17, 19), 2b (#1015 and #1017, rows 9, 15, 16, 21, 23, 24), 2c (#1018, rows 5, 20, 26, 28, 29), 2d (#1021, rows 30-33, 35); row 6 closed by withholding gdpr-fine-lookup (#1019); wave 3, the failure replay over the 32 recorded network executors (#1023); wave 4, follow-ups (18) robots-txt-parse soft 404 and (23) domain-reputation probe failures (#1025, deployed 2026-11-12); wave 5, business-day-check: countries with no holiday calendar refused unbilled and adjacent-year holidays counted (#1027, deployed 2026-11-12), only public and bank holidays count as days off (#1028, deployed 2026-11-12); wave 6, the failure replay over the network executors with no recording: vat-validate, arxiv-search, social-profile-check, email-validate-bulk, header-security-check, ens-resolve and ens-reverse-lookup no longer bill an outage as an answer (#1030, deployed 2026-11-12); the corrected cz-unreliable-vat-payer and domain-reputation limitations published (#1033, block 0155, live 2026-11-12); (30) header-security-check refuses a 401, 403 or 407 unbilled instead of grading the block page, and a site that never answers is the site's fault, not the tool's (#1035, deployed 2026-11-12). Left: (27) robots-txt-parse non-HTML soft 404s, (29) a region input for business-day-check, and the wave-6 follow-ups in the track | every row merged with fail-before receipts and the catch baseline shrunk by it | in-progress, every listed row merged; follow-ups next |
| A-2 | launch-blocker | M1 | fleet | domain-age-check billed "unknown" when WHOIS had no server or no creation date (row 27) | merged PR; baseline entry removed | done #1014 |
| A-3 | launch-blocker | M1 | fleet | container-track billed a check-digit answer when the carrier page failed (row 34) | the call fails unbilled on a carrier failure, or the tool is delisted | done #1014 |
| A-4 | launch-blocker | M1 | fleet | Public copy "a call that fails costs nothing" is untrue while A-1 is open | A-1 closed, or the copy narrowed (fleet authority, DEC-20260822-A) | open |
| A-5 | launch-blocker | M1 | founder | Signup stamps Terms assent without showing the Terms (`auth.ts:140`) | a Terms notice before account creation, wording approved by the founder, then built by the fleet | done #1032 (wording approved 2026-11-12); live on strale.io at the switch-over, the strale.dev signup is strale-frontend's |
| A-6 | launch-blocker | M1 | fleet | Promise-audit T2: no reference answers for sanctions-check, pep-check or the registries | one reference-answer receipt per family, paid run inside the EUR 25 sweep cap | open |
| A-7 | launch-blocker | M1 | founder | Promise-audit P-008/P-011: debits checked against the listed and dry-run price (needs the database at the PC; the fleet writes the query) | sweep receipt | open |
| A-8 | launch-blocker | M2 | founder | PyPI: straleio, langchain-strale, crewai-strale and composio-strale stuck at 0.1.4 with strale.dev links; release path for composio added (#1013), twine pinned for it (#1031); composio-strale: the founder added its trusted publisher and 0.1.5 published 2026-11-12; its production smoke found search returned nothing (wrong response key since the package was created), fixed in #1036, and 0.1.6 published 2026-11-12 and smoke-tested against production from a clean install (`archive/receipts/2026-11-12-check-composio-strale-0-1-6-production-smoke.json`). Left: straleio 0.1.5, langchain-strale 0.2.0 and crewai-strale 0.1.5 are built in the repo; each needs its trusted publisher on PyPI (account `petter_79`) and the founder's publish go (bus 6506170239) | new versions live and smoke-tested from a clean install | in-progress, composio-strale done |
| A-9 | launch-blocker | M2 | founder | npm: strale-cli and strale-ai-sdk unpublished; trusted publishers missing for straleio and straleio-langchain; n8n-nodes-strale not repointed (bus 6503452948, 6791877924; the strale-ai-sdk ask is not filed yet) | both on npm with smoke receipts; trusted publishers set | open |
| A-10 | launch-blocker | M2 | founder | Smithery listings say "270+ quality-scored" and "verified data" and link strale.dev | registry.smithery.ai shows current text | open |
| A-11 | launch-blocker | M2 | founder | Directory submissions awesome-remote, Docker #2202, Cline, Cursor are prepared, not submitted (bus 6503454276) | PR or form URLs recorded | open |
| B-1 | soon-after | M3 | fleet | x402 settlement-drop alert's first production week (#950) | receipt from Sat 14 Nov: Railway logs, no false page | open |
| B-2 | soon-after | M3 | fleet | weekly-drift scheduled run green again (#1008 re-captured three recordings) | green scheduled run, next on Mon 16 Nov | open |
| B-3 | soon-after | M3 | founder | Six fixture manifests still on strale.dev (database at the PC) | `onboard --backfill` and re-capture | open |
| B-4 | soon-after | M3 | fleet | ingest-ee-directors failing with no last success (#856); RIK email is a draft | RIK reply, then the job goes green | open |
| B-5 | soon-after | M3 | founder | Exchange-rate tools' 7-day error rate after #976 and #977 (database) | rate receipt | open |
| B-6 | soon-after | M3 | founder | Refunds for past failed charges: measurement by the founder at the database, analysis by the fleet | measurement receipt, drain plan, decision record | open |
| B-7 | soon-after | M3 | fleet | Upstream-replay perturbations 503, 429, network error, blocked 200, DNS timeout (`upstream-replay.ts` has only empty, hollow, skew) | zero-failure replay receipt | open |
| B-8 | soon-after | M3 | fleet | DQ-41: eurostat-data, entity-resolve, company-status-check, invoice-counterparty-check built but dark (#881-884) | listed in `/v1/capabilities`; promotion rule recorded for the paid-upstream case | open |
| B-9 | soon-after | M3 | fleet | Serper tools google-news-search and serp-related-questions dark (#246, #247) | validated and listed | open |
| B-10 | soon-after | M3 | fleet | Payer-by-source rollup (`signup_src`, x402 source tag); utm forwarding merged in #985, bare `?src=` forwarding and the rollup still open | signup test with `?src=x`; weekly rollup receipt | open |
| B-11 | soon-after | M2 | founder | Claude connector submission; `/mcp/connector` and OAuth metadata answer 200 (bus 6492179099) | submission record | open |
| B-12 | soon-after | M3 | founder | x402scan registration with a zero-balance wallet (bus 6492178598) | listing URL | open |
| B-13 | soon-after | M3 | founder | Coinbase CDP Bazaar email has no address (bus 6493139521) | the founder gives the address; the inbox routine sends; `sent` filled | open |
| B-14 | soon-after | M3 | founder | Zapier app, `packages/zapier-strale` 0.2.0 private (bus 6503452246) | app ID and live Zaps | open |
| B-15 | soon-after | M3 | founder | Narrow MCP registry entries for three servers (workflow dispatch) | registry entries 1.0.0 | open |
| B-16 | soon-after | M3 | founder | n8n Creator Portal submission | portal status | open |
| B-17 | soon-after | M2 | founder | mcp.so, Context7, Glama and 402 Index listings stale or unclaimed; the fleet re-probes | a receipt for each listing | open |
| B-18 | soon-after | M3 | founder | Search Console change of address to strale.io | change recorded | open |
| B-19 | soon-after | M3 | founder | Better Stack log sink, DEC-20261029-A; `log_sink_shipping:false` live (bus 6497262860) | `true` in platform facts plus the alert, verified by the fleet | open |
| B-20 | soon-after | M3 | fleet | Input validation: seven clean report-mode days, then enforce (the founder sets the variable) | log receipt; a production 400 before payment | open |
| B-21 | soon-after | M3 | fleet | Dependency advisories: 34 from `npm audit --omit=dev`, last triaged 2026-09-04 | new reachability triage receipt | open |
| B-22 | soon-after | M3 | fleet | Promise-audit T3 to T6: provenance contract, chain walk, retention, erasure and dispute, the sync/async threshold note (DEC-22 under 5 s, code 10 s), monthly benchmark | one receipt each; the DEC-22 note | open |
| B-23 | soon-after | M3 | founder | Legal: Dilisense DPA; sign-off on the Privacy retention text | records on file | open |
| B-24 | soon-after | M3 | fleet | Robustness T2: aml-risk-score EU-flag check; unsourced SECRECY list; vendor-terms cadence | production call receipt; sourced list; cadence check in CI | open |
| B-25 | soon-after | M3 | fleet | Robustness T5: scheduled-outcomes check only in sessions; daily-run and inbox rows overdue since 11-07; second-account proof | forced-failure receipt; rows current | open |
| B-26 | soon-after | M3 | fleet | Robustness T6: leases on the money reconcilers; auth-error suspend fires on one failure | receipts | open |
| B-27 | soon-after | M3 | founder | DQ-48 Access2Markets terms contact; DQ-33 six registry test inputs (database) | reply logged; inputs fixed | open |
| B-28 | soon-after | M3 | fleet | Website after-switch checks: old-sitemap redirect sweep, free call from the docs, Umami comparison, retire strale-frontend | sweep receipt | open |
| B-29 | soon-after | M3 | fleet | invoice-extract truthful demo; the authenticated run has been blocked since 09-06 | funded call plus own-record receipt | open |
| B-30 | soon-after | M3 | founder | 24 compliance tool texts waiting for publication approval (#747) | approved and published | open |
| C-1 | nice-to-have | M3 | fleet | Stale GitHub link `petterlindstrom79/strale` in `/llms.txt` and the MCP server card | link points at strale-io/strale | open |
| C-2 | nice-to-have | M3 | fleet | Robustness T2 output as-of dates for aml-risk-score; T4 (3) promotion rule; T7 trims | merged PRs | open |
| C-3 | nice-to-have | M3 | founder | HSTS includeSubDomains (subdomains confirmed); brand kit T5, T7 and the wordmark redraw (spend) | founder's confirmation, then merged | open |
| C-4 | nice-to-have | M3 | fleet | WHOIS through vetted-connect; T18 byte-cap ratchet | merged PRs | open |
| C-5 | nice-to-have | M3 | founder | Platform-hardening T6 Railway config-as-code confirmation | confirmation recorded | open |
| C-6 | nice-to-have | M3 | founder | BUS_GITHUB_TOKEN (bus 6491949026), NTA Invoice Web-API (6491735960), audio transcription (6509759108), GitHub About text (6503456509), Clay run (kill date 13 Dec), npm deprecation of n8n 0.1.x | each answered or dropped | open |
| C-7 | nice-to-have | M3 | fleet | DQ-40 Swiss UID follow-up (email sent 10-26, unanswered); DQ-27 two latency rows (database, founder) | reply logged; rows fixed | open |
| C-8 | nice-to-have | M3 | fleet | Dark Gazette-outage tools #285, #621, #622, #624, #625, #654 | promoted, or added to DEACTIVATED | open |
| C-9 | nice-to-have | M3 | fleet | #4 free-tier doc; #690 and #695 move to IDEAS.md | issues closed | open |
| C-10 | nice-to-have | M3 | founder | Stale branches in #687 wait on the founder's word | branches deleted or kept by his word | open |
| C-11 | nice-to-have | M3 | founder | cto-readiness T7 small close (#730), T8, T9; DEC-20261024-A items 2 and 5 to confirm, or #730 closes when the window ends 30 Nov | confirmation, or the window closed | open |
| D-1 | not-doing | M3 | fleet | #682 (M4 batch 7), superseded by the DEC-20261024-A re-scope and #730 | closed once the founder confirms item 2 | open |
| D-2 | not-doing | M3 | fleet | #905, a finished probe not meant to merge | closed | open |
| D-3 | not-doing | M3 | fleet | #982 nordic-statistics, now listed | closed by the sweep | open |
| D-4 | not-doing | M3 | fleet | #239-241, dark by design (DQ-30: the founder keeps the keys) | marked parked | open |
| D-5 | not-doing | M3 | fleet | #155, #2, #3, #368, already fixed | closed | open |
| D-6 | not-doing | M3 | fleet | #26, #34, #149, #702, outside pitches | closed | open |
| D-7 | not-doing | M3 | fleet | #482, a 09-01 snapshot against strale.dev | re-run on api.strale.io, then closed | open |
| D-8 | not-doing | M3 | founder | DQ-14 item 4 "archive wow-core"; wow-core is active fleet infrastructure | the founder drops it | open |

## Waiting on the founder

Ordered by what moves revenue first. Each line: the item, what only he can do, and its ask.

1. A-4: say whether to narrow "a failed call costs nothing" until A-1 lands (about 5 minutes).
2. A-9 then A-8: one npm session (strale-cli and strale-ai-sdk first publish, trusted publishers, n8n repoint), then the PyPI trusted publishers for straleio, langchain-strale and crewai-strale and a publish go for each; composio-strale 0.1.6 is live (bus 6503452948, 6791877924, 6506170239).
3. A-10, A-11, B-17: fix the Smithery text, open the four directory submissions, claim 402 Index, fix mcp.so and Context7 (bus 6503454276).
4. B-11, B-13, B-12, B-14, B-16, B-15, B-18: Claude connector, CDP address, x402scan wallet, Zapier, n8n portal, MCP registry dispatch, Search Console.
5. A-7, B-3, B-5, B-6, B-27: one database session at the PC.
6. B-27, B-30, B-23: go on DQ-48, approve the 24 compliance texts (the domain-reputation and cz-unreliable-vat-payer texts were approved and published 2026-11-12, #1033), sign off the Dilisense DPA and Privacy text.
7. B-19, B-20, C-6: Better Stack sign-up, the enforce variable after seven clean days, BUS_GITHUB_TOKEN.
8. C-11, C-10: DEC-20261024-A items 2 and 5, and the stale-branch word.
9. gdpr-fine-lookup (withheld, #1019): whether enforcementtracker.com is also a never-list aggregator and goes on the blocklist; recommendation no, since withholding already stops Strale calling it.
10. Lower priority, no revenue effect: C-3 (HSTS, brand kit, wordmark), C-5 (Railway config), C-6 (NTA, audio, Clay), C-7 (DQ-27), D-8 (drop "archive wow-core").
