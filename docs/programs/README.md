# Programs

A **program** is a bounded, multi-batch body of work with its own machine-checked
track register. Programs are **execution records**, not project truth: they say
what is being done and what remains, never what Strale is or what has been
decided. Project truth lives in `docs/project/` (candidate until M4) and
`docs/decisions/`.

| Program | Register | Status |
|---|---|---|
| [CTO-readiness](cto-readiness/PROGRAM.md) | `cto-readiness/tracks.yaml` | active from 2026-09-02 |
| [Remediation](../remediation/REMEDIATION-LEDGER.md) | `../remediation/packages/*.yaml` | closure tracked by CTO-readiness track T4 |

Rules:

- One register per program, validated by `npm run programs:test`.
- A track's `status` changes only in the same PR that lands the evidence for it.
- Any session, Claude Code or Codex, resumes a program by reading its
  `PROGRAM.md` **Resume here** section and the register. Nothing else is
  required, and chat history is never required.
