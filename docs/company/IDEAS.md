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

- 2026-09-26 · inbox · US private-company lookup: on 2026-09-18 the largest x402 buyer sent 114 US company names to us-company-data and 103 were correctly refused (SEC EDGAR covers public filers only; the names were mostly private software firms) — find a licensed source for private US company basics that fits DEC-20260428-A
