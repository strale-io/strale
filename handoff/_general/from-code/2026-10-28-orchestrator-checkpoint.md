Intent: checkpoint the Strale master-orchestrator state on 2026-10-28 so a fresh session on any Claude account can resume without chat history.

# Orchestrator checkpoint, 2026-10-28 (evening, Swedish time)

> **SUPERSEDED 2026-10-30.** Resume from
> `2026-10-30-orchestrator-checkpoint.md` instead. The "Remaining work" and
> "Next authorised action" below are stale: H7c, D7, D8 and D9 all shipped on
> 2026-10-29. Kept as the record of where the orchestrator stood on 10-28.

Read this file first, then `docs/programs/platform-hardening/PROGRAM.md` and `docs/programs/distribution/PROGRAM.md` (their **Resume here** sections and `tracks.yaml`).

## Resume block

- **Mandate:** DEC-20261027-B. Implement the platform-hardening (H1 to H8) and distribution (D0 to D10) plans with as little founder involvement as possible.
  - Codex CLI does the builds: gpt-6.1-sol for judgement, gpt-6-astra for the money path, gpt-6.1-terra for precise fixes.
  - A separate read-only Claude reviewer does the verification, on real Postgres 16 for money-path work.
  - The orchestrator commits, pushes, opens the PR, merges on green CI and verifies production.
- **Production at checkpoint time (20:20 Swedish time):** `/health` commit `e4493594a318` (PR 794). Verified:
  - a free `/v1/do` call returns 200;
  - `/x402/vat-validate` returns 402;
  - an anonymous paid `/v1/do` call returns 402 with payment requirements.

  Railway deploys started 10 to 30 minutes late this afternoon, so the merged checkpoint PRs (795 and its update) may reach production later. They are docs only.
- **Shipped today:**
  - H5 (#777);
  - D5 Zapier (#778);
  - H4 money path (#779);
  - DEC-20261027-C docs (#780);
  - Serper permission record (#783);
  - D2 Bazaar metadata (#784, #785);
  - H6 fetch hardening (#786);
  - H7a (#787);
  - D10, 300 free calls a month (#789);
  - boot lock-contention fix (#790);
  - the three loosenings (#791);
  - MCP registry auto-publish (#792);
  - H7b (#793);
  - `/v1/do` x402 parity (#794).
- **strale-mcp 0.2.9:**
  - passed the Distribution PR Integrity Protocol: `check-framework-packages.mjs` passed before publishing;
  - published to npm, with the production contract smoke test passing on the npm artefact: 298 capabilities, 95 solutions, 298 cap trust, 95 sol trust, 9 tools, provenance;
  - published to the official MCP registry as latest;
  - future releases update the registry automatically (`publish-mcp-registry.yml`).
- **CR-19:** re-checked on 2026-10-28. Forged `X-Forwarded-For` and `X-Real-IP` do not reach the app. Receipt: [verify-ip re-check](../../../archive/receipts/2026-10-28-audit-verify-ip-proxy-hops-recheck.json). No fix is needed.

## Open PRs at checkpoint

None of these are this orchestrator's open work; they belong to other lanes.

| PR | Head | State | Owner and lane |
|---|---|---|---|
| 736 | `4bcb5ae0` | draft | website lane (Website 4) |
| 730 | `32db8a95` | draft | T7 contract and way-of-working lane |
| 727 | `7dd6c083` | draft | website lane (Website 3/5) |
| 726 | `f6b1e22c` | draft | website lane (Website 2/5) |
| 725 | `9830af50` | draft | website lane (Website 1/5) |
| 682 | `82bbed53` | ready | M4 cutover lane (blocking checks) |

## In-flight lanes

- Nothing is building. No Codex run is active and no branch holds uncommitted work.
- PR 794 is deployed and verified, so nothing is waiting on Railway.
- **Child sessions** (codebase review, distribution strategy, company-status-check builder) were told on 2026-10-28 to push their work and write notes before archiving. Their deliverables are already merged (PRs 769, 770, and the company-status-check PR).

## Founder items

- **Waiting on Petter:**
  - **DQ-41, the onboarding secret.** Set `ONBOARDING_RUN_SECRET` in Railway. Create the GitHub environment `production-onboarding`, restricted to deploy from `main`. Run the limitations step for named tools only, never `all`.
  - **HMRC sandbox keys.** Put `STRALE_HMRC_SANDBOX_CLIENT_ID` and `..._SECRET` into Bitwarden project `strale` before about 12 November.
  - **Optional sign-ups.** The session prepares and fills each form up to the final button once Petter says go for that form. Petter clicks, accepts the terms and does any 2FA (DEC-20261027-C).
- **Done:**
  - strale-mcp 0.2.9: released, on npm and in the MCP registry.
  - The three loosenings: Petter confirmed them in session on 2026-10-28, recorded in #791.

## Decided by Petter on 2026-10-28 (evening)

- **Branch clean-up is done.** The 10 merged branches are deleted, and "Automatically delete head branches" is on.
- **A wow-core communication-rules sync PR is coming to Strale.** It covers the inbox check at session start, and posting asks for Petter to the `needs-petter` bus channel. It is a version without the private bus repo name or Petter's name, because Strale is public.
  - Accept it when it arrives, unless Strale's rules need something more.
  - If they do, say what on bus channel `wow-core-master`.
- **DQ-41** is confirmed: restrict `production-onboarding` to `main`, and run the limitations step for named tools only, never `all`.

## Remaining work, in order

1. Review and merge the wow-core communication-rules sync PR when it arrives (see above).
2. **H7 rest:** H7c contract tests; the migrations file split with the ledger unchanged; the ledgered SQS column drop; the applied-block-hash skip.
3. **Distribution:** D7 narrow MCP servers, D8 n8n, D9 Clay.
4. **The Strale inbox routine** (DEC-20261027-C) and the connector probe.
5. **H6:** switch `INPUT_VALIDATION_MODE` to enforce after 7 clean days of report-mode logs.
6. **D10:** the 45-day review of free-tier uptake, with a revert if it does not rise.
7. **Two hardening items from review, no money impact:**
   - a replayed payment hash used on a different capability of the same price returns the first capability's output; this applies to the gateway and to `/v1/do`;
   - a thrown facilitator call on `/v1/do` still returns the legacy 500 envelope.

## Next authorised action

Start H7c, the fixture contract tests, as a Codex build with an independent reviewer. It is inside the DEC-20261027-B mandate and does not need Petter. If the wow-core sync PR has arrived, review and merge it first.
