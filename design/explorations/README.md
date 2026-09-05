# Explorations

An exploration is a directory named `<date>-<name>/`, each with a
`README.md` front matter carrying at least:

```yaml
status: exploring | proposed | adopted | rejected | superseded
supersedes: <exploration-name> | null
superseded_by: <exploration-name> | null
```

The README explains what was tried, points at where the actual material
lives (this repo, another repo, a release tag — explorations do not
duplicate large asset trees into `design/`), and what it supersedes or is
superseded by. An exploration becomes a candidate — a token file under
`design/tokens/candidates/`, with its own `status` — once someone judges
it worth weighing against what is live. Not every exploration reaches that
bar; a rejected or abandoned one keeps its README so the reasoning isn't
lost, but never gets a candidate token file.

See `design/PROVENANCE.md` for the full status of every direction, live and
historical, in one place. See `design/README.md` for how a candidate is
promoted to `active.json`.

## Current entries

- [`2026-09-05-brand-directions/`](2026-09-05-brand-directions/README.md)
  — status: rejected. Founder preferred the existing redesign. Resume at
  `docs/programs/brand-website/SYSTEM-COMPLETION.md`; these concepts are history.

- [`2026-09-05-quiet-material-refinement/`](2026-09-05-quiet-material-refinement/README.md)
  — status: exploring. First website, social and PDF application studies after
  DEC-20260905-A; production tokens and v0.7 status remain unchanged.

- [`2026-09-01-quiet-material-v0.7/`](2026-09-01-quiet-material-v0.7/README.md)
  — status: proposed. Candidate token file:
  `design/tokens/candidates/quiet-material-v0.7.json`.
