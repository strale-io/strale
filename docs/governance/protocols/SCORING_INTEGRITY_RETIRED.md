---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Scoring Integrity (retired with the SQS engine — DEC-20260503-B)"
moved_at: 2026-10-24
---

# Scoring Integrity (retired with the SQS engine — DEC-20260503-B)

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

The Scoring Integrity Protocol has been retired. The SQS engine, `sqs.ts`,
`EXTERNAL_SERVICE_PATTERNS`, `isExternalServiceFailure`, and `computeFromRows`
no longer exist (PR1 deletion 2026-05-05). When a capability scores poorly under
a future routing-engine signal, the same root-cause discipline still applies:
diagnose the underlying issue (missing credential, bad fixture, real bug) and
fix it; never bend the substrate to mask a specific capability's behaviour.

See also: Capability Onboarding Protocol (DEC-20260320-B).
