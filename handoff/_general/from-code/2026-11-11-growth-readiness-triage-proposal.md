Intent: Save the growth-readiness triage and roadmap proposed to Petter on 2026-11-11, so another account can pick it up cold.

**Approved 2026-11-11.** Petter answered "go with your recommendations" (strale-io/strale#1011). The single list, the roadmap dates and the bar for new list-A items now live in `docs/programs/GROWTH-READINESS.md`, linked from `docs/programs/README.md`; that page is the current version and this file is the proposal as made. Of the stale lines below, the brand-website and revenue-plan lines are corrected in the same PR; the cto-readiness T16 item 3 line was re-checked and is not stale (see the note under it).

## Resume here

Petter asked on 2026-11-11 (about 08:40 Swedish time) for (1) a correct list of outstanding issues, split into serious and fix-along-the-way, and (2) a roadmap to the point where the product can be pushed for growth. He said hardening must continue but must stop crowding out revenue, and that legal work that can be fixed along the way should not block. The Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw, account 1fg) answered in chat with the triage below and ended: "Unless you object, I'll write this as one page in the repository (no revenue figures), correct the stale register lines in the same PR, and add the bar as the rule for new items." The account then hit its weekly limit. Nothing below is decided.

## Count

Six program registers hold 59 tracks; 21 done, 38 open. Six decision-queue items are open (DQ-48, DQ-41, DQ-40, DQ-33, DQ-27, DQ-14).

## Stale lines found (as found)

- brand-website T6 next_action says "Nothing is published"; SWITCH-OVER-READINESS.md says "not ready to switch today". Checked 2026-11-11: https://strale.io answers 200 and strale.dev answers 301 to strale.io with path and query kept.
- docs/strategy/2026-11-06-revenue-plan.md week 1 lists the x402 settlement-drop alert as a draft (merged as #950) and week 3 lists the strale.dev 301 as pending.
- cto-readiness T16 blocker item 3 lists the Terms and Privacy rewrites as open; the four stale sentences were approved and corrected under DQ-45 on 2026-11-05. The "charged only on success" claim and Terms at signup remain.
  - Re-checked 2026-11-11, not corrected: item 3 names three rewrites (Privacy retention wording, the "charged only on success" claim, Terms at signup, from `docs/remediation/PACKAGE-GRAPH.yaml` WP14 `checkin_b`). DQ-45's four sentences (Terms §2 twice, Terms §7, the Privacy Voyage AI row) are none of them, so all three remain open.
- Not every line was audited. Expect more.

## Proposed triage

A. Must close before a growth push:
1. promise-audit T1: some paid tools can charge for a failed call. Waves 2 and 3 remain, then counting and refunding past charges. Built by Claude (money path).
2. promise-audit T2, scoped small: reference answers for sanctions-check and pep-check (listed names must be found). Not started.
3. apps/web/src/pages/signup.astro shows no Terms line while the backend stamps tos_accepted (cto-readiness T16 item 2). One sentence; Petter approves the wording.
4. Tools on sale that cannot deliver: the customs-duty repair and the four DQ-41 tools wait on the database write key on Petter's PC.
5. Distribution clicks (distribution T2, T4 to T9, T12): PyPI trusted publishers and four releases, first npm publish of strale-ai-sdk and strale-cli, Zapier, n8n, Smithery, the Coinbase form, the 402 Index claim, the Claude connector. Sessions prepare and smoke-test.

B. Fix along the way: platform-hardening T6 enforce mode and T8 log sink; cto-readiness T17 and T18; robustness T2 to T7; promise-audit T3 to T7; the Dilisense role and DPA (send one email, do not wait); DQ-40 and DQ-48.

C. Park: cto-readiness T7, T8, T9; brand-website T5, T7 and the wordmark redraw; DQ-33, DQ-27, DQ-14 (validity not rechecked).

## Proposed roadmap

1. Sellable, by about 2026-11-22: close A1, A3, A4; scope A2; write the single list and correct the stale lines.
2. Listed, by about 2026-11-29: one click session by Petter for A5; sessions test each published package.
3. Push, December: weekly new payers per channel, drop channels that produce none; hardening at a capped share of sessions.

Proposed bar: a new issue enters list A only if it charges wrongly, gives a wrong compliance answer, leaks data or takes the service down.

Revenue figures are not in this file (Petter, 2026-11-06). The revenue plan is run from Petter's PC Codex lane; this proposal sets the bar and does not replace that plan.

Next authorised action: independent review of PR #1011 in a separate context, then label ready-to-merge | Owner: Strale master | Blocker: none
