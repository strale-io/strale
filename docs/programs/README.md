# Programs

A **program** is a bounded, multi-batch body of work with its own machine-checked
track register. Programs are **execution records**, not project truth: they say
what is being done and what remains, never what Strale is or what has been
decided. Project truth lives in `docs/project/` (candidate until M4) and
`docs/decisions/`.

| Program | Register | Status |
|---|---|---|
| [CTO-readiness](cto-readiness/PROGRAM.md) | `cto-readiness/tracks.yaml` | active from 2026-09-02 |
| [Brand and website](brand-website/PROGRAM.md) | `brand-website/tracks.yaml` | positioning adopted; T4 active: retain Quiet Material and complete its system/asset governance |
| [Remediation](../remediation/REMEDIATION-LEDGER.md) | legacy program; per-package YAML under `../remediation/packages/`, not a track register | closure tracked by CTO-readiness track T4 |

Rules:

- One register per program, `docs/programs/<program>/tracks.yaml`, validated
  against the shared `docs/programs/tracks.schema.json` by
  `npm run programs:check` (the checker's own tests: `npm run programs:test`).
- A track's `status` changes only on the same branch, and therefore in the
  same reviewed PR, that lands the evidence for it.
- Every program directory holds both `PROGRAM.md` and `tracks.yaml`, and the
  register's `program` equals the directory name; the checker enforces this.
- Any session, Claude Code or Codex, resumes a program by starting at its
  `PROGRAM.md` **Resume here** section and following its pointers: the register,
  then the active track's `resume_file`. Chat history is never required.
