# archive/receipts/ — evidence receipts

> Checker: `scripts/check-receipts.mjs` (`npm run receipts:check`). Contract:
> [receipt.schema.json](receipt.schema.json). Writer: `scripts/write-receipt.mjs`
> (`npm run receipt`). Tests: `scripts/receipts.test.mjs` (`npm run receipts:test`).

## What a receipt is

A receipt is the file form of a claim like "312 tests pass," "swept 40
capabilities," or "the audit found 3 findings." It is written once, by the
tool that produced the evidence, and never edited afterward — the same way a
paper receipt isn't edited after the sale. If a later run produces a
different number, that is a **new** receipt, not a correction to the old one.

This exists because prose evidence rots invisibly: a handoff can say "all 312
tests pass" and that sentence is exactly as true five months later as it was
the day it was written, which is to say not verifiable at all without
re-running something. `docs/company/LESSONS.md` family F5 catalogues nine
incidents of gates that pass on empty or wrong input — a bare test count in
prose is that failure mode's evidentiary twin: unfalsifiable by construction.

## Naming rule

```
YYYY-MM-DD-<kind>-<topic>.json
```

- `YYYY-MM-DD` — the date the receipt was written (matches `at`'s date, UTC).
- `<kind>` — one of `test-run`, `sweep`, `audit`, `check` (matches the JSON
  body's `kind` field).
- `<topic>` — a short kebab-slug naming what was checked.

Example: `2026-09-02-check-handoff-gate.json`.

## Immutability

A receipt, once committed, is never edited. `receipts:check` enforces this as
a **git fact**, not a convention: for every tracked file under
`archive/receipts/`, it finds the commit that first added the file
(`git log --diff-filter=A`) and compares the blob at that commit
(`git rev-parse <sha>:<path>`) to the blob at `HEAD` (`git rev-parse
HEAD:<path>`). A mismatch fails the build. A receipt that has never been
committed (a new one, staged or untracked) is not yet subject to this check —
it becomes immutable the moment it lands on `main`.

If a receipt turns out to be wrong, write a new one and let the old one stand
as a historical record of what the tool reported at the time. Do not patch it.

## Shape

See [receipt.schema.json](receipt.schema.json) for the enforced contract.
In short: `kind`, `produced_by` (`script` + `commit`), `at` (ISO 8601),
`inputs` (what was run against), `summary` (an object of numbers/strings —
never a pre-formatted sentence), and an optional `raw` (full output, inline
or a path to it).

## Writing a receipt

`scripts/write-receipt.mjs` turns a command's JSON output into a receipt:

```
npm run receipt -- --kind check --topic handoff-gate --from <json-file-or->
```

`--from -` reads JSON from stdin, so it composes with any script that
supports `--json`:

```
node scripts/handoff/handoff-check.mjs --json | npm run receipt -- --kind check --topic handoff-gate --from -
```

`produced_by.commit` and `at` are filled in automatically from `git
rev-parse HEAD` and the clock. `produced_by.script` defaults to
`scripts/write-receipt.mjs` (the tool that actually wrote the file) — pass
`--script <path>` to name the real upstream producer when the JSON came
from another command. The command's JSON output becomes `raw`, and the
writer infers `summary` from the repo-wide `{ok, failures: [...], warnings:
[...], ...count fields}` shape that every `check-*.mjs --json` output
already uses — pass `--summary '{...}'` explicitly when the source JSON
doesn't match that shape (e.g. hand-captured `node --test` counts).

## What `receipts:check` enforces

1. Every `archive/receipts/*.json` file (other than `receipt.schema.json`
   itself) matches the naming rule and validates against the schema.
2. No tracked receipt's committed content has changed since the commit that
   introduced it (see Immutability above).
3. Every `evidence:` / `production_evidence:` entry in a decision record
   (`docs/decisions/records/*.md`), a program track register
   (`docs/programs/*/tracks.yaml`), or a remediation package
   (`docs/remediation/packages/WP*.yaml`) that names a bare repo path (a
   single token with no whitespace — not a URL, not a prose sentence)
   resolves to a real, tracked file. `<sha>:<path>` references are accepted
   when the sha resolves. This is a bigger net than immutability alone: it
   catches the general "cited evidence that doesn't exist" failure, receipts
   included.
4. **Warning only:** a `handoff/_general/**/*.md` file dated 2026-09-02 or
   later that states a bare test count (`\b\d+ tests?\b` or `\d+/\d+ pass`)
   with no `archive/receipts/` link anywhere in the file. This does not fail
   the build — it flags the file so a reviewer can ask for a receipt.

Run `npm run receipts:check -- --json` for machine-readable output.
