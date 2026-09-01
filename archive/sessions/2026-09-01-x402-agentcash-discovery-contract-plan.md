---
doc_type: implementation-plan
topic: x402-agentcash-discovery-contract
status: agreed
complete: true
phase: M2
authority_scope: none
authority_active: false
created_at: 2026-09-01
decision_record: DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6
money_critical_path: true
public_contract_change: true
base_sha: 72eba362fdcf38c69f1c4dd977e815e979692db1
review_route: codex-fallback-after-claude-opus-and-sonnet-timeouts
reviewed_by: codex-gpt-5.6-sol-xhigh
---

# x402 AgentCash discovery contract plan

Claude Opus and Claude Sonnet were each attempted first with non-persistent
sessions; both timed out without a verdict. The founder-authorized independent
Codex fallback identified one medium test-shape issue. The plan was revised to
assert `getOpenAPI()`'s nested pricing result plus `checkL2ForOpenAPI()`'s flat
projection, restore the mocked global fetch, and verify rollback after cache
expiry. The same reviewer then returned `PASS` with no unresolved high or
medium findings, and its session completed.

## Intent

Make Strale's paid capability and solution operations consumable by the current
canonical AgentCash OpenAPI discovery parser. Change only the public
`x-payment-info.protocols` representation from Strale's invalid hybrid shape to
the structured protocol-object shape. Preserve canonical prices and every
runtime payment, verification, settlement, routing, cache, and database
behavior.

This is conformance work for existing x402 endpoints, not a new capability,
price, payment method, network, or product decision.

## Evidence and constraints

- The active Notion decision at
  `https://app.notion.com/p/35467c87082c8124bcc5e2c2597c76c6`
  requires one canonical EUR `price_cents` converted through one
  `EUR_USD_RATE`; public discovery must reflect the same derived value.
- `@agentcash/discovery@1.7.5` is the current npm `latest` release on
  2026-09-01. Its normative structured example is
  `protocols: [{ "x402": {} }]` and its exported runtime parser expects a
  protocol-record array when `price` is a structured object.
- Strale currently publishes a hybrid:
  `price: { mode, currency, amount }` plus `protocols: ["x402"]`. The actual
  parser cannot resolve either the structured price or protocol from that
  combination, so paid routes lose both advisory fields.
- The immediately preceding price-parity change is complete. Exact decimal
  amounts such as `"0.021600"` must remain unchanged.
- Runtime 402 challenges are authoritative. This change must not submit a
  payment, invoke a facilitator in production, or alter challenge construction,
  verification, or settlement.
- Linear connectivity is unavailable in this Codex environment. Work continues
  in the documented degraded mode and the handoff records that limitation.

## Implementation

1. Pin `@agentcash/discovery` version `1.7.5` as an API test-only development
   dependency. An exact version is intentional: it makes the public contract
   regression deterministic instead of allowing a future parser release to
   silently change CI behavior.
2. Extend `apps/api/src/routes/x402-gateway-v2.catalog.test.ts` with a contract
   test that uses the package's real exported `getOpenAPI()` parser and
   `checkL2ForOpenAPI()` projection. Stub only the network fetch, return an
   OpenAPI 3.1 document whose paths are produced by Strale's real
   `getX402OpenApiPaths()` function, and restore the global fetch after each
   test.
3. Parameterize the contract over one capability and one solution. Unwrap the
   parser's `ResultAsync`; for each `OpenApiSource.routes` entry assert the
   nested `pricing` object retains `price: "0.021600"`,
   `pricingMode: "fixed"`, and `currency: "USD"`, while `protocols` is exactly
   `["x402"]`. Then project with `checkL2ForOpenAPI()` and assert its
   user-facing route has `price: "0.021600 USD"`, `pricingMode: "fixed"`,
   `currency: "USD"`, and `protocols: ["x402"]`.
4. Also assert each raw `x-payment-info` object passes the package's exported
   `PaymentInfoSchema`. This localizes schema failures while the end-to-end
   parser assertion protects user-visible discovery behavior.
5. Run the new test against the base implementation before changing production
   code. Retain the base SHA, exact command, and expected failure showing the
   real parser drops the advisory metadata.
6. In `buildX402Operation()`, replace only `protocols: ["x402"]` with
   `protocols: [{ x402: {} }]`. Do not touch price derivation, paths, methods,
   schemas, responses, security, caches, manifests, catalog output, or runtime
   payment functions.
7. Keep existing raw OpenAPI price-parity assertions and add an explicit raw
   protocol-shape assertion for both capability and solution, so a future
   regression fails without depending only on third-party parser internals.
8. Add an append-only implementation-verification report under
   `archive/sessions/`. Do not edit the preceding price-parity report or its
   associated handoff/Journal evidence.
9. Run the repository `go` skill before any outward transition. Require an
   independent technical/money-path review and a product/public-contract
   review. Use Claude Opus first; after a real provider failure use the
   founder-authorized Codex fallback. Complete every verifier session.
10. Push a dedicated PR, wait for repository and disposable-database CI, merge,
    then wait for deployment plus the existing 300-second OpenAPI cache window.
    Verify production with `@agentcash/discovery@1.7.5` against
    `https://api.strale.io/openapi.json`, checking one paid capability and one
    paid solution. Confirm the exact price and `["x402"]` normalized protocol
    advisory. Fetch a 402 challenge without payment to confirm its amount and
    protocol generation remain unchanged.

## Required verification

- Fail-before/pass-after output from the real pinned AgentCash parser.
- Raw `PaymentInfoSchema` conformance for capability and solution metadata.
- Existing exact price parity and x402 catalog/challenge suites.
- Focused x402 family, API typecheck/build, relevant static guards, and full API
  tests proportional to this public money-contract change.
- `npm run context:test`, `npm run context:check`, and `git diff --check` after
  reports are written.
- Exact-commit independent review with zero unresolved high or medium findings.
- GitHub `check` and `integration-db` jobs.
- Production parser verification after deployment and cache expiry, without a
  payment or settlement.

## Compatibility, rollout, and rollback

- The old hybrid is not a valid structured AgentCash shape. The new value is
  the package's canonical v1 representation and unknown protocol-object keys
  are required to be ignored by conformant clients.
- OpenAPI consumers that merely display or ignore `x-payment-info` are
  unaffected. A consumer hard-coded to the noncanonical string-array hybrid
  may need to update; production verification therefore includes Strale's
  public raw document as well as AgentCash's normalized output.
- No database migration, environment change, vendor call, cache-policy change,
  or capability activation is required.
- Rollback is a normal code revert of the single metadata field if an important
  consumer regression appears. After a revert, wait for or bypass the
  300-second public OpenAPI cache and repeat both the raw-document and AgentCash
  parsing checks. Charging behavior is unchanged in either direction.

## Completion criteria

- AgentCash 1.7.5 discovers exact prices and x402 protocol advisories for both a
  paid capability and paid solution.
- The raw metadata uses the canonical structured protocol-object shape.
- Exact price strings and runtime challenge amounts remain identical to the
  preceding verified behavior.
- Required local checks, independent reviews, CI, production verification,
  handoff, and Journal entry are complete, and all verifier sessions are closed.
