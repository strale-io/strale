Intent: add a read-only ops-read check, `orphan-debit-trace`, that explains the two open items from the first A-7 run (`archive/receipts/2026-11-16-check-a7-money-path-ops-read.json`): purchase debits whose reference matches no call, and the gap between 27 no-reference debits and Q2b's 23 pre-WP3 solution calls.

Built by a Claude builder lane (the Codex route needs a branch this session cannot create), reviewed independently in a separate context. Builder report with indexes, test names and fail-before evidence: `docs/lanes/claude/orphan-debit-trace-report.md`.

The check counts debits and distinct calls apart, so a call charged twice is visible (`debits_sharing_a_call`), and reports whether debits on failed or partial calls were refunded (`matched_not_completed`). It returns no ids or free text; the privacy table in `docs/lanes/pc/a7-bundle-queries-brief.md` still applies before any receipt.

Not done here: the production run and its receipt (after deploy), and any refund. Refunds wait for the founder's refund-caps decision (proposed to the wow-core master on 2026-11-16).

Next authorised action: after deploy, run orphan-debit-trace on production through bws, write the receipt, and state the refund owed | Owner: Strale master | Blocker: none (any refund waits for the refund-caps DEC)
