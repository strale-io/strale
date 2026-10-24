# REVIEW.md — what a reviewer of a Strale change checks

Every reviewer reads this one page before reading a diff: the agent doing an
independent review, the author doing a self-check, and Petter if he looks. It
says what failure looks like here, what to check on every change, what to check
harder on the surfaces where a mistake costs money, trust or legal exposure, and
what to skip.

**Authority.** `CLAUDE.md` is canon. The protocols named below are defined
there, and their mirrors in `docs/governance/protocols/` are inactive copies.
This file routes a reviewer to them and does not replace them. If this page
and `CLAUDE.md` disagree, `CLAUDE.md` wins; fix this page in the same PR.
Adopted under DEC-20261024-A (way-of-working review
`docs/strategy/2026-10-23-way-of-working-review.md`, rank 6 and §4 step 4).

## Who reviews, and when

- **Independent review** means a fresh agent in a separate context that did
  not write the change and only reads it. The same provider is allowed
  (founder review policy, 2026-09-07). The PR body says which review ran.
- **Tier 2** (the surfaces below): an independent review is required before
  merge. Use two lenses: correctness and safety, plus the surface's own
  checklist below. Gate, hook, CI and doctrine edits are tier 2 even when they
  are only markdown.
- **Tier 1** (any other code, config or script change): one independent
  review before merge.
- **Tier 0** (docs only, with no gate, doctrine, public claim or published
  text): no independent review is required. `CLAUDE.md` already exempts
  docs-only sessions from the code-review gate.
- **Rounds.** At most two review rounds. After the second, the author fixes
  what remains and says so in the PR; the review does not loop. On tier 2, a
  high-severity fix made after round 2 gets one confirmation read from the
  reviewer, or goes to Petter as an open item. Record the
  outcome in the PR body as `GO at <sha>, rounds: <n>`, with the open findings
  and what was done about each.

## What failure looks like at Strale

The incidents behind the rules, so a reviewer knows what to look for:

