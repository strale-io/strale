---
doc_type: plan
authority_scope: none
date: 2026-11-06
status: draft
provenance: regenerated 2026-11-06 from repository evidence after the original was lost with an archived session
decisions:
  - handoff/_general/from-code/2026-11-06-petter-decisions-growth.md
  - DEC-20260815-A
  - DEC-20261027-B
---

# Revenue plan, 4 weeks (7 Nov to 6 Dec 2026)

This plan was rebuilt from `origin/main` 69c16913 and keeps the original order. No production database was read.

**Shorthand used in the tables:**
- **D1 to D11** are the numbered decisions in `handoff/_general/from-code/2026-11-06-petter-decisions-growth.md`.
- **dist T#** and **PA T#** are the tracks of `docs/programs/distribution/` and `docs/programs/promise-audit/`.
- **REC:** is a row in `docs/company/RECURRING.yaml`.
- **Check-in** means `handoff/_general/from-code/2026-11-06-checkin-morning.md`.

## 1. Baseline and target

**Figures are kept out of this file.** Petter decided on 2026-11-06 that the full plans live outside the repository because they hold business numbers, and this repository is public. The full plan, with its figures, was delivered to him outside the repository. Weekly revenue, payers and concentration are read from `docs/company/GOALS.md`, the daily briefs and, once it runs, the daily business-summary email.

**What the baseline shows, without figures:**
- Last complete week (10-26) was the best on record. This week will close well below it.
- Most of last week's rise came from the largest payer's daily spend; two one-off bulk days added most of the rest (GOALS.md, entry of 2026-11-01; check-in).
- One payer's steady daily spend is now almost all of this week's revenue. Concentration is moving away from the M1 limit, not towards it.
- In the last complete week a few other payers bought on more than one day (check-in). The repeat-payer revenue share that M2 measures is not recorded: unknown.
- **Free use:** 11 free tools, with the monthly per-IP limit given in `/v1/platform/facts`. The free allowance has been live since 10-28; no free-caller count has been recorded since: unknown.
- **Margin:** it cannot be read for the six best sellers. `mx-lookup`, `weather-lookup`, `fear-greed-index`, `domain-age-check`, `forex-history` and `exchange-rate` have an unknown-cost share of 1 (check-in). `toolMargin` in `apps/api/src/lib/metrics/commercial.ts` needs 20 known-cost calls, so margin will read only from new calls.

**Target.** M1 (GOALS.md) by 6 December: low confidence. Reaching it needs everyone except the largest payer to grow roughly as much as the largest payer spends today. The plan aims at what M1 depends on:

