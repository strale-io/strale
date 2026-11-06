Intent: record Petter's decisions of 2026-11-06 (orchestrator session session_01CR5YPsTtEwE3tRQtvTzerw) on the revenue plan and the robustness plan, and the new rule for recurring work.

## Decisions (Petter, in session, 2026-11-06 evening)

1. **strale.dev to strale.io permanent 301, and the Search Console change of address:** yes, tonight. The click-paths arrive by the 22:40 reminder.
2. **PyPI trusted publishers** for straleio, langchain-strale, crewai-strale and composio-strale: yes. A session sends the click-paths.
3. **First publish of `strale-ai-sdk` and `strale-cli`:** yes, after the Distribution PR Integrity checks (DEC-20260422-A) pass, then the usual one-click release approval.
4. **Zapier and n8n marketplace submissions:** yes. A session prepares each form up to its final button. Petter submits and accepts the terms.
5. **Claude connector directory:** yes, if it needs no new spend. Check eligibility first, and come back to Petter if it would cost money.
6. **Coinbase CDP Bazaar featured tier:** through Coinbase's official form. A session fills it up to the final button, and Petter submits.
7. **402 Index domain claim and the directory listing fixes** (Smithery, Glama, mcp.so, Context7): yes. Click-paths go to Petter, and a PC job stores the 402 Index token in Bitwarden.
8. **DQ-42 (EUIPO free account) and DQ-43 (Japan NTA form):** yes, both. A session prepares them, and Petter clicks.
9. **Serper:** keep the prepaid credits (Petter bought 50,000 credits on 2026-11-05, the minimum pack). The focus is more paid use of the Serper-backed tools, not cutting the cost.
10. **`polish-company-data` label:** correct it from `ai_generated` to `algorithmic` once a re-check confirms no model call on any path. This widens a public claim, and Petter approved it.
11. **o11:** integration only, through a normal account. No signed agreement, and the 90-day partner-agreement hold stays.

## Recurring work: never rely on account-bound routines

Petter, 2026-11-06: Claude Code routines are tied to one account. He rotates three accounts, and each is active about 2 to 2.5 days, so routines miss most of the time. Recurring work runs in one of three account-independent ways:

1. **Production jobs in the API**, for deterministic numbers and alerts. One example is the existing daily data-source summary email. A daily business-summary email (revenue, payers, x402 volume, top tools) is to be added the same way.
2. **Scheduled GitHub Actions in the repository**, for repo and catalogue checks: drift, freshness, catalogue accuracy and the cost ledger.
3. **A due-list in the repository, for judgment work**, such as the inbox, the weekly review and follow-ups. It records each job's cadence and last run. The first session on any account runs whatever is overdue, so a job runs late rather than not at all.

A paid Claude Code GitHub Action with an API key would also work, but it is a spend decision and is not needed now.

## Next actions (owner: whichever orchestrator session runs next)

- **Publish the four finished DQ-41 flagship tools** (`company-status-check`, `entity-resolve`, `invoice-counterparty-check`, `eurostat-data`) through the Onboard capability workflow.
- **Restart measurement:** the daily business-summary job, and the due-list with a session-start check.
- **Fix the x402 settlement-drop alert**, whose baseline swallows one-off bursts.
- **Re-check the FATF lists in `aml-risk-score`** against fatf-gafi.org. They have been unchanged since 2026-03-18.
- **Cost trims inside delegated authority:** the idle Chromium memory, and a test-call retention check on Postgres (read-only first).
- **Codex builds in flight:** `codex/swallowed-failures-wave2` and `codex/url-to-markdown-parse-bound`. Run an independent review, then open the PRs.
- **The programme files.** The full revenue and robustness plans live outside the repo, because they hold business numbers. Their non-sensitive tracks become programme files.
