---
doc_type: research
type: vendor
topic: open-places-data-licences
question: May Strale resell per-call place and local-business search results from Overture Maps Places and Foursquare Open Source Places, and which serving route needs no new paid vendor or account?
date: "2026-10-29"
status: current
sources:
  - https://docs.overturemaps.org/attribution/
  - https://docs.overturemaps.org/guides/places/
  - https://cdla.dev/permissive-2-0/
  - https://www.apache.org/licenses/LICENSE-2.0
  - https://docs.foursquare.com/data-products/docs/access-fsq-os-places
  - docs/strategy/2026-10-23-portfolio-plan.md
  - docs/strategy/2026-10-23-data-access-risk-rule-proposal.md
decisions:
  - DEC-20261023-A
  - DEC-20261024-B
---

# Open places data: licences and serving route

Portfolio plan item 2.5 (places and local-business search, approved under
DEC-20261024-B) says to use open places datasets, confirm their licences
first, and never scrape Google Maps. These are the licence findings, read on
29 October 2026, and the measurements behind the serving route. This is
evidence, not a decision.

## Overture Maps, places theme: usable

- **Licence per row, no share-alike.** The places guide says the theme "is
  published under the CDLA Permissive 2.0 and Apache 2.0 licenses, depending
  on the source" and "contains no OpenStreetMap data". So the ODbL
  share-alike on Overture's OSM-derived themes (base, buildings, divisions,
  transportation) does not reach places. Every row carries its own
  `sources[].license`. Release 2026-10-21.0 shows `CDLA-Permissive-2.0`
  (Meta, Microsoft, BrightQuery and other providers), `Apache-2.0`
  (Foursquare) and `CC0-1.0` (AllThePlaces).
- **CDLA-Permissive-2.0.** §1.1 lets a recipient "use, modify, and share
  the Data". §2.1 attaches one condition to sharing: make "the text of this
  agreement" available with the shared Data. §3.1 puts no restriction on
  Results. There is no share-alike clause and no limit on commercial use.
- **Apache-2.0** (the Foursquare rows). §4 says redistribution must include
  a copy of the licence and the NOTICE. Overture's attribution line for
  these rows is "Copyright 2024 Foursquare Labs, Inc. All rights reserved.
  Available under Apache 2.0."
- **Attribution.** Overture's attribution page gives one line per provider,
  for example "Data from Meta. Available under CDLA Permissive 2.0."
- **Access.** Releases are public GeoParquet on the AWS Open Data bucket
  `overturemaps-us-west-2`. Reads are anonymous, with no account and no
  click-through terms.

**Result: resale is permitted, on conditions.** Each answer must carry each
row's licence, the licence-text URLs and the attribution lines for the
sources it returns. places-search does this on every answer. It withholds
any row whose licence is not one of these three, and counts how many it
withheld. Recorded as `resale: permitted` in
`apps/api/src/lib/vendor-terms.data.json` and as vendor `overture-maps`
(active) in `config/vendors.yaml`.

## Foursquare Open Source Places: not used directly

- **Licence.** Apache-2.0. Commercial resale is permitted with the licence
  and the NOTICE.
- **Access.** The current route is the Places Portal's Iceberg catalogue,
  which needs an account and an access token. Sessions do not create
  accounts (DEC-20261027-C).
- **Not needed.** Foursquare's rows already reach Overture's places theme
  under Apache-2.0, and places-search returns them with Foursquare's
  attribution. Recorded as vendor `foursquare-os-places`, state held. A
  direct account is Petter's call, and only if Foursquare rows ever leave
  Overture.

## Under DEC-20261023-A

Openly licensed bulk data is the rule's preferred lane, and the manifest
records `lane: preferred`, `acquisition_method: licensed_bulk`. No platform
is fetched or scraped, so the never lane's Google Maps item does not apply.
The data holds business listings, not person profiles. Emails and social
handles in the data are not returned. Names, addresses, phone numbers and
websites are returned as the sources published them. A sole trader's
listing can identify a person, so the manifest declares
`processes_personal_data: true`.

## Serving route, chosen by measurement

The candidate routes were a new paid places API, a self-built index in
Postgres, or reading the public GeoParquet in place. The first adds a vendor
and spend, and the second adds ingest and a ~12 GB table. Reading in place
needs neither, so it was measured. The measurements came from this cloud
container, with DuckDB 1.5.6 and `@duckdb/node-api`, on release 2026-10-21.0.
That release has 16 files, 11.8 GB in total, 256 to 512 row groups each,
partitioned roughly by longitude. The end-to-end run of the finished
executor is in
`archive/receipts/2026-10-29-test-run-places-search-live-overture.json`.

| Setup | First query in a region | Repeat nearby | Resident memory |
|---|---|---|---|
| In the API process, footer cache on, glob over all 16 files | 9.1 s | 0.4 to 3.6 s | +400 MB over the API baseline, kept |
| Child process, row-group index, footer cache off | 2.2 to 7 s | 2.2 to 7 s | ~230 to 280 MB |
| Child process, row-group index, footer cache on for queried files only (chosen) | 3.3 to 7 s | 0.13 to 1.3 s | 210 to 375 MB over 10 cities |

The chosen design:

- **A child process** (`lib/overture-places/worker.ts`) is forked on first
  use. It handles one query at a time and stops after 2 minutes idle. It
  exits itself above 450 MB resident. With no traffic it holds no memory.
- **A row-group bbox index** is built once per release from the parquet
  footer statistics, and cached as a small JSON file in the temp directory.
  It sends DuckDB only the files whose row groups can intersect the query
  box; DuckDB then prunes row groups itself.
- **Cost.** There is no vendor bill. Railway bills memory while the worker
  runs, at about $10 per GB-month (from
  `docs/strategy/2026-08-receita-federal-bulk-ingest-design.md`). At 375 MB
  held all month, the worst case is about $3.75 a month; idle it is $0.
  Egress from the AWS Open Data bucket is free.
- **Releases.** The worker uses the newest release on the bucket, and falls
  back to the one before it if the newest has no places files yet.

## Open points

- **Latency was measured from this container, not from Railway** (US East to
  the us-west-2 bucket). It should be measured in production after deploy.
- **The DuckDB `httpfs` extension downloads** from extensions.duckdb.org on
  the worker's first start in each container. If that host becomes
  unreachable, places-search fails with a structured error, and the extension
  would then have to be installed in the Docker build.
