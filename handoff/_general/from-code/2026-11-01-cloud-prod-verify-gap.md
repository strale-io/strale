Intent: record that cloud sessions cannot reach production Postgres, so production verification stays on the PC, and propose the GitHub Actions route.

# Cloud sessions cannot verify production through strale_verify (2026-11-01)

**Corrects** `2026-11-01-orchestrator-checkpoint-cloud-move.md`, which said a
cloud session "uses" `strale_verify` for DEC-20260504-C verification. It
cannot:

- The key is readable through `bws run`.
- One approved `SELECT 1 FROM transactions_meta LIMIT 1` timed out at connect
  (psql exit 2, no SQLSTATE).
- Petter tested on 2026-11-01: the network level is Full, direct TCP to the
  Railway proxy times out, and the agent proxy accepts a CONNECT while a
  Postgres SSLRequest gets no reply.

**Rule until further notice:** production verification stays on the PC. A
cloud session that needs a DEC-20260504-C step-4 check hands it to a PC
session and does not call the deploy verified itself.

**Proposed fix:** `docs/operations/2026-11-01-prod-verify-action-proposal.md`.
It is a `workflow_dispatch` Action on a GitHub runner with named checks only
and metadata-only output enforced by a type gate. The secret sits in a
`main`-only GitHub environment. It needs Petter's go plus the environment and
secret, which only he can create.

Updated: `docs/operations/orchestrator-carryover-facts.md` (the strale_verify
fact).