| By the week of 11-30 | Confidence |
|---|---|
| Daily business numbers and the due-list running, independent of any account (robustness R5) | high |
| No listed tool that can only refuse; FX tools fail under 5% of paid calls, excluding caller input | moderate |
| D1 to D8 executed, each with a receipt | moderate (Petter's clicks) |
| Weekly revenue in weeks 3 and 4 at the level of the full plan's floor | moderate (one payer) |
| The M1 payer count reached, with repeat buyers among them | low |
| Largest payer's share clearly lower than today | low |

## 3. Week by week

**Owners:** S = a session, P = Petter, P-click = a session prepares and Petter clicks.

### Week 1 (7 to 15 Nov): restart measurement

| Item | Why | Owner | Done when | Link |
|---|---|---|---|---|
| A daily business-summary email as an API job: revenue, payers, top share, x402 volume, top tools, paid failures, free callers | Routines tied to one account miss most days. Item 1 of `2026-11-06-orchestrator-state.md` has not started | S | The heartbeat shows 5 of 7 days, the email equals `commercial-brief`, and production is checked (DEC-20260504-C) | REC:business-summary-email |
| The overdue weekly review, and GOALS.md updated for weeks 10-26 and 11-02 | Last run 2026-08-23 | S | `last_run` is set and nothing is overdue | REC:weekly-review |
| Due-list rows: a weekly free-caller read, a weekly listings read, and an FATF recheck after each plenary | dist T11; the FATF note in `2026-11-06-strale-master-takeover.md` | S | `handoff:test` passes | dist T11 |
| The x402 settlement-drop alert, redesigned with a per-payer burst cap | #950 is in draft after three review rounds failed | S | The review passes, and a replayed outage still alerts | orchestrator state |

### Week 2 (16 to 22 Nov): stop leaks

| Item | Why | Owner | Done when | Link |
|---|---|---|---|---|
| `exchange-rate`: fix the timeout, then add a terms-checked source for NGN, KWD, BHD, JOD, KES and BDT. Also `currency-convert` (34 failures) and `forex-history` (16, Frankfurter 522) | `exchange-rate`: 94 of 302 paid calls failed (31%), of which 31 were timeouts and about 50 were unsupported currencies. Third run in a row (check-in) | S; P if the source has a cost | Under 5% fail over 7 days | brief 2026-11-06 §4 |
| `domain-age-check`: 16 of 213 failed (thrown errors, so uncharged), cause `unverified:` | Check-in | S | Cause recorded, failures halved | robustness R4 |
| Robots-disallowed sources on listed tools: `eu-trademark-search` (€0.50) refuses every paid call; `customs-duty-lookup` (€0.20) has an Access2Markets fallback (`customs-duty-lookup.ts:50-57`) and `container-track` (€0.05) loses only its Maersk path | Check-in (paying-failures and robots findings). All three still listed at 23:33 Swedish time on 11-06 (`/v1/capabilities/<slug>`) | S: make provenance and limitations say what each reaches (robustness R4); delisting `eu-trademark-search` is Petter's (DQ-42, §6) | The weekly-drift robots sweep passes; no listed tool refuses every call | D8, DQ-42, #747, robustness R4 |
| Swallowed failures: build wave 2 on Claude; ship wave 3 (rows 26, 27, 29, 34); then the lint, the perturbation replays, and counting and refunding past charges | 36 paid tools break "a failed call is not charged" (`docs/research/2026-11-06-customer-promise-inventory.md`, P-001). Wave 1 fixed 13 audit rows (#939; row 13 by #938) | S, with independent review | PA T1 exit criteria, each with a receipt | PA T1 |
| Declare the free upstreams zero-cost (mechanism `unverified:`; robustness R7) | Margin cannot be read | S | All six have 20 or more new known-cost calls | check-in, next-session item 4 |

Wave 2 was briefed to Codex on 2026-11-06, which promise-audit rule 5 does not allow ("money paths ... are built by Claude"). The Codex dispatcher confirms it never received or ran it; the Strale master withdrew it on 2026-11-06 (recorded in `handoff/_general/from-code/2026-11-06-strale-master-takeover.md`), and wave 2 is built by Claude.

### Week 3 (23 to 29 Nov): open listings

Decided items can land earlier; this week closes each one with a receipt. "Audit" = `docs/research/2026-11-06-distribution-listings-audit.md`.

| Item | Why | Owner | Done when | Link |
|---|---|---|---|---|
| strale.dev to 301, and the Search Console change of address | It answers 302 (audit H) | P-click | curl shows 301 | D1, dist T2 |
| PyPI trusted publishers, then four releases (and composio in `release-pypi.yml`) | PyPI pages carry strale.dev, some with stale counts (audit rows 17 to 20) | P-click, then S | A smoke receipt for each | D2, dist T12 |
| The first publish of `strale-ai-sdk` and `strale-cli`, then the vercel/ai registry PR | Fixes merged (#955); not on npm | P publishes, S tests | Smoke receipts | D3, dist T7 |
| Zapier and n8n submissions | Both built | P-click | Submitted (n8n review takes up to 4 weeks) | D4, dist T6, T9 |
| The Claude connector directory, eligibility first | It may need a paid plan (dist T5) | S checks, P-click | Submitted, or back to P if it costs money | D5, dist T5 |
| The Coinbase Bazaar form | dist T4 has no contact route | P-click | Submitted | D6, dist T4 |
| The 402 Index domain claim (route plus a token in Bitwarden), and fixes to Smithery, Glama, mcp.so and Context7 | 168 endpoints are unverified; five listings carry retired claims (audit rows 2, 3, 4, 7, 10) | S builds the route; P-click signs in | The re-fetched listings pass `claims.yaml` | D7, dist T2 |
| The EUIPO account and the Japan NTA form | DQ-42 and DQ-43 answered yes; the PC forms brief is not written | P-click | Submitted | D8 |

### Week 4 (30 Nov to 6 Dec): conversion

| Item | Why | Owner | Done when | Link |
|---|---|---|---|---|
| Grow paid use of the Serper tools: x402 metadata and examples, and a weekly read of calls against credits | D9; about 5% of a pack was used (brief 2026-11-01) | S | Above the week-1 baseline | D9, dist T3 |
| Put the four DQ-41 tools on sale: the free three self-promote; `invoice-counterparty-check` needs a promotion path | Dark-launched (DQ-41, 2026-11-06 update) | S | Listed, or the reason recorded | DQ-41 |
| New payers by source tag, from listing arrival to first paid call | Tags are live (dist T1) | S | A weekly rollup | dist T1, T3; GOALS E1, E2 |
| o11 integration through a normal account, with no agreement (what o11 is: `unverified:`) | D11 | S, P-click | Live, with the 90-day hold kept | D11 (Petter's account click, listed in §6) |

D10 (`polish-company-data` labelled `algorithmic`) is done and live (#949).

## 4. Concentration risk

One payer is almost all of this week's revenue (check-in). The plan grows the others rather than shrinking that payer:

- **No outreach** to that payer or to anyone identified from usage (CHARTER customer-data boundary; DQ-21).
- **Reliability first.** That payer's basket of FX and domain checks fails most often (briefs 2026-11-01 and 2026-11-06), so week 2 is also retention.
- **The share rises at first.** Closing the currency gap serves the largest payer, so its share goes up before it comes down. We accept that, because income comes before the ratio.
- **New payers come only through anonymous channels:** listings, x402 discovery, the free allowance and the DQ-41 tools.
- **The daily email shows the others' revenue**, so a second habit, or its absence, shows within a week.

## 5. Kill or continue

**End of week 2 (22 Nov).** Continue if:
- the email ran on 5 of 7 days and matched the brief;
- no listed tool only refuses;
- FX failures are under 10%.

If only the currency gap remains, take the source question to Petter. If the largest payer's weekly spend falls well below its current level, review the reliability of its basket before doing more listing work, with no contact.

**End of week 4 (6 Dec).** Continue towards M1 if the others reached the full plan's week-4 threshold in week 3 or week 4. If they stayed near today's level in both, stop new listing work beyond what each track's own rules require, and spend the next four weeks on conversion through the channels that produced paid calls. Each listing's kill rule stays in its own track.

## 6. What needs Petter

1. **Already decided, needs his clicks:** D1 to D8, the D11 account click, and running the narrow MCP publish workflow (dist T8).
2. **Open, asked in chat on 2026-11-06:** whether his yes to DQ-42 covered its recommended option 3 (delist `eu-trademark-search` now and rebuild it on the EUIPO API) or only the account. If yes, a session delists it; if no, it stays listed until the API rebuild.

Not escalated: the currency gap. A session first searches for a source whose terms permit resale (DEC-20261023-A); only if every option costs money does it come to Petter, with a priced recommendation against the weekly envelope in BUDGET.md.
