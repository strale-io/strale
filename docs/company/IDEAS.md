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

_Empty. No idea has been logged here yet — this file was created by the T12
research contract migration (2026-09-02); `docs/company/DECISION-QUEUE.md`
was checked for a "someday" section to seed this list and had none._
