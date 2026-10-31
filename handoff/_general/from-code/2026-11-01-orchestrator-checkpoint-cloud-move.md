Intent: final checkpoint from the PC-resident Strale orchestrator before the role moves to the cloud, so the next session resumes from the repository alone.

# Orchestrator checkpoint, 2026-11-01 — written for the move to the cloud

**This supersedes `2026-10-30-orchestrator-checkpoint-evening.md`**, which in
turn superseded the two before it. Read this one.

The difference from every earlier checkpoint: the session writing it ran on
Petter's PC and the session reading it will not. Nothing here assumes a local
file, a local credential or a local memory store.

## Next action

**The `docs_only` CI audit.** PR #858 found that `check`'s CODE steps are gated
on `needs.classify.outputs.docs_only == 'false'` while `merge_group` always
classifies as not-docs-only, so a gated step runs in the merge queue and not on
the pull request. `guard-production-write-access.mjs` was mis-classified that
way: it greps the whole repository including `archive/` and `handoff/`, so a
documentation-only PR could introduce exactly what it refuses while it was
skipped. It is ungated now and
`scripts/ci/docs-only-scanner-gate.test.mjs` holds the class — any gated step
whose script enumerates the tree with `git ls-files` or `git grep` fails the
test.

Twelve steps remain gated on `docs_only`. For each: move it, or prove it safe
with a test of the same kind, in one small PR.

```
apps/api/scripts/check-cost-class-coherence.mjs        reads manifests/ only — likely safe
apps/api/scripts/check-fetch-timeout-coverage.mjs
apps/api/scripts/check-framework-packages.mjs          mentions archive/ in prose only
apps/api/scripts/check-identity-fixture-shape.mjs
apps/api/scripts/check-mjs-syntax.mjs
apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs
apps/api/scripts/check-no-external-column-access.mjs   mentions archive/ in an allowlist path
apps/api/scripts/check-ssrf-inventory.mjs
apps/api/scripts/check-tier-coverage.mjs
npm --workspace=apps/api run lint:no-bare-catch
npm --workspace=apps/api run lint:no-new-console
npm --workspace=apps/api run lint:no-unguarded-user-fetch
```

The test to beat is `scripts/ci/docs-only-scanner-gate.test.mjs`. Two earlier
versions of its rule produced false positives (`check-cost-class-coherence`
reads only `manifests/`, which `isDocsPath` does not match; two scripts mention
`archive/` in a comment), and a rule that cries wolf gets muted — so key on the
property, not on the prose. `isDocsPath` in `scripts/production-watch/classify.mjs`
defines what a docs-only PR can touch: `docs/`, `archive/`, `handoff/`, and a
root `*.md`.

## Where the programs stand

| program | active track | state |
|---|---|---|
| platform-hardening | **T6 (H6)** | H1–H5 and H7 done. H6 shipped in PR #786 in report mode; it needs seven consecutive clean days of mismatch reports with real wallet and x402 traffic before `INPUT_VALIDATION_MODE` goes to enforce — #786 landed 10-28, so **not before 11-04**. H8 is founder-gated on Better Stack signup. |
| distribution | T2 (D1) | Pipedream and Activepieces repairs are open upstream and waiting on their maintainers. Three npm publishes are blocked on a trusted-publisher entry only Petter can create. |
| brand-website | T4 | Open Flow adopted; the `apps/web` build is T6. |
| cto-readiness | T7 | M4 cutover; the merge stays Petter's. |

Production is on `a77dcf7c`.

## What this session changed, with the reasoning that is not obvious from the diff

