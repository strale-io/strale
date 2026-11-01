# Production verification from cloud sessions: a GitHub Action (proposal)

**Status: deferred, do not build (Petter, 2026-11-01).** A main-only environment
in the private `strale-ops` repository needs GitHub Team, which is a spend
decision, and Petter declined it for now. Production verification stays on the
PC. **Trigger to raise it again:** if deploys start waiting on Petter's PC for
the DEC-20260504-C step-4 check, tell him, with the current GitHub Team price
looked up at that time, and he decides then. Until then no session writes the
workflow. The design below stays as the ready answer.

**Status:** approved by Petter on 2026-11-01, with one change: the workflow
lives in a **new private repository, `strale-io/strale-ops`**, not in this
public one.

Why private: `strale-io/strale` is public, so its Actions logs are public.
Even the counts these checks print (transaction volume, user counts, the
deployed version) would be published. Founder decision 2026-11-01, recorded
in wow-core#214: a production read credential may go into GitHub Actions
**only in a private repository**, and this is the first named use.

The secret's source also moved that day: `STRALE_RAILWAY_DB_VERIFY_URL` now
lives in Bitwarden project **`pc-only`**, readable only from the PC, and the
cloud fleet token can no longer read it.

Everything else below stands: fixed named checks, counts-only output, an
environment limited to `main`, and read-only enforced twice. Until the
private repository runs its first check, **production verification
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

A manually triggered workflow, `.github/workflows/prod-verify.yml` in
`strale-io/strale-ops`, runs
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

1. ~~Go/no-go~~: go, 2026-11-01, hosted privately.
2. **Check that strale-io is on a paid plan (Team or above).** GitHub offers
   environments in private repositories only on paid plans. On Free, the
   main-only environment is unavailable, so it is either an upgrade (his
   spend call) or a weaker repository secret.
3. Create the private repository `strale-io/strale-ops`, with a README so
   `main` exists.
4. Create its environment `prod-verify`, with deployment branches limited to
   `main`.
5. Add the environment secret `STRALE_VERIFY_DATABASE_URL`, copied directly
   from Bitwarden project `pc-only` (`STRALE_RAILWAY_DB_VERIFY_URL`). The
   value never passes through chat. Under DEC-20261027-C, only Petter places
   credentials.
6. Give the Claude GitHub App access to `strale-ops`, so the orchestrator can
   attach it.

**After that, a session will:** attach `strale-ops` with push access and write the workflow, `run.mjs` and
`checks.mjs` with tests covering the type gate (a planted free-text column
must fail the job) and identifier validation. The PR gets an independent
review, and the first run is triggered from a cloud session.

**Cost:** a few seconds per run, drawn from the private-repository Actions
allowance of the org's plan. No charge is expected beyond the plan itself
(confidence: moderate).
