---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Program register — where multi-batch work resumes"
moved_at: 2026-10-24
---

# Program register — where multi-batch work resumes

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

Long-running work is tracked in `docs/programs/` (index: `docs/programs/README.md`).
Each program has a `PROGRAM.md` with a **Resume here** section and a
machine-checked `tracks.yaml` (`npm run programs:check`). A session continuing
a program starts with those two files and follows their pointers: the active
track's `resume_file` names anything else that batch needs. The migration
checkpoint above is the M2-through-M7 detail behind the `cto-readiness`
program. Programs are execution records, not project truth.
