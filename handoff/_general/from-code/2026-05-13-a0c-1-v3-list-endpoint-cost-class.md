Intent: Close the A0c.2b "Awaiting production traffic" badge regression by extending GET /v1/capabilities (list) with `cost_class` + `last_customer_call_at`, matching what A0c.1.v2 added to the detail endpoint.

## Why this was broken

A0c.1.v2 (PR #97) added `cost_class` + `last_customer_call_at` to `GET /v1/capabilities/:slug` only. But strale-frontend's `useCapability(slug)` hook filters `useCapabilities()` locally — the list endpoint is the data source for *both* the `/capabilities` listing and the `/capabilities/:slug` detail page. So the badge silently failed everywhere. Confirmed in prod: `curl https://api.strale.io/v1/capabilities | jq '.capabilities[] | select(.slug=="agent-trace-analyze")'` returned neither field.

## What shipped — PR #103 (merged + deployed)

Branch: `fix/a0c-1-v3-list-endpoint-cost-class` → squash-merged into `main`.

Five files changed (273 insertions, 1 deletion):

1. **`routes/capabilities.ts`** — list handler now selects `id` (join key) and `cost_class`, batch-fetches `last_customer_call_at` per capability via a single GROUP BY query with the daily-digest filter convention (exclude `system@strale.internal`). Maps results back into rows by id, then strips id before the public response.
2. **`db/schema.ts`** — declares compound index `transactions_capability_id_created_at_idx` on `(capability_id, created_at)`.
3. **`lib/startup-migrations.ts`** — Block 0078 (`CREATE INDEX IF NOT EXISTS`) added + registered in BLOCKS array. Ensures the index is created at boot in prod per DEC-20260511-C (in-TS-block migration convention).
4. **`lib/startup-migrations.test.ts`** — BLOCKS array assertion 20 → 21, two behavioral tests for Block 0078.
5. **`routes/capabilities.integration.test.ts`** — 3 regression tests mirroring the production failure mode: `paid_prepaid` + no transactions → `last_customer_call_at: null` (canonical bug shape); `paid_prepaid` + customer transaction → matches `created_at`; `system@strale.internal` transactions excluded from MAX aggregation.

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 636 passed / 19 skipped
- `node apps/api/scripts/check-cost-class-coherence.mjs` — all classified capabilities OK
- CI on PR #103 — pass (45s)
- Post-deploy prod query:
  - agent-trace-analyze: `cost_class=paid_prepaid`, `last_customer_call_at=null` (canonical case — badge will render)
  - translate: `cost_class=paid_prepaid`, `last_customer_call_at=2026-04-28` (15d old, ≤ 30d window — badge suppressed)
  - 292/292 capabilities emit `cost_class` in list endpoint

## Open

- Browser-side visual confirmation on strale.dev/capabilities/agent-trace-analyze that the badge actually renders. Wire-shape is correct; the frontend logic from the prior A0c.2b PR (strale-frontend #6) should pick it up automatically.

## Non-obvious learnings

- The "extend the detail endpoint, frontend reads it" mental model was wrong. The frontend's `useCapability` hook is a *local filter* over `useCapabilities()`, not a separate fetch. Any field the detail UI needs must live on the list payload.
- The batched GROUP BY pattern in the list handler is shape-equivalent to the detail endpoint's per-cap subquery — same filter, same join semantics, just amortized across N caps. Index `transactions_capability_id_created_at_idx` is what makes it index-only.
