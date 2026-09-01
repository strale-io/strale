---
doc_type: implementation-verification
topic: x402-price-representation-parity
status: local-verification-complete
complete: false
phase: M2
authority_scope: none
authority_active: false
created_at: 2026-09-01
decision_record: DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6
base_sha: 68c93e66237423e3b8d284d528f36950e85291ba
plan: archive/sessions/2026-09-01-x402-price-representation-parity-plan.md
---

# x402 price representation parity — implementation verification

## Outcome

Local implementation now derives the manifest and OpenAPI decimal price from
the same integer micro-USD value used for the x402 challenge. For a EUR 0.02
fixture at `EUR_USD_RATE=1.08`, the catalog remains numeric `0.0216`, manifest
and OpenAPI both publish `"0.021600"`, and challenge, verification, and mocked
settlement all carry atomic amount `"21600"`.

This closes the implementation drift recorded as open in the earlier
collision-resolution report. It does not revise that historical report, change
the EUR price, exchange rate, challenge amount, settlement behavior, cache
policy, or active-decision authority.

## Test-first evidence

Base SHA: `68c93e66237423e3b8d284d528f36950e85291ba`.

Fail-before command:

```text
npm --workspace=apps/api exec vitest run src/routes/x402-gateway-v2.catalog.test.ts src/lib/x402-v2-challenge.test.ts
```

Before the production change, the first run failed exactly on the intended
public representations:

```text
Test Files  1 failed | 1 passed (2)
Tests       4 failed | 23 passed (27)
manifest: expected "0.021600", received "0.02"
OpenAPI:   expected "0.021600", received "0.022"
```

The mocked facilitator challenge/verify/settle coverage passed in that same
fail-before run, showing the charging path already used `"21600"` and that the
defect was confined to discovery metadata.

Independent review then required each duplicated mapping to fail in isolation.
With only the discovery mappings temporarily restored to their base behavior,
the refined cases produced six expected failures and 23 passes:

```text
manifest capability: expected "0.021600", received "0.02"
manifest solution:   expected "0.021600", received "0.02"
OpenAPI capability:  expected "0.021600", received "0.022"
OpenAPI solution:    expected "0.021600", received "0.022"
capability parity:   expected "0.021600", received "0.02"
solution parity:     expected "0.021600", received "0.02"
```

Pass-after focused command:

```text
npm --workspace=apps/api exec vitest run src/lib/x402-gateway.test.ts src/routes/x402-gateway-v2.catalog.test.ts src/lib/x402-v2-challenge.test.ts
```

Result after review fixes: 3 files passed, 39 tests passed.

Fresh-worktree bootstrap and typecheck:

```text
npm --workspace=packages/mcp-server run build
npm --workspace=apps/api run typecheck
```

Result: both passed. The initial typecheck attempt could not resolve the
unbuilt local `strale-mcp/tools` export; building the worktree-local MCP package
removed that bootstrap-only failure without a source change.

## Implementation boundary

- Added an exact fixed-six-decimal formatter built from canonical integer USDC
  atomic units.
- Manifest capability and solution prices now use that formatter.
- OpenAPI capability and solution `x-payment-info.price.amount` values now use
  that formatter.
- Catalog numeric prices, 402 challenge construction, payment verification,
  settlement, request handling, database rows, and environment configuration
  are unchanged.
- Regression coverage observes both capability and solution mappings and
  captures the exact requirements object supplied to mocked facilitator
  `verify` and `settle`.
- The settlement regression passes the same numeric USD override used by the
  production capability and solution handlers, so it exercises the real
  float-to-atomic verification branch.
- The formatter rejects negative, fractional, non-finite, and unsafe prices;
  its tests include zero, the realistic price range, and the PostgreSQL integer
  maximum.

## Wider verification

- Complete x402 family: 13 files, 149 tests passed.
- Full monorepo typecheck: passed after building the fresh worktree's local SDK
  and MCP dependencies.
- API build: passed.
- Static guards for bare catches, user-controlled fetches, new console calls,
  and external-column access: passed. The external-column npm script assumes a
  repo-root working directory; its documented direct invocation passed.
- Full API suite: 3,635 passed, 328 skipped, with three unrelated timing tests
  failing under parallel suite load. The exact three files then passed 46/46 in
  isolation, confirming load flakes rather than x402 regressions.
- Project-context tests: 54/54 passed; context check reported no warnings.
- `git diff --check`: passed.

Independent product review reproduced a pre-existing discovery-parser mismatch:
`@agentcash/discovery@1.7.5` expects protocol records while the base and current
OpenAPI both publish `protocols: ["x402"]`. This branch does not change that
field, so it is not a regression or part of the price-representation fix. The
raw OpenAPI price is now exact, but that parser discards all structured payment
metadata on both base and this branch. Treat protocol-shape compatibility as a
separate follow-up with its own contract test and rollout review; changing it
here would broaden a money-critical precision fix into a second public-contract
change.

## Protected evidence guard

The following historical artifacts remain byte-for-byte unchanged from the
base commit:

- active decision candidate blob:
  `ab54b39f1f43f63825064cdeb0a733ebb1b8cce7`;
- collision-resolution report blob:
  `26cdda318a066f604dde12cbc868e9512348ce78`.

`git diff --exit-code <base> -- <decision-record> <collision-report>` passed
before repository-wide review. Repeat the diff and blob checks at the exact
commit and merge tip.

## Independent review

Claude Opus and Claude Sonnet were attempted first as the required
different-provider reviewers; both timed out without a verdict. Two
founder-authorized Codex fallback sessions then reviewed the diff independently:

- technical, security, architecture, decision, and money-path review: `PASS`;
- product, public API, UX, and founder-consistency review: `PASS`.

Both reported zero high and zero medium findings after the test refinements.
Their sessions are complete. The product review's final low note about inherited
exchange-rate state was also fixed and verified by running the focused suite
with the parent shell set to `EUR_USD_RATE=1.10`; all 39 tests still passed.

## Remaining gates

- repository `go` skill and full relevant suite;
- independent exact-commit review;
- GitHub CI and merge;
- deployed-SHA and post-cache public parity checks without submitting payment;
- repo handoff and Notion Journal entry.

Linear connectivity is unavailable in this Codex environment. No Linear issue
is in scope, and this degraded connection does not block implementation.
