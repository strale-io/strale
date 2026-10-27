Intent: Answer Petter's question "how does Strale get distribution fastest and most cheaply" with an evidence-based report, a 90-day experiment plan and draft listing texts; docs only, nothing sent, posted, published or signed up for.

Branch: docs/distribution-strategy (worktree ../strale-wt-distribution). Full mode. Draft PR opened for review.

## What landed
- `docs/research/2026-10-27-distribution-strategy.md` — the report: one-page summary, channel scorecard, attribution gaps, listing fixes, integrations section (scope added by the orchestrator mid-session), 90-day plan D0–D10, nine decisions for Petter, conflicts, risks.
- `docs/research/2026-10-27-distribution-strategy-sweeps/` — five evidence files from read-only research agents (directories, competitors, frameworks, payments, integrations), with per-claim links.
- `docs/company/drafts/distribution/01–04` — DRAFT listing texts, outreach emails, posts, and listing texts for Zapier, n8n and Clay.
- `docs/company/IDEAS.md` — five inbox ideas.

## Review
An independent read-only reviewer agent (same provider, separate context) returned 3 blocking, 12 should-fix and 7 nit findings. All were addressed: GOALS.md 2026-10-26 revenue reading replaces the August figure; the "only channel that produced a customer" inference removed; the free allowance and one-way publishes moved to Petter (§9 items 5 and 7); Discord dropped; wallet for directory sign-in specified; typed counts and unqualified "official" removed from drafts; AI-generated label and partial billing added to the invoice action; compliance-gate tension put to Petter (§9 item 8); experiment ids renamed D0–D10 to avoid GOALS E1–E4; day-90 target tied to M1; session estimate given with low confidence.

## Next action for whoever continues
1. Petter answers §9 (nine yes/no items).
2. D0 and D1 are Claude's now and need no answer: tag our URLs; add `X-Strale-Client` to integration packages on next release; `signup_src` capture (DEC-20260504-C deploy verification); rewrite source texts (GitHub description, server.json, context7.json, strale.dev llms.txt, agent card, mcp.json, SKILL.md, x402-listing.md); add MCP tool titles and annotations; upstream PRs fixing the Pipedream and Activepieces integrations that call removed routes (DEC-20260422-A preflight first).
3. D2 (x402 metadata in `x402-gateway-v2.ts`, v2 paths in `/x402/catalog`) is also Claude's.

## Not done / blocked
- Three merged remote branches (PRs #763–#765) could not be deleted: git proxy returned 403. Listed as §9 item 9.
- No production data read; usage figures are public-venue counts or GOALS.md readings.
