Intent: portfolio plan item 2.5. Add places and local-business search from open places data, with the licences recorded before any code.

## Outcome

- **Licences recorded.**
  - Overture Maps places is CDLA-Permissive-2.0, Apache-2.0 or CC0-1.0 per row. It has no OpenStreetMap data, so no share-alike. Recorded as `resale: permitted` in `apps/api/src/lib/vendor-terms.data.json`, and as vendor `overture-maps` (active) in `config/vendors.yaml`.
  - Foursquare Open Source Places is Apache-2.0, but direct access needs a Places Portal account. Recorded as vendor `foursquare-os-places` (held). Its rows already reach us through Overture.
  - Research: `docs/research/2026-10-29-open-places-data-licences.md`.
- **New capability `places-search`, €0.05.**
  - Takes latitude, longitude, an optional query or category, a radius and a limit.
  - Returns name, category, address, coordinates, distance, source and licence per row. Every answer carries the attribution lines and the licence-text URLs. Rows under any other licence are withheld.
  - Lane `preferred`, `licensed_bulk`.
- **Serving route: DuckDB over Overture's public GeoParquet bucket**, read anonymously, with no account and no vendor.
  - DuckDB runs in a forked worker (`apps/api/src/capabilities/lib/overture-places/`). It answers one query at a time, stops after 2 minutes idle and retires itself above 450 MB.
  - A row-group bbox index, cached per release in the temp directory, prunes the files a query reads.
  - Measured, not on Railway: the first query in a region takes 3–7 s, warm queries 0.1–1.5 s, and an empty area 4 ms. Worker resident memory was 210–375 MB. Receipt: `archive/receipts/2026-10-29-test-run-places-search-live-overture.json`.
- New dependency: `@duckdb/node-api@1.5.6-r.1`. Its Linux x64 binding is 71 MB. The `httpfs` extension (21 MB) is installed in the Docker build, with a runtime install as the fallback.

## Next

- After deploy, run the **Onboard capability** workflow (slug `places-search`, discover on). Then check readiness on `/v1/internal/onboarding/readiness?slug=places-search`. This session holds no production write credential, so the pipeline's DB write and readiness happen there.
- Measure first-query latency and worker memory on Railway. The worst case is ~$3.75 a month of RAM while the worker is held. It is $0 idle.
- Dark launch per DEC-20260812-A: invisible and off x402 until its first green week.
