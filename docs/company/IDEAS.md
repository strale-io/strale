# Ideas

Append-only inbox. Not a task list (that's `docs/company/DECISION-QUEUE.md`)
and not research (that's `docs/research/`, see its `README.md`). One line
per idea, oldest first, never edited in place — a status change is a new
line, not a rewrite of the old one.

Line shape, checked by `npm run research:check`:

```
- YYYY-MM-DD · <status: inbox | considered | promoted | dropped> · <one line> [· → <research file or DEC id>]
```

- `inbox` — captured, not yet looked at.
- `considered` — looked at, no action yet (parked, not forgotten).
- `promoted` — became real work. Must name a target: a `docs/research/*.md`
  file name or a `DEC-*` id that exists.
- `dropped` — looked at, decided against. A one-line reason belongs in the
  text field, not a separate line.

## Inbox

- 2026-09-26 · inbox · US private-company lookup: on 2026-09-18 the largest x402 buyer sent 114 US company names to us-company-data and 103 were correctly refused (SEC EDGAR covers public filers only; the names were mostly private software firms) — find a licensed source for private US company basics that fits DEC-20261023-A (formerly DEC-20260428-A)
- 2026-10-27 · inbox · A "watch this company" endpoint that calls the customer back when a register status changes, so re-screening stops depending on the customer's scheduler (build only after re-check templates show recurring use) · → 2026-10-27-distribution-strategy.md
- 2026-10-27 · inbox · An open-source reference agent (supplier check or lead research) that runs on Strale end to end, the pattern GPT Researcher used for Tavily · → 2026-10-27-distribution-strategy.md
- 2026-10-27 · inbox · A one-line agent install: a hosted SKILL.md at a stable URL plus "set up <url>" prompt, as Delegate and AgentCash do · → 2026-10-27-distribution-strategy.md
- 2026-10-27 · inbox · Serve MPP alongside x402 on the same routes (mppx wraps an x402 server) to reach Stripe's directory and the mpp.dev list; a new rail, so Petter's call · → 2026-10-27-distribution-strategy.md
- 2026-10-27 · inbox · A company-lookup and sanctions tool contributed to crewai-tools, which has no company-registry or sanctions tool among its 108; only with real CrewAI code and tests, and only after the MCP route shows CrewAI users exist · → 2026-10-27-distribution-strategy.md
- 2026-10-31 · inbox · No refund route exists: crediting a wallet is a direct money-path write, which is founder-gated with no grant key installed, so the platform cannot make a customer whole without the founder running SQL — a gap the charter does not expect, since DEC-20260815-A delegates refunds to the platform. Found when 45¢ of wrong answers from the Serper goto-link incident could not be credited back
