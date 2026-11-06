Intent: orchestrator state at the account switch on 2026-11-06, about 21:10 Swedish time. The next Strale master picks up from here. Session: session_01CR5YPsTtEwE3tRQtvTzerw.

## Resume here

1. Read `handoff/_general/from-code/2026-11-06-petter-decisions-growth.md`. It holds Petter's 11 decisions and the rule for recurring work: never rely on account-bound routines.
2. Work through the open PRs, the Codex branches and the waiting items below, in that order.

## Open PRs (this session's)

| PR | Branch | State | Next |
|---|---|---|---|
| #949 | fix/polish-company-data-algorithmic | Lane item 4 (block 0146). Checks green. | Confirm the lane's independent review passed (PR body), then let auto-merge run. After deploy, `GET /v1/capabilities/polish-company-data` shows `algorithmic`. |
| #950 | fix/x402-settlement-median-baseline | Lane item 3. Checks green. | Confirm its review, then merge. |
| other lane PRs | see the lane report below | | |

## Codex branches (dispatched through `session_01CR5YPqf1vE99XkvfLYCnEw`)

| Branch | Brief commit | Result landed? | Next |
|---|---|---|---|
| codex/swallowed-failures-wave2 | 4f342c01 | Not at 21:05 | When the head moves past the brief, run an independent adversarial review (billing path). Fix, then open the PR with auto-merge. The run limit is 3: corrected briefs are `-2` and `-3`. |
| codex/url-to-markdown-parse-bound | 627d8402 | Not at 21:05 | Same, as an untrusted-input review. Lessons from company-enrich: jsdom must never parse raw publisher markup unbounded, and parse time is what matters, not size. |
| codex/company-enrich-metadata, -2, -r2 | (merged via #947) | Done | Stale branches. Deleting them returns 403 from sessions; Petter or the dispatcher can delete them. |

## Lane (in-session background agent, items 1–7 of the decisions file)

It was told to commit and push all work in progress, and to end each PR body with "Resume here" and "Next authorised action" lines. Its items:

1. Daily business-summary email (production job).
2. `docs/company/RECURRING.yaml` due-list, plus a check at session start.
3. The x402 alert baseline (#950).
4. The polish label (#949).
5. FATF lists in `aml-risk-score`.
6. Integrity checks on `strale-ai-sdk` and `strale-cli`.
7. PC browser-forms brief on `lanes/pc-forms-1106`.

Check each item's PR for its "Resume here" line. Item 7, once its PR exists, is launched as a PC job with the fixed PC prompt (wow-core #268).

## Waiting on Petter (he has the click-paths)

- **strale.dev 301 and the Search Console change of address.** The 22:40 reminder fires into this session only, so the steps are repeated below.
- **PyPI trusted publishers** for straleio, langchain-strale, crewai-strale and composio-strale. Then add composio-strale to `release-pypi.yml`.
- **Directory listings:** mcp.so, Context7, Smithery, Glama, and the n8n Creator Portal. See `docs/research/2026-11-06-distribution-listings-audit.md`, sections A, B, D, E and G.
- **Datacircle note.** A draft in Outlook Drafts tells Wayne that company enrichment can be re-run. Petter sends it.

The strale.dev 301 steps:
1. In the Cloudflare dashboard, open the strale.dev zone, then Rules, then Redirect Rules.
2. Edit the rule that sends traffic to strale.io, change the status from 302 to 301, and save.
3. In Google Search Console, open the strale.dev property, then Settings, then Change of address.
4. Choose strale.io (it must be verified first), validate, and confirm.

## Mine, not started (do these next, inside delegated authority)

- **402 Index domain claim.** Petter said yes. It needs a route on api.strale.io that serves the token file (a PR), plus a PC job that stores `STRALE_402INDEX_CLAIM_TOKEN` in Bitwarden. Steps are in audit section C.
- **`invoice-counterparty-check`** (paid_prepaid, a DQ-41 flagship). It can never earn a harness green week, so it stays dark. Design a promotion path based on real-call or piggyback evidence. The other three DQ-41 tools are free to test and should promote themselves.
- **Cost trims.**
  - Chromium sits at about 3.7 GB of idle memory on Railway. Cap or trim it, which is reversible.
  - Postgres retention of harness calls: run a read-only size check first.
  - Verify the model-price claim before switching LLM roles.
- **Serper.** Keep it, and grow the paid calls on Serper-backed tools (Petter, 2026-11-06).
- **Robustness programme, tracks R1–R7.** The full plan is outside the repo because it holds cost and revenue figures. Turn its non-sensitive tracks into `docs/programs/robustness/` with gates.
- **Revenue plan.** Its 4-week plan, also outside the repo, starts with: restart measurement (lane item 1), stop leaks, open listings, then conversion. Petter's decisions are recorded.

## Done today (for reference)

- **Merged and verified live:**
  - releases;
  - x402 example inputs (#932);
  - the domain-reputation text;
  - billing wave 1 (#939, 13 tools);
  - tech-stack (#938);
  - nordic-statistics (#936, onboarded, dark-launched);
  - claims fixes (#940);
  - phone fictional ranges (#942);
  - the ESMA register (#943, #944, #946; both vasp tools are ready);
  - company-enrich metadata (#947, after 9 review rounds);
  - the outbox (#945);
  - the decisions record (#948).
- **Inbox:** read through the connector. The Microsoft 365 connector now reaches petter@strale.io. Petter sent four drafts; OUTBOX rows are updated.

## Not done, and known

- **The url-to-markdown parse risk** is in Codex, above.
- **Rows 26, 27, 29 and 34** of the swallowed-failures audit wait for the degraded marker (wave 3).
- **Tilja Railway volume deletions** around 15:11 on 2026-11-07 are Petter's call. They belong to another project.
