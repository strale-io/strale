# Production verification from cloud sessions: a GitHub Action (proposal)

**Status:** proposed on 2026-11-01. It needs Petter's go and two settings only
he can make (below). Until it exists, **production verification
(DEC-20260504-C step 4) stays on the PC.**

## The gap, as established

The 2026-11-01 orchestrator checkpoint assumed cloud sessions would verify
production through `strale_verify` (`STRALE_RAILWAY_DB_VERIFY_URL`, Bitwarden
project `strale`). That does not work, and the reason is the platform, not
the credential:

- The key is readable: `bws run` injects it in a cloud session.
- One read-only `SELECT 1 FROM transactions_meta LIMIT 1` (approved by Petter
  on 2026-11-01) failed with a connect timeout. psql exited 2 with no SQLSTATE,
  because no server was ever reached.
- Petter tested the network from a fleet cloud session on 2026-11-01:
  - The network level is already **Full**.
  - Direct TCP to the Railway proxy host on the database port times out.
  - The agent proxy accepts a CONNECT (200), but a Postgres SSLRequest
    through that tunnel gets no reply.

**Cloud containers cannot reach Postgres.** No allowlist entry changes that.

## Proposal

A manually triggered workflow, `.github/workflows/prod-verify.yml`, runs
named read-only checks on a GitHub-hosted runner, which can reach Postgres.
Cloud sessions trigger it and read its result through the GitHub tools they
already have (`actions_run_trigger`, then `actions_get` / job logs).

### Shape

```yaml
on:
  workflow_dispatch:
    inputs:
      check:
        description: Named check to run
        type: choice
        options: [ping, build-sha, column-exists, row-count, verify-role-grants]
      target:
        description: Table or table.column for checks that take one (validated)
        required: false
jobs:
  verify:
    runs-on: ubuntu-latest
    environment: prod-verify        # holds the secret; deployable from main only
    permissions: { contents: read }
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@<pinned sha>
      - run: node scripts/prod-verify/run.mjs "$CHECK" "$TARGET" >> "$GITHUB_STEP_SUMMARY"
        env:
          DATABASE_URL: ${{ secrets.STRALE_VERIFY_DATABASE_URL }}
          CHECK: ${{ inputs.check }}
          TARGET: ${{ inputs.target }}
```

### The rules that make it safe

1. **No free-form SQL.** `check` is a fixed choice, and each name maps to one
   query in `scripts/prod-verify/checks.mjs` against the metadata
   `strale_verify` can already read. `target` must match a schema identifier
   from `information_schema`, never interpolated text. Anyone who can trigger
   the workflow can run only what the repository already allows.
2. **Metadata only, enforced in code.** The runner prints counts, booleans,
   identifiers, timestamps and a build sha, and nothing else. Before printing,
   it checks every result cell's type and fails the job on any free-text
   value, so a check that would return row contents cannot ship. This is
   defence in depth on top of the role's own grants, which already withhold
   the 30 customer-content tables.
3. **The secret cannot leave by a branch.** The secret lives in a GitHub
   **environment** (`prod-verify`) whose deployment rule allows `main` only.
   `workflow_dispatch` lets the caller pick a ref, so without that rule a
   branch could edit the workflow to print the secret. With it, a job from
   any other ref never receives the secret.
4. **Read-only twice over.** The role refuses writes by privilege, and the
   runner also sets `default_transaction_read_only=on`.
5. **Who triggers it.** The Strale orchestrator and its lanes, under
   DEC-20261101-A rule 2. Codex lanes do not trigger it. Each run is
   logged by GitHub with the actor, which is the audit trail.

### What it replaces and what it does not

- **It replaces** the step-4 query of DEC-20260504-C from cloud sessions:
  "the column exists", "the backfill wrote N rows", "production serves sha X".
- **It does not replace** anything that reads customer content. That stays
  impossible by design.

## What Petter has to do

1. **Go/no-go** on this design.
2. **Create the GitHub environment** `prod-verify`, with its deployment-branch
   rule set to `main` only, and add the secret `STRALE_VERIFY_DATABASE_URL`
   with the same value as the Bitwarden `STRALE_RAILWAY_DB_VERIFY_URL`. Under
   DEC-20261027-C, only Petter places credentials.

**After that, a session will:** write the workflow, `run.mjs` and
`checks.mjs` with tests covering the type gate (a planted free-text column
must fail the job) and identifier validation. The PR gets an independent
review, and the first run is triggered from a cloud session.

**Cost:** none expected. Runs are a few seconds on GitHub-hosted runners
(confidence: moderate, pending the account's Actions billing).
