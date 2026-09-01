---
doc_type: implementation-verification
topic: x402-agentcash-discovery-contract
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
created_at: 2026-09-01
decision_record: DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6
money_critical_path: true
public_contract_change: true
base_sha: 72eba362fdcf38c69f1c4dd977e815e979692db1
implementation_commit: 47646028d28a08a6e914432d2326c11ba1c4bbfc
merge_sha: b4e3904f2e982dcd9e7bad83f4da8c21eb3621e7
plan: archive/sessions/2026-09-01-x402-agentcash-discovery-contract-plan.md
---

# x402 AgentCash discovery contract — implementation verification

## Outcome

Strale's paid capability and solution operations now use the canonical
AgentCash structured protocol object:

```json
{ "protocols": [{ "x402": {} }] }
```

`@agentcash/discovery@1.7.5` therefore preserves both the exact price and the
x402 protocol advisory. The production change was one metadata field. It did
not change prices, challenge construction, verification, settlement, charging,
routing, cache policy, database state, or capability/solution activation.

PR [#461](https://github.com/strale-io/strale/pull/461) merged to `main` as
`b4e3904f2e982dcd9e7bad83f4da8c21eb3621e7`.

## Test-first evidence

Base SHA: `72eba362fdcf38c69f1c4dd977e815e979692db1`.

Fail-before command:

```text
npm --workspace=apps/api exec vitest run src/routes/x402-gateway-v2.catalog.test.ts
```

With the real parser tests added but production code unchanged, the focused
file produced the intended isolated failure:

```text
Test Files  1 failed (1)
Tests       4 failed | 13 passed (17)
```

Both capability and solution raw metadata failed
`PaymentInfoSchema.safeParse()`. Both end-to-end `getOpenAPI()` cases still
identified `authMode: "paid"` but omitted `pricing` and `protocols`, proving the
defect was the hybrid `structured price + string protocol array` representation
rather than route discovery or charging.

The refined baseline also recorded the exact raw mismatch for both route types:

```text
expected protocols: [{ x402: {} }]
received protocols: ["x402"]
```

After changing only the protocol representation, the same focused file passed
17/17. Its contract coverage uses the pinned third-party package rather than a
copied local schema and asserts:

- capability and solution raw metadata pass `PaymentInfoSchema`;
- `getOpenAPI()` retains nested fixed USD pricing and `protocols: ["x402"]`;
- `checkL2ForOpenAPI()` exposes `"0.021600 USD"` and the normalized protocol;
- the mocked global fetch is restored after each case;
- the preceding exact price/challenge parity checks remain green.

## Verification

- Real-parser contract file: 17/17 passed.
- Complete x402 family: 13 files, 153/153 passed.
- Full API suite: 249 files passed, 30 skipped; 3,658 tests passed, 314
  skipped.
- Fresh-worktree SDK and MCP builds: passed.
- Full monorepo typecheck: passed.
- API build: passed.
- Static guards for bare catches, user-controlled fetches, new console calls,
  and external-column access: passed. The external-column guard's npm workspace
  wrapper has a known working-directory assumption; its direct root invocation
  passed.
- Project context tests: 54/54 passed; context check reported no warnings.
- `git diff --check`: passed.
- GitHub `check` and `integration-db`: passed before merge.

## Independent review

The required different-provider route was attempted first. Claude Opus/high
effort timed out after 124 seconds without a verdict; Claude Sonnet/high effort
timed out after 94 seconds without a verdict.

Founder-authorized Codex fallback reviews then completed:

- plan review: initially `REVISE` for one medium test-return-shape error; the
  plan was corrected to assert `getOpenAPI()` nested pricing plus
  `checkL2ForOpenAPI()` output, restore global fetch, and cover cache-aware
  rollback; re-review returned `PASS`;
- technical/money-path review: `PASS`, zero findings;
- product/public-contract review: `PASS`, zero findings;
- fresh exact-commit review of
  `47646028d28a08a6e914432d2326c11ba1c4bbfc`: `PASS`, zero high or medium
  findings.

Every verification session completed. The outstanding Claude cross-provider
check is recorded at P1 in
`archive/sessions/2026-09-01-m2-claude-verification-backlog.md` and is not an
implementation blocker.

## Production verification

- `/health` switched from base `72eba362fdcf` to merge `b4e3904f2e98` at
  2026-09-01 14:42:12 Europe/Stockholm.
- Eleven canonical `/openapi.json` samples spanning 313 seconds all reported
  the merge commit and retained:
  - capability `csv-clean`: structured x402 object, `"0.021600"`;
  - solution `kyb-essentials-se`: structured x402 object, `"1.620000"`.
- Live `@agentcash/discovery@1.7.5` normalized both operations to
  `protocols: ["x402"]`, `authMode: "paid"`, fixed USD pricing, and exact
  prices `"0.021600 USD"` / `"1.620000 USD"`.
- An unauthenticated, unpaid `csv-clean` request returned HTTP 402 with x402 v2
  atomic amount `"21600"`. Converting the discovered `"0.021600"` price to
  micro-USDC also yields `"21600"`.
- No payment header was supplied, no payment was submitted, and no production
  settlement occurred.

## Authority and open items

The implementation conforms to active Notion decision `DEC-20260502-A`; it
does not create or revise a price decision. Repo-native authority remains
inactive. Notion remains the current Journal authority until cutover.

Open item: Claude must independently review the then-current exact commit and
production evidence when the provider is available. The repository backlog is
the durable queue; implementation and production have no known defect.

Journal:
`https://app.notion.com/p/3ce67c87082c81b1ba65c9b02e19838e?pvs=204`.
