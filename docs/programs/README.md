# Programs

A **program** is a bounded, multi-batch body of work with its own machine-checked
track register. Programs are **execution records**, not project truth: they say
what is being done and what remains, never what Strale is or what has been
decided. Project truth lives in `docs/project/` (candidate until M4) and
`docs/decisions/`.

| Program | Register | Status |
|---|---|---|
| [CTO-readiness](cto-readiness/PROGRAM.md) | `cto-readiness/tracks.yaml` | active from 2026-09-02 |
| [Brand and website](brand-website/PROGRAM.md) | `brand-website/tracks.yaml` | site live on strale.io since 2026-11-05 (DEC-20261105-A); T4 active: the Open Flow design system |
| [Platform hardening](platform-hardening/PROGRAM.md) | `platform-hardening/tracks.yaml` | active from 2026-10-27; H1 watch production |
| [Distribution](distribution/PROGRAM.md) | `distribution/tracks.yaml` | active from 2026-10-27; D1 active, D0 in the same unmerged PR |
| [Promise audit](promise-audit/PROGRAM.md) | `promise-audit/tracks.yaml` | active from 2026-11-06; T1 money promises active, waves 2a and 2b merged, wave 2c in review |
| [Robustness](robustness/PROGRAM.md) | `robustness/tracks.yaml` | active from 2026-11-06; R1 untrusted-input bounds done 2026-11-11; R3 alert and signal correctness active |
| [Remediation](../remediation/REMEDIATION-LEDGER.md) | legacy program; per-package YAML under `../remediation/packages/`, not a track register | closure tracked by CTO-readiness track T4 |

**Growth readiness:** [GROWTH-READINESS.md](GROWTH-READINESS.md) is the single list of what
must close before a growth push (A), what is fixed along the way (B) and what is parked (C),
with the roadmap dates and the bar for new list-A items. Petter approved it on 2026-11-11.
It points at the tracks above; it does not replace them.

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