- **H7 closed** (PR #853). Block 0141 drops the `capability_health` view.
  Rolling back past block 0134 now needs the view recreated by hand, and past
  0132 is already impossible because the SQS columns are gone.
- **H3 closed** (PR #857). Guaranteed-field monitoring found 16 tools whose
  manifests over-promise, **14 of them invisible to the static allowlist** —
  the case for the weekly persisted-miss check the H3 handoff proposed.
- **H5 closed** (PR #865). Cost recording is at 92.6 % (x402) and 96.6 %
  (wallet) on real traffic. The naive figure is 1 % and it is wrong: 23,297
  harness calls never open the cost scope. Do not quote the 1 %.
- **The CI gate fix** (PR #858), above.
- **`strale_verify`** (PRs #861, #862, #864). A production read credential that
  cannot reach customer content: 17 tables, 8 metadata views, 30 withheld. Its
  URL is `STRALE_RAILWAY_DB_VERIFY_URL` in Bitwarden project `strale`, readable
  with the fleet token — **this is what a cloud session uses for DEC-20260504-C
  verification.** Proven independently on 10-31: TLS 1.3, every withheld table
  refused with SQLSTATE 42501, all writes and CREATE refused.
- **The memory carry-over** (PR #865): `docs/operations/orchestrator-carryover-facts.md`,
  ~108 facts that previously existed only in a PC-local store. Its section 12
  lists what was already stale; a register in `docs/` or `config/` wins where
  they disagree.
- **F5 incident 13** (PR #863), tagged `[GENERIC]`: seven planted defects
  escaped one script's tests because each assertion matched source text instead
  of behaviour, and three were defeated by the explanatory comment beside the
  code.

## What a cloud session can and cannot do

**Can, and should:** production verification through `strale_verify`; the whole
PR cycle; upstream PRs; the registers and gates. Notion was confirmed working
from a cloud session on 2026-11-01.

**Cannot:**

- **Railway control.** No token, by decision. Not needed: the database is
  better evidence than the log, which drops messages above 500/second anyway.
- **Production writes.** Founder-gated with no grant key installed, which is
  correct. Listing state, money and lifecycle are deliberately absent from
  `AUTONOMOUS_PURPOSES`; an approval in chat is not the thing the gate checks.
- **npm and PyPI publishing.** Blocked on trusted-publisher entries, not on
  location.
- **Vendor email.** Worth stating precisely, because an earlier draft of this
  checkpoint got it wrong: the PC orchestrator was **equally** blind. Today's
  Serper breakage reached this session because Petter forwarded it, not through
  any connector. So this is not a cloud-specific gap and not a reason to delay
  the move; it is a missing capability either way, and the inbox relay is its
  own task.

## Open, and owned by nobody yet

- **Serper expires 2026-11-08** with roughly 3,100 of 50,000 credits. The lane
  owes renewal cost at observed volume by 11-06 (session
  `fix-serper-goto-links-br`, PR #859 merged).
- **`transactions_meta` has no `cost_breakdown`**, so an H5-style check still
  needs the PC-only `strale_ro`. Deliberately skipped on 11-01; add the column
  when something needs it.
- **3–7 % of real calls record no cost breakdown**, cause undiagnosed.
  `persistCallCost` writes fire-and-forget after the terminal transaction, so a
  lost write is silent by design.
- **`apps/api/src/lib/email-templates.ts:124`** links customer-facing mail to a
  deleted `/v1/internal/trust/...` route that answers 401.
- **The `image-resize` production suite** still points at a robots-disallowed
  gstatic fixture.
- **LESSONS.md is not updated** for the #786 class (a guard rollout disabled
  paid tools the harness cannot call).

## Waiting on Petter

Unchanged except where noted: the npm trusted publishers (bus comment
6531994137), the PyPI publisher for `langchain-strale`, the `strale-cli` first
publish, Better Stack for H8, `ONBOARDING_RUN_SECRET` for DQ-41, the NTA form,
HMRC sandbox keys before about 11-12, and the Alchemy network switch-on. The
Smithery duplicate listing `strale/agent-tools` needs account access.

## Git state at the time of writing

`main` at `a77dcf7c`, production serving it. No branch of this session's
remains. Open PRs are other lanes': #855, #736, #730, #727, #726, #725 are
drafts and #682 is the M4 cutover lane's.