- A paid call returning 500 for days because a `Date` reached a `sql`
  template, while a sibling bug made retention pruning fail silently (PR #43).
- A fix for a long-silent bulk job that filled the Postgres volume on its first
  run, with a 28-minute crash loop (2026-05-04).
- Code that was correct but never ran, because the deploy never invoked it
  (`apply-migrations.ts`, PR #42, a 28-minute outage).
- A published framework package with no framework code in it, closed in public
  with "Shame on you" (pydantic-ai #4866).
- Two migration blocks fighting over one column on every boot (2026-08-21).
- Green tests that assert nothing (LESSONS F5), and public copy that outlived
  the facts behind it (F6).
- Shared-checkout and `git stash` accidents that destroyed uncommitted work, up
  to the deletion of the whole repository (F11, F12).

## Always check (every reviewed change)

Each line names its rule. The full text is in `CLAUDE.md`, under the heading
given.

- [ ] **Fail-before tests on money and compliance paths** (DEC-20260504-A,
      "Audit-Follow-up Test Coverage Protocol"). A fix on a wallet, audit-trail,
      chain-integrity, spend-cap or idempotency path, or any cert-audit follow-up,
      ships with a regression test that fails without the fix. If it writes to
      the DB, the test asserts the bind-parameter shape: no `Date` or `Buffer`
      reaches `tx.execute(sql\`\`)` or `db.execute(sql\`\`)`. A changed
      error-swallowing `catch` has a test showing the failure appears in the
      summary log.
- [ ] **Bulk operations resumed safely** (DEC-20260504-B, "Bulk-Operation
      Deploy Protocol"). A fix to retention, archival, reconciliation or batch
      work that has been silent for more than 24 hours has a backlog estimate
      in the PR body and either a pre-drain plan or a per-tick bound.
      "Deploy and let it run" is a NO-GO.
- [ ] **The deploy actually runs it** (DEC-20260504-C, "Deploy Mechanism
      Verification Protocol"). Code that depends on a migration, env var, build
      step, startup hook or cron is reachable from `Dockerfile` `CMD`,
      `package.json` scripts, `apps/api/src/index.ts` or the workflow. Check by
      file path, not by "it always has". The PR names the production query that
      will prove the effect, and the result is reported after deploy. A clean log
      line is not that proof.
- [ ] **Distribution integrity** (DEC-20260422-A, "Distribution PR Integrity
      Protocol", plus `docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md`).
      On a PR outside `strale-io/*`, a `packages/*-strale/` change or a
      publish: every imported symbol exists in the package's exports, and
      `node apps/api/scripts/check-framework-packages.mjs` passes. After a
      publish, the production smoke test of the published artefact is recorded
      with the values observed.
- [ ] **Capability onboarding** (DEC-20260320-B, "Capability Onboarding
      Protocol" and "Adding New Capabilities"). A new or changed capability has
      a manifest, `output_field_reliability` for every output field (only
      `guaranteed` fields asserted `not_null`), at least one limitation,
      `validate-capability.ts` passing and readiness `ready: true`. The
      `/onboard-capability` skill runs these steps.
- [ ] **Test cost principles** ("Test Infrastructure Cost Principles" A/B/C).
      Health probes on paid APIs send no auth (`skipAuth: true`). A paid call
      rejects empty or sub-2-character input before calling. Piggyback suites
      are never scheduled.
- [ ] **Migrations are append-only** ("Evidence receipts and the migration
      ledger"). A change to `apps/api/src/lib/startup-migrations.ts` adds a
      new block and a ledger entry, and never edits an old block.
      `npm run migrations:check` passes.
- [ ] **Data access** (DEC-20261023-A, which replaces the scraping doctrine).
      A new upstream fetch belongs to an allowed lane: no logins, no getting
      around blocks, no commercial aggregators, no resale against vendor terms.
      It honours robots.txt with an honest user agent, records the acquisition
      method in provenance, and goes through `safeFetch` or the ToS gate.
- [ ] **Root causes, not masks** ("Scoring Integrity (retired …)"). Nobody
      bends a test, fixture, threshold or allowlist to make one capability look
      healthy. Growing an allowlist needs a reason in the PR.
- [ ] **Wire shapes** ("Wire-shape rule for /v1/public/ops/trust/*").
      Money is integer `*_cents`, dates are ISO 8601, and any display string is
      an additive `*_formatted` field.
- [ ] **One source for facts** ("Drift-prevention surfaces"). Counts, vendor
      names, retention and free-tier lists come from `platform-facts.ts` or the
      DB, never a new hard-coded copy.
- [ ] **Shared checkout and destructive git** ("Shared-Checkout Rule",
      "Worktree node_modules Hazard"). Agents that edit files run in their own
      worktree (`isolation: "worktree"`). Scripts and instructions never use
      `git stash`, `git checkout` of a branch in the main tree, or `rm -rf`
      on a worktree. Fail-before checks go through
      `apps/api/scripts/mutation-test.mjs` (F11).
- [ ] **Tests discriminate.** Each new test fails if the behaviour it names is
      removed (F5). A test that passes either way is a finding.
- [ ] **No secrets or personal data.** No credential, real person's name or
      real identifier lands in a fixture, manifest example or log line. CI's
      `check-no-committed-secrets` and `check-pii` are a floor, not proof.
- [ ] **Authority.** The change takes no action the charter reserves for
      Petter (`docs/company/CHARTER.md`): spend beyond the envelope, anything
      legally binding, one-way public acts, pricing outside the band, or
      regulator-facing claims. Production writes go through
      `production-authority.ts`.

## Tier-2 surfaces and what to check on each

| Surface | Where | Check |
|---|---|---|
| **Wallet and settlement** | `apps/api/src/lib/wallet-service.ts`, `wallet-reservations.ts`, `stripe.ts`, `stripe-settlement.ts`, `routes/wallet.ts`, the debit path in `routes/do.ts` | Lock, then execute, then deduct on success only (DEC-14). Row lock on debits (DEC-8). Idempotency keys honoured (DEC-9). Spend cap and rate limit on every paid path (DEC-21). No double credit on a Stripe retry. The integration suites (`*.integration.test.ts`) cover the change. |
| **x402** | `apps/api/src/lib/x402-*.ts`, `routes/x402-gateway-v2.ts` | Settlement order (verify, execute, settle) is unchanged or tested. Payment amount matches the catalogue price. Input is validated before anything paid runs. Eligibility and visibility follow DEC-20260812-A: invisible and non-x402 until the first green week. |
| **Auth and API keys** | `lib/auth.ts`, `lib/admin-auth.ts`, `routes/auth.ts`, `lib/key-recovery.ts`, `lib/audit-token.ts` | Keys stay hashed and are looked up by prefix (DEC-20). Every new route has the right middleware. No key, token or `process.env` value in a log. Timing-safe comparisons. |
| **Migrations on live data** | `lib/startup-migrations.ts` and its ledger, `src/db/schema.ts`, `lib/data-retention.ts` | Ledger entry and no edited blocks. A boot-time rewrite is idempotent. Bulk work is bounded per tick (DEC-20260504-B). Remember that `scheduled_testing_eligible` is rewritten from `external_cost_cents` on every boot. |
| **Screening outputs** | `capabilities/sanctions-check.ts`, `pep-check.ts`, `adverse-media-check.ts`, `risk-narrative-generate.ts`, UBO lookups, `routes/dispute.ts`, `routes/audit.ts` | DEC-20260428-B engineering bar: source list per response, match explainability, confidence buckets, the dispute path, GDPR Art. 22 classification in the manifest. An AI synthesis cites a source for every flag, uses "screening checks found" framing and never asserts a fact that is not in its input. A vendor change uses the `vendor-switch` skill. |
| **Public claims** | `README.md`, `packages/*/README.md`, manifest `description`, `lib/platform-facts.ts`, methodology and trust routes, `docs/company/claims.yaml` | Every claim is `allowed` in `claims.yaml` and `npm run claims:check` passes. A stronger claim needs Petter (DEC-20260822-A; narrowing an inaccurate one does not). Voice follows `docs/company/VOICE.md`. Consider whether the frontend `llms.txt` needs the same change. |
| **Published packages** | `packages/**`, `server.json`, `smithery.yaml`, `glama.json`, `context7.json`, `.github/workflows/release-npm.yml` | DEC-20260422-A in full. The release follows `docs/release/npm-publishing.md`, including the post-publish smoke test against production and the per-package contract it lists. |
| **Gates, hooks, CI, doctrine** | `.github/workflows/`, `.githooks/`, `scripts/handoff/`, `.claude/settings.json`, `CLAUDE.md`, `AGENTS.md`, decision records | Every check that ran before still runs, unless the PR says which one was retired and under what decision. A changed gate is proven with a planted failure. No ⚠ rule (review §3) is removed without its protection moving somewhere stronger. |

## Skip

Do not spend review effort on these:

- Style and naming that match the surrounding code. Nits go in one line, or
  nowhere.
- Prose in historical records: handoffs, archived sessions, dated strategy
  papers. They describe the past and are not edited.
- Generated files (`archive/README.md`, `handoff/README.md`, `docs/project/*`
  generated by `context:generate`, `.env.example`). Check the generator, not
  its output.
- Re-deriving a decision Petter has made. Quote the decision if the change
  conflicts with it, and stop there.

## Verdict format

```
GO | GO with nits | NO-GO — at <sha>, rounds: <n>
Findings (most severe first): <file:line> — <what breaks, for which input> — <fix>
Ran: <commands and results>
```
