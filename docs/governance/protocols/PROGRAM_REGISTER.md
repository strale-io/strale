---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Program register — where multi-batch work resumes"
---

# Program register — where multi-batch work resumes

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 7, review round 1). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Program register — where multi-batch work resumes

Long-running work is tracked in `docs/programs/` (index: `docs/programs/README.md`).
Each program has a `PROGRAM.md` with a **Resume here** section and a
machine-checked `tracks.yaml` (`npm run programs:check`). A session continuing
a program starts with those two files and follows their pointers: the active
track's `resume_file` names anything else that batch needs. The migration
checkpoint above is the M2-through-M7 detail behind the `cto-readiness`
program. Programs are execution records, not project truth.
<!-- END VERBATIM FROM CLAUDE.md -->
