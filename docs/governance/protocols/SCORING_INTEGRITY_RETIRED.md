---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Scoring Integrity (retired with the SQS engine — DEC-20260503-B)"
---

# Scoring Integrity (retired with the SQS engine — DEC-20260503-B)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 7, review round 1). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Scoring Integrity (retired with the SQS engine — DEC-20260503-B)

The Scoring Integrity Protocol has been retired. The SQS engine, `sqs.ts`,
`EXTERNAL_SERVICE_PATTERNS`, `isExternalServiceFailure`, and `computeFromRows`
no longer exist (PR1 deletion 2026-05-05). When a capability scores poorly under
a future routing-engine signal, the same root-cause discipline still applies:
diagnose the underlying issue (missing credential, bad fixture, real bug) and
fix it; never bend the substrate to mask a specific capability's behaviour.

See also: Capability Onboarding Protocol (DEC-20260320-B).
<!-- END VERBATIM FROM CLAUDE.md -->
