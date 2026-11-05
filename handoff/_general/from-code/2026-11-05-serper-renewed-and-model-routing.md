Intent: record Petter's two calls of 2026-11-05 (Serper renewed; build on Claude with cheaper builders and Opus verification) and the work started under them.

# Serper renewed; Claude builds, Opus verifies (2026-11-05)

## Serper (DQ-44, answered)

Petter renewed the Starter pack on 2026-11-05: USD 62.50, 50,000 credits,
balance 97,487 right after (his billing-page screenshot in session). New pack
valid to about 2027-05-05. Dashboard usage 22 Oct to 5 Nov: 86 credits, about
185 a month. Open: whether the 47,487 May credits lapse on 8 November; the
balance after that date answers it. The rollover email is withdrawn; a
DataForSEO resale question is drafted (OUTBOX `dataforseo-resale`) for a
non-expiring vendor before the May 2027 renewal.

Also fixed: `docs/company/OUTBOX.yaml` did not parse on `main` (an unquoted
`: ` in the `rik-open-data-403` row's `to:`, from commit 162fc906). It parses
now; anything that read the file since then got an error.

## Model routing (Petter, in session, 2026-11-05)

"Over time I want to migrate to Codex, but for now, let's build with Claude.
Make sure you use cheaper, appropriate models for each task and have Opus 5.5
verify what gets built."

So, until Petter starts the Codex move:
- Build lanes run on **Sonnet** (worktree agents); **Haiku** for mechanical
  lookups and sweeps.
- Every batch gets an independent, read-only **Opus 5.5** review in a separate
  context before it merges (REVIEW.md rounds unchanged).
- No Strale Codex Cloud environment is needed for now; the wow-core master was
  told on 2026-11-05. DEC-20261101-A stays in force for when Codex lanes start.

## Lanes started 2026-11-05 (Sonnet builders)

- `feat/web-redirects-sitemap-analytics`: switch-over items 4, 5 and 7.
- `feat/web-guides`: switch-over item 3.
- `fix/wp12-resource-caps`: WP12 batch 3, byte and pixel caps (T18).

Each gets an Opus review, then a PR through the merge queue.
