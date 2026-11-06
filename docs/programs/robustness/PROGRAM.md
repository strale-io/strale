---
doc_type: program-plan
authority_scope: none
program: robustness
status: active
started: 2026-11-06
owner: session
---

# Robustness program

Execution record for the robustness plan Petter and the orchestrator wrote on
2026-11-06. That plan lived only in the session's scratchpad and was lost when
the session was archived; this file rebuilds its non-sensitive tracks from what
the repository records (orchestrator state, Petter's decisions of 2026-11-06, the
check-in and master-takeover records of the same day, the 2026-10-27 architecture
review). Cost and revenue figures stay out. The program creates no authority and
activates no candidate project document.

Robustness here means: one bad input, one stale list, one false alarm, one dead
vendor or one rotated account does not turn into a wrong answer, a silent outage
or a missed failure. It owns only what no other program owns.

## Resume here

Read [tracks.yaml](tracks.yaml), then the active track's `next_action` and
`resume_file`. R1 (T1, untrusted-input bounds) is active. The brief at commit `627d8402` was
queued to the Codex dispatcher on 2026-11-06 at 23:46 Swedish time as task
`task_e_6aee58cc7388832998dd61ec621b3a41`, and its result lands on
`codex/url-to-markdown-parse-bound`.

The schema's `gate` field is the M2 milestone gate and is `none` on every row.
Each track's gate, the concrete evidence that it is done, is its `exit` list,
and every exit is met by a receipt under `archive/receipts/` cited in
`evidence`.

| Register ID | Track | Why this order (harm) |
|---|---|---|
| T1 | R1: Untrusted-input bounds | One anonymous free-tier call to `url-to-markdown` can hand jsdom hostile markup; the parse is synchronous and blocks the whole API process, so every customer is hit at once. |
| T2 | R2: Data currency of hard-coded reference lists and vendor terms | A stale list gives a wrong compliance answer in the quiet direction on a paid tool. Until #956 merges, five EU-listed countries score low and standard. |
| T3 | R3: Alert and signal correctness | A false alarm, or a watch that is always red, hides the next real failure (LESSONS F1, the largest family; CHARTER: repair the instrument first). |
| T4 | R4: Listed tools that can only refuse | A listed tool whose source refuses fails every buyer who picks it, and stays visible in directories. The calls are not charged, so the harm is failure, not money. |
| T5 | R5: Account-independent recurring work and monitoring | Without it, measurement and judgment work stop for most days of each account rotation. The harm is delay, not a wrong answer. |
| T6 | R6: Single points of failure and vendor concentration | Latent: one Anthropic outage takes out about 30% of the catalogue, but the vendor tower already suspends tools cleanly. |
| T7 | R7: Resource and cost trims | Money only, inside the envelope, and every trim is reversible. |

## Owned elsewhere (pointers, not duplicates)

| Item | Owner |
|---|---|
| Swallowed upstream failures: wave 2 (billing path, so built by Claude under promise-audit rule 5; the Codex brief `4f342c01` was withdrawn and never ran), wave 3, rows 26, 27, 29 and 34 waiting on the degraded marker, the catch-handler lint, replay perturbations, past-charge measurement | promise-audit T1 |
| `aml-risk-score` recommending simplified due diligence for EU-listed countries (#956 review nit 1); compliance reference answers | promise-audit T2 |
| Published availability and speed numbers | promise-audit T5 |
| Per-tool answer-quality benchmark | promise-audit T6 |
| Input-schema validation (`INPUT_VALIDATION_MODE` to enforce), robots.txt and SSRF fetch hardening | platform-hardening T6 (H6) |
| External log sink | platform-hardening T8 (H8), founder-gated |
| Deploy, job-freshness and package-contract watches (built) | platform-hardening T1 (H1), done; their false signals are R3's |

## Rules

1. **Evidence is a receipt.** A measurement, sweep or replay is written once with
   `npm run receipt` and cited by path; a count in prose is not evidence
   (LESSONS F5). Anything this plan states without a receipt is marked
   `unverified:` in the register.
2. **Fail-before for every fix.** A fix that changes behaviour carries a test that
   fails against the unfixed code (DEC-20260504-A), shown without `git stash`.
3. **Recurring work never relies on an account-bound routine.** It runs as a
   production job, a scheduled GitHub Action, or a row in
   `docs/company/RECURRING.yaml` (Petter, 2026-11-06).
4. **Bulk and deploy protocols apply as written.** A retention or cleanup change is
   a bulk operation (DEC-20260504-B: audit the backlog and throttle or pre-drain).
   A boot-time or scheduled change gets its production effect queried after
   deploy (DEC-20260504-C).
5. **Authority.** Delisting, quarantine, promotion, quality gates, reversible
   resource trims and spend inside EUR 50 a week are the session's
   (CHARTER). These stay Petter's:
   - a new vendor commitment or recurring cost;
   - final sign-up clicks, terms and 2FA (DEC-20261027-C);
   - publishing a compliance or methodology claim, in either direction.
6. **Codex builds only non-sensitive code** (DEC-20261101-A). Each Codex branch
   gets an independent Claude review in a separate context before its PR. The
   dispatcher runs no code from the branches it handles.

## Execution and closure

R1 runs first. R2 to R7 are queued with no dependency between them. One track is
active at a time, as the checker requires, but small items such as merging #956
(R2), the Serper post-deploy check (R3) and the robots delist decisions (R4) can
run in parallel lanes. Each one's status changes only in the PR that lands its
receipt.

A track closes when every exit line has a receipt in its `evidence`. The program
closes when R1 to R4 are done and R5's recurring rows have each run once from a
second account. The recurring checks then continue under `RECURRING.yaml`, not
under this register.
