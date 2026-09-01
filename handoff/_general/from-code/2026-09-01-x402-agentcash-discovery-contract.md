# Handoff — x402 AgentCash discovery contract

Status: complete

PR [#461](https://github.com/strale-io/strale/pull/461) merged as
`b4e3904f2e982dcd9e7bad83f4da8c21eb3621e7`. Paid capability and solution
operations now emit canonical `protocols: [{ x402: {} }]`, allowing
`@agentcash/discovery@1.7.5` to preserve their exact price and x402 advisory.

The production change was one public metadata field. Prices, challenge,
verification, settlement, charging, routing, caches, database rows, and active
inventory are unchanged.

Verification completed:

- real-parser fail-before reproduced four intended failures while 13 existing
  focused tests passed;
- pass-after contract 17/17, x402 family 153/153, full API 3,658 passed with
  314 skipped;
- monorepo typecheck, builds, static guards, context tests/checks, GitHub
  `check`, and `integration-db` passed;
- independent plan, technical, product, and exact-commit Codex reviews passed
  after the plan's single medium test-shape finding was corrected;
- all verifier sessions are complete.

Production remained on `b4e3904f2e98` through eleven canonical OpenAPI samples
over 313 seconds. Live AgentCash parsing returned:

- `GET /x402/v2/csv-clean`: paid, fixed `0.021600 USD`, `protocols: ["x402"]`;
- `POST /x402/v2/solutions/kyb-essentials-se`: paid, fixed `1.620000 USD`,
  `protocols: ["x402"]`.

An unpaid `csv-clean` call returned HTTP 402/x402 v2 amount `21600`, matching
the discovered price exactly. No payment or settlement occurred.

Open: Claude Opus and Sonnet timed out. Cross-provider exact-commit and
production-evidence re-verification remains at P1 in
`archive/sessions/2026-09-01-m2-claude-verification-backlog.md`. It is not an
implementation blocker. Repo-native authority remains inactive.

Detailed report:
`archive/sessions/2026-09-01-x402-agentcash-discovery-contract.md`.

Journal:
`https://app.notion.com/p/3ce67c87082c81b1ba65c9b02e19838e?pvs=204`.
