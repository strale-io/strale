# Weekly free-caller and listings checks

Run the two `docs/company/RECURRING.yaml` jobs together when due. Before starting, check open PRs and today's handoffs for a run already in progress. After completing each check, update its own `last_run` and evidence in the same PR. These are session due-list checks, not promises of an unattended scheduled run.

## Free callers

Use the read-only operator role (`openOperatorDb`, verifying `transaction_read_only=on`) and the canonical `monthlyFreeFunnel` implementation in `apps/api/src/lib/metrics/commercial.ts`. Keep financial and commercial aggregates in the private campaign workspace, not this public repository. Export no transaction rows, payer identities, IP hashes, customer inputs or raw client metadata.

Compare the last two complete UTC Monday-to-Monday weeks. Also record the rollout calendar window from 2026-10-28 and the trailing 90-day window. Report completed anonymous free calls, distinct IP-hash proxies, first-free signup cohorts and their observed paid conversions. State the end time for every window. Keep canonical totals and an explicitly labelled known-QA exclusion separate; never silently change the population. Do not sum distinct counts across monthly slices.

IP hashes are not people: shared networks, hash rotation, bots and untagged QA limit interpretation. A free-to-paid IP match is indicative, not proof of acquisition or causation. A partial rollout period is not comparable to the full 90-day baseline.

D10's baseline is two callers in 90 days; its success definition is ten comparable callers and at least two paid conversions. Preserve the 2026-12-12 review (45 days after rollout). If callers have not increased, follow the existing reviewed procedure to revert allowance and matching copy together. A weekly observation does not close the experiment or authorize a pricing change.

## Listings

Read the distribution track register and the latest listings audit. Check authoritative current package metadata and the current official MCP registry entry, then Smithery (both known records), Glama server and connector, mcp.so, Context7, 402 Index, PulseMCP and Docker. Check known external submission PRs separately. Use honest identification when fetching public pages and respect source restrictions.

For each, save the URL, UTC observation time, response status, version where applicable, and visible stale description/domain claims. Paginate API results and filter to the actual Strale hostname before counting; search results can include other providers. Distinguish a prepared change, an open submission, a live listing, and verified ownership. A 404 on one guessed catalogue URL does not establish that Strale is absent everywhere. Authenticated application status without a receipt remains unverified.

Where available, record npm downloads for the same complete week. Label rolling PyPI windows separately; flag inconsistent counters instead of comparing them. Downloads, catalogue index sizes and listing counts are not customers. An unavailable usage counter is unknown, not zero. Attribution may use bounded existing source labels and canonical populations only; do not turn anonymous telemetry into outreach or infer channel revenue from downloads.

Correct stale internal status against the evidence. List outstanding external corrections without sending, publishing, claiming ownership, changing accounts or spending unless separately authorized. Preserve the founder's deferred ChatGPT business verification and paid connector verification.

FATF/reference-data freshness already runs through `config/reference-data.yaml` and the weekly-drift workflow; inspect the due register rather than adding a second job or resetting its dates without checking the source.
