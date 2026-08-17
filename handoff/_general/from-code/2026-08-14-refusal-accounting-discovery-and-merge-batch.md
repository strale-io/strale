# 2026-08-14 — Refusal accounting, discovery ranking, and a twelve-PR merge batch

**Intent:** close out the in-flight agent work, then fix what verifying it exposed.

Twelve PRs merged and verified in production. Two findings I reported were wrong
and are corrected below — both mattered enough to change what got built.

---

## Corrections to earlier reporting

### The disposition table measured the wrong thing

I ranked capabilities by the share of `transactions` rows with `status='failed'`.
That counts `negative`, `known_bad` and `edge_case` tests, which deliberately send
invalid input: the capability correctly rejects it, the **test passes**, and the
execution is still recorded as failed. The measure punished capabilities for having
thorough negative coverage.

**98.1% of platform traffic is our own test harness** — 71,070 internal calls
against 1,348 real ones in a week. Any figure over `transactions` without excluding
it describes the test suite, not the product.

Worked example: I reported `brazilian-company-data` failing 58% and called it a live
revenue leak. It is **500/500 tests passing**. Real callers: 30 calls in 90 days, 12
failures, 11 of them upstream 429s, €1.00 lifetime revenue. The related claim that
agents "arrive holding a company name" is also unsupported — over 120 days the only
input key any real caller has sent is `cnpj`.

Corrected real-defect list is in `audit-output/disposition-correction-2026-08-14.md`.
`product-reviews-extract` (38/43 failing) and `llm-cost-calculate` (7/8) are the
sharpest; neither ranked near the top before.

**Use `test_results` for health, not `transactions`.** For customer-facing health,
filter `transactions` on `u.email <> 'system@strale.internal'` (include
`user_id IS NULL` for x402).

### The cost-control refusal alarm did not hold

I raised the guarded executor's ALLOW_MATRIX refusals as "the same bug as #231, a
third time". The evidence was real — 91 rows in 30 days across 8 capabilities,
classifying as `internal`, the "our bug until proven otherwise" bucket. The
conclusion was wrong. They never reach anything that scores, three times over:

1. `customer_paid` is `allow` for **every** cost class and for the unclassified row,
   so a refusal is unreachable from customer traffic regardless of ordering.
2. The quality floor excludes internal accounts by email suffix — verified by running
   its own `WHERE` clause: **0 of 91 rows survive**.
3. `test-runner.ts` never calls `recordFailure`; the breaker is driven only from the
   customer path.

Shipped as PR #232: regression tests pinning the coupling, no behaviour change.

---

## What shipped

| PR | What |
|---|---|
| #223, #226 | Receita Federal no-build design; disposition correction |
| #224, #227, #229, #230 | Registry name matching: refuse rather than silently return the wrong company |
| #225 | `/v1/suggest` returned a bundled solution for **every** query |
| #228 | `/a2a` had no rate limit and no input cap |
| #231 | Correct refusals were opening circuit breakers |
| #232 | Tests pinning why cost-control refusals are already inert |
| #233 | Dedup `SYSTEM_ACCOUNT_EMAIL`; stale scheduler docs; node_modules hazard |

### `/v1/suggest` (#225)

Solutions carried an unconditional `+3` bonus while raw token scores top out near 3,
so one matched word on a bundle beat every matched word on a capability. Production
returned a solution for every query tested — "validate an IBAN" → `payment-validate`,
"look up a Swedish company" → `verify-us-company`.

Which path was broken took two attempts to establish. `query_understood_as` returning
verbatim was **not** decisive — `fallbackRanking` does that too. The discriminator is
`total_matches`, which `fallbackRanking` caps at 10 while `suggestKeyword` leaves
uncapped. Production returned 209/156/202. Keyword path, confirmed.

### Circuit breaker vs refusals (#231)

Three correct refusals opened the breaker on `french-company-data`, a capability with
25 prior successes. Reproduced live, then fixed and re-verified: **five** consecutive
refusals now leave `consecutive_failures: 0`.

The sharpest find was that the quality floor's guard for this **was already written
and had never fired**: the taxonomy looks for `"distinct .* entities match"`, but the
real message says "entities **are exact** matches".

---

## Verified in production

- All five reported `/v1/suggest` queries now resolve to capabilities; workflow
  queries still get the bundle.
- `/a2a` limiter engages at exactly 60 (59×400, then 429); the `-32602` length
  refusal names the limit and the alternative.
- Five consecutive `french-company-data` refusals: breaker `state=closed`,
  `consecutive_failures=0`, `total_failures` unchanged.
- `canadian-company-data` name path: `SHOPIFY INC.`, corp 4261607,
  `match_confidence: exact`, 1006ms.

---

## Gate 5 closed on canadian-company-data

Done under DEC-20260812-A's escalation contract, which puts *fixture refresh* in the
platform-acts-alone column. Two writes, both gated by tooling that stopped me
correctly:

1. `sync-manifest-canonical-to-db.ts` — manifest declared `match_confidence: rare`
   (from #224) which the DB never gained.
2. `onboard.ts --backfill --force` — refused until I confirmed the slug's Class 4
   fields matched. All four did.

Result: 20/20, both entry points covered.

**Caveat worth carrying:** the sync's `--dry-run` reported one field of drift, but the
write also added `data_source` and `maintenance_class`. Additive over nulls, so
harmless — but the dry run under-reports, so do not treat it as a complete preview.

---

## Open

**Founder-gated**
- DENUE token for Mexico: https://www.inegi.org.mx/app/desarrolladores/generatoken/Usuarios/token_Verify

**In flight (agents)**
- `cost_class='free_unlimited'` audit — 193 active capabilities carry a class that
  disarms the quota guard built after the 2026-05-11 DE OpenRegister incident.
  `brazilian-company-data` is a confirmed case (ReceitaWS ~3 req/min). **Largest
  outstanding item.**
- `quality-aggregation` p95 polluted by zero-latency internal rows — p95 gates
  `max_latency_ms`. Skew is customer-favourable, so not urgent.
- `pickByName` consolidation across four registries.
- Triage of 13 stale PRs (#214 → #60).

**Known, unfixed**
- CLAUDE.md's kyc-*/verify-us-company line now points at the DB rather than restating
  status; the five are live and x402-enabled.
- `/v1/suggest` ties go to the solution — a business choice sitting inside a bug fix,
  flagged in #225 for Petter rather than decided.
- `match_reason` on the keyword path is the item's stock description, not a
  query-aware explanation.

---

## Process notes

**Verify against `origin/main`, not the working tree.** Cost real time three times
today. The checkout sat on a stale branch and produced confident wrong answers about
what had shipped — including one false "the floor path is still broken" report I
caught only by re-running against merged code.

**`rm -rf` on a worktree follows a `node_modules` junction and deletes the real one.**
Twice. No source lost, prod unaffected, ~2 minutes each. Use `npm install` inside each
worktree; remove with `git worktree remove`. Now recorded in CLAUDE.md via #233.

**Response shapes:** `/v1/do` nests under `result.output`. Parsing `output` yields
`None` for every field and reads like a broken capability. Cost one false alarm.
