Intent: build `company-status-check` ("Is this company still alive?", portfolio plan item 1C.1, DEC-20261024-B) as a draft PR: a composite data lookup over existing registry and insolvency executors.

# 2026-10-26 — company-status-check (builder session)

Branch `feat/company-status-check` from `origin/main` `beafcb6`. Draft PR only; not merged, not on x402, nothing written to production.

## What shipped in the PR

- `apps/api/src/lib/company-status/{routing,normalise,compose}.ts`: country routing table, per-registry status normaliser (every row cites its source), orchestration with injected executor lookup.
- `apps/api/src/capabilities/company-status-check.ts`: registers the composite; calls registries through `getExecutor`.
- `manifests/company-status-check.yaml`: price 8 cents, `cost_class: free_quota`, `data_access: preferred / direct_api`, `x402_enabled` absent.
- Tests: normaliser (one per mapping row + unmapped per registry), routing invariants read from the manifests and `DEACTIVATED`, compose (success, unmapped, upstream failure, `checked:false`, validation-before-call, weakest-lane provenance).

## Decisions worth knowing

- 11 countries routed: AT AU EE FI FR GB HR IE LV SE SG. The other fourteen in production's `company_data_active_iso` are excluded with a stated reason in `EXCLUDED_COUNTRIES` (NO PL CZ GR: the executors' status does not report deleted / struck-off / liquidating entities, fix in a separate PR then re-add; checks pending: BE BR DE ES JP; no usable status: US SI SK; vocabulary not verifiable here: CA CH).
- `getExecutor`, not `getDirectExecutor`: keeps provider chains (FI, NO, CH) and the data-access stamp. Billing and the breaker record live above it. Underlying breakers are read-only peeked, never written.
- External cost is 0 cents on every routed path (identifier lookups only; no executor name-resolution/LLM step reachable). `external_cost_cents` is a DB column, not a manifest field, so the PR states 0.

## After the independent review (NO-GO on 27ea39e9, fixed on this branch)

NO PL CZ GR excluded; not-found (matchers anchored to each executor's exact wording); JSON-number identifiers accepted for AU only; not-found / invalid-identifier answers become refusals (no per-country breaker marker exists, so a manifest limitation says one registry outage can pause all countries); SE status from open proceedings and `checked:false` when none listed; FI only "active" mapped; GR bankrupt row kept for the follow-up; AT dissolved is in_liquidation; composite is `screening_signal` with financial and sensitive_special data; recorded live fixtures in `apps/api/src/lib/company-status/__fixtures__/dead-entities.json`.

## Found on the way (not fixed here)

- Executors for the separate PR: norwegian-company-data (ignores SlettetEnhet/slettedato), polish-company-data (reads czyWykreslony, absent in KRS JSON), cz-company-data (reads only stavZdrojeRos), greek-company-data (tests "ενεργ" before "ανενεργ"), finnish-company-data (any open companySituation is reported as "liquidation"; non-trade-register entities as "inactive"), swedish-company-data (drops Bolagsverket's `fel` marker on the proceedings block).

- `fr-bodacc-lookup` clamps `limit` to 200 but the BODACC API rejects anything over 100 with HTTP 400. The composite uses 100.
- `singapore-company-data` returns the name as `entity_name`; `company_name` is null. The composite falls back to `entity_name`.

## Not verified

- SE, GB, AT, AU, GR, HR live runs: the container has no Bolagsverket, Companies House, JustizOnline, ABR, GEMI or SUDREG credentials. FR, IE, SG, LV, EE and FI ran live (see the PR).
- `onboard.ts --dry-run` stops at the production-write guard; `validate-capability.ts` needs `DATABASE_URL`. Manifest validation inside onboard passed.

next_action: orchestrator review of the draft PR; then the production onboarding commands listed in the PR under "Production steps left".
