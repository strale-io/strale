Intent: checkpoint the Strale master-orchestrator state on 2026-10-28 so a fresh session on any Claude account can resume without chat history.

# Orchestrator checkpoint, 2026-10-28 (evening, Swedish time)

Read this file first, then `docs/programs/platform-hardening/PROGRAM.md` and `docs/programs/distribution/PROGRAM.md` (their **Resume here** sections and `tracks.yaml`).

## Resume block

- **Mandate:** DEC-20261027-B. Implement the platform-hardening (H1 to H8) and distribution (D0 to D10) plans with as little founder involvement as possible.
  - Codex CLI does the builds: gpt-6.1-sol for judgement, gpt-6-astra for the money path, gpt-6.1-terra for precise fixes.
  - A separate read-only Claude reviewer does the verification, on real Postgres 16 for money-path work.
  - The orchestrator commits, pushes, opens the PR, merges on green CI and verifies production.
- **Production at checkpoint time:** `/health` commit `67807f4d6ca1` (PR 793). PR 794 merged as `e4493594`, and Railway had not started deploying it yet. Railway deploys were starting 10 to 12 minutes late this afternoon; PR 793 went live that way.
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
  - published to npm, with the smoke test against production passing: 298 capabilities, 95 solutions, full trust, 9 tools, provenance;
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
- **Waiting:** PR 794's Railway deploy. Then verify:
  - `GET /health` shows commit `e4493594a318`;
  - a free `/v1/do` call returns 200;
  - `/x402/vat-validate` returns 402;
  - an anonymous paid `/v1/do` call returns 402 with requirements.

  No live payment is made. At 19:50 Swedish time, 24 minutes after the merge, Railway had posted no deploy status and the verify-deploy run had failed, so Petter was asked to start it in Railway: strale service, then Deployments, then Redeploy on the newest row (or Deploy latest commit).

## Founder items

- **Waiting on Petter:**
  - **DQ-41, the onboarding secret.** Set `ONBOARDING_RUN_SECRET` in Railway. Create the GitHub environment `production-onboarding`, restricted to deploy from `main`. Run the limitations step for named tools only, never `all`.
  - **HMRC sandbox keys.** Put `STRALE_HMRC_SANDBOX_CLIENT_ID` and `..._SECRET` into Bitwarden project `strale` before about 12 November.
  - **Optional sign-ups.** The session prepares and fills each form up to the final button once Petter says go for that form. Petter clicks, accepts the terms and does any 2FA (DEC-20261027-C).
- **Done:**
  - strale-mcp 0.2.9: released, on npm and in the MCP registry.
  - The three loosenings: Petter confirmed them in session on 2026-10-28, recorded in #791.

## Remaining work, in order

1. Verify PR 794 in production (above).
2. **H7 rest:** H7c contract tests; the migrations file split with the ledger unchanged; the ledgered SQS column drop; the applied-block-hash skip.
3. **Distribution:** D7 narrow MCP servers, D8 n8n, D9 Clay.
4. **The Strale inbox routine** (DEC-20261027-C) and the connector probe.
5. **H6:** switch `INPUT_VALIDATION_MODE` to enforce after 7 clean days of report-mode logs.
6. **D10:** the 45-day review of free-tier uptake, with a revert if it does not rise.
7. **Two hardening items from review, no money impact:**
   - a replayed payment hash used on a different capability of the same price returns the first capability's output; this applies to the gateway and to `/v1/do`;
   - a thrown facilitator call on `/v1/do` still returns the legacy 500 envelope.

## Next authorised action

Verify that PR 794 is live in production, as described above. Then start H7c, the fixture contract tests, as a Codex build with an independent reviewer. Both are inside the DEC-20261027-B mandate, and neither needs Petter.
