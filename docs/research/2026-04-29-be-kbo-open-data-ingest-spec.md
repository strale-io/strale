# BE KBO Open Data first-party ingest — design + registration spec

**Date:** 2026-04-29
**Status:** Spec only. Registration not yet sent. Ingest code not yet built.
**Tier:** DEC-20260428-A Tier 2 → moving to Tier 3 (licensed-bulk preferred over scraping-derived) once this lands.

## Why this exists

The 2026-04-29 Tier-1 cleanup (commit `284a70b`) dropped the kbopub
Browserless fallback from `belgian-company-data` and left CBEAPI.be as
the sole path. CBEAPI is a third-party JSON wrapper of unverifiable
licensure — it works, but it's a Tier-2 vendor whose own re-use
position with FPS Economy isn't documented from outside.

The right long-term posture is first-party ingest of the FPS Economy
KBO Open Data SFTP feed. That gives Strale:

- Direct re-user agreement with FPS Economy under Belgian re-use law
- No dependency on a third-party wrapper's uptime or ToS
- Documented provenance per fact (per-row source, daily snapshot date)
- License terms in writing (the FPS Economy ToU is the contract)

Once this is live, BE moves from `acquisition_method:
vendor_aggregation` to `acquisition_method: licensed_bulk` and CBEAPI
is removed.

## Step 1 — Registration (Petter, manual)

Send this email from `petter@strale.io` to `kbo-bce-webservice@economie.fgov.be`:

> **Subject:** Open Data registration request — KBO/BCE re-user (Strale.io)
>
> Bonjour / Goedendag,
>
> I am writing on behalf of Strale.io (Strale AB, Sweden), an EU-based
> data-services company, to request registered access to the KBO/BCE
> Open Data feed via SFTP.
>
> We integrate Belgian company-register data into our compliance and
> KYB tooling for B2B customers (agent-driven verification, due
> diligence). Our use is commercial but does not include direct
> marketing on natural-person register data; we propagate the FPS
> Economy attribution and ToU constraints downstream to our customers.
>
> Could you please:
> 1. Send the latest "KBO Open Data — terms of use" / "Voorwaarden voor
>    hergebruik" so I can sign it,
> 2. Provision an SFTP account once the ToU is countersigned, and
> 3. Point me to the current Cookbook KBO Open Data (Versie R011.00 or
>    newer) for the file specification.
>
> Company / contact:
> - Strale AB (Sweden), VAT SE-...   [Petter: fill in real VAT]
> - Petter Lindström, founder
> - Email: petter@strale.io
> - Site: https://strale.dev
>
> Vriendelijke groeten / Cordialement,
> Petter Lindström

When the ToU document arrives, read it, save a copy in
`docs/legal/be-kbo-open-data-tou-<date>.pdf`, and confirm the
"commercial reuse permitted" + "no direct marketing on personal
data" clauses are intact.

**Don't sign anything that broadens the obligations** — for instance,
clauses requiring us to delete cached data within X hours of an FPS
Economy notification, or to surface FPS Economy's contact details on
every customer-facing response. Flag those back here before signing.

## Step 2 — Ingest architecture (build after credentials arrive)

### File set (per daily SFTP drop)

The KBO Open Data feed publishes 7 CSV files in a daily ZIP, plus a
delta ZIP showing changes since the last full snapshot. 31-day
retention on the SFTP. Cookbook: *Cookbook KBO Open Data Versie
R011.00* (link them after registration confirms the latest version).

| File | Granularity | Primary key | Why we want it |
|---|---|---|---|
| `enterprise.csv` | 1 row per entity | `EnterpriseNumber` | Core register record |
| `establishment.csv` | 1 row per establishment unit | `EstablishmentNumber` + `EnterpriseNumber` | Branch / unit count |
| `denomination.csv` | 1 row per (entity, language, type) | `(EntityNumber, Language, TypeOfDenomination)` | Names — multi-language, multi-type (legal name vs commercial name vs abbreviation) |
| `address.csv` | 1 row per (entity, address-type) | `(EntityNumber, TypeOfAddress)` | Registered seat + correspondence addresses |
| `contact.csv` | 1 row per contact | `(EntityNumber, ContactType, EntityContact)` | Phone / email / web — *handle GDPR carefully; mostly natural-person data* |
| `activity.csv` | 1 row per (entity, NACE code, version) | `(EntityNumber, ActivityGroup, NaceVersion, NaceCode)` | NACE 2003 / 2008 / 2025 industry codes |
| `branch.csv` | Foreign branches | `BranchNumber` | Foreign-incorporated branches in BE |

### Local schema (Postgres, new migration)

```sql
-- New migration: drizzle/00XX_kbo_bce_local_register.sql

CREATE TABLE be_kbo_enterprise (
  enterprise_number     TEXT PRIMARY KEY,           -- 10 digits, no dots
  status                TEXT,
  juridical_situation   TEXT,
  type_of_enterprise    TEXT,
  juridical_form        TEXT,
  juridical_form_cac    TEXT,
  start_date            DATE,
  snapshot_date         DATE NOT NULL,              -- which feed run produced this row
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE be_kbo_establishment (
  establishment_number  TEXT PRIMARY KEY,
  enterprise_number     TEXT NOT NULL REFERENCES be_kbo_enterprise(enterprise_number) ON DELETE CASCADE,
  start_date            DATE,
  snapshot_date         DATE NOT NULL
);
CREATE INDEX be_kbo_estab_enterprise_idx ON be_kbo_establishment(enterprise_number);

CREATE TABLE be_kbo_denomination (
  entity_number         TEXT NOT NULL,              -- enterprise OR establishment number
  language              SMALLINT NOT NULL,          -- 0=unknown, 1=FR, 2=NL, 3=DE, 4=EN
  type_of_denomination  SMALLINT NOT NULL,          -- 1=social, 2=abbrev, 3=commercial
  denomination          TEXT NOT NULL,
  snapshot_date         DATE NOT NULL,
  PRIMARY KEY (entity_number, language, type_of_denomination)
);
CREATE INDEX be_kbo_denom_entity_idx ON be_kbo_denomination(entity_number);
CREATE INDEX be_kbo_denom_search_idx
  ON be_kbo_denomination USING gin (to_tsvector('simple', denomination));

CREATE TABLE be_kbo_address (
  entity_number         TEXT NOT NULL,
  type_of_address       TEXT NOT NULL,              -- REGO=registered, BAET=correspondence, etc.
  country_nl            TEXT,
  country_fr            TEXT,
  zipcode               TEXT,
  municipality_nl       TEXT,
  municipality_fr       TEXT,
  street_nl             TEXT,
  street_fr             TEXT,
  house_number          TEXT,
  box                   TEXT,
  extra_address_info    TEXT,
  date_striking_off     DATE,
  snapshot_date         DATE NOT NULL,
  PRIMARY KEY (entity_number, type_of_address)
);
CREATE INDEX be_kbo_addr_entity_idx ON be_kbo_address(entity_number);

CREATE TABLE be_kbo_activity (
  entity_number         TEXT NOT NULL,
  activity_group        TEXT NOT NULL,
  nace_version          TEXT NOT NULL,              -- "2003", "2008", "2025"
  nace_code             TEXT NOT NULL,
  classification        TEXT,                       -- MAIN, SECO, ANCI
  snapshot_date         DATE NOT NULL,
  PRIMARY KEY (entity_number, activity_group, nace_version, nace_code)
);
CREATE INDEX be_kbo_activity_entity_idx ON be_kbo_activity(entity_number);

CREATE TABLE be_kbo_contact (
  entity_number         TEXT NOT NULL,
  entity_contact        TEXT NOT NULL,              -- ENT or EST
  contact_type          TEXT NOT NULL,              -- TEL, EMAIL, WEB
  value                 TEXT NOT NULL,
  snapshot_date         DATE NOT NULL,
  PRIMARY KEY (entity_number, entity_contact, contact_type, value)
);

-- One row per ingest run — used for staleness gate (DEC-20260428-B
-- engineering bar), and for the snapshot_date stamp on every row.
CREATE TABLE be_kbo_snapshots (
  snapshot_date         DATE PRIMARY KEY,
  full_or_delta         TEXT NOT NULL CHECK (full_or_delta IN ('full', 'delta')),
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows_enterprise       INTEGER,
  rows_establishment    INTEGER,
  rows_denomination     INTEGER,
  rows_address          INTEGER,
  rows_activity         INTEGER,
  rows_contact          INTEGER
);
```

### Daily ingest job

`apps/api/scripts/kbo-bce-ingest.ts` (to be written):

1. Connect to FPS Economy SFTP (creds from env: `KBO_SFTP_HOST`,
   `KBO_SFTP_USER`, `KBO_SFTP_PASSWORD` or key path).
2. List remote files; pick the latest `KboOpenData_<YYYYMMDD>_Full.zip`
   we haven't yet ingested. (Delta files can be a v2 optimization.)
3. Download to `/tmp/kbo/<date>/`.
4. Unzip.
5. Stream-parse each CSV with `csv-parse`. UPSERT into the matching
   `be_kbo_*` table with `snapshot_date = <date>` on every row.
6. Wrap each table-load in a transaction; rollback on error.
7. Insert/update the row in `be_kbo_snapshots` with row counts.
8. Delete the temp directory.
9. Emit a structured log `{label: "kbo-bce-ingest-done", snapshot_date,
   rows_*, duration_ms}` for `meta-monitoring` to pick up.

Schedule: daily at `04:00 UTC` (FPS Economy publishes overnight CET).
Use `apps/api/src/jobs/test-scheduler.ts` if jobs are kept inside the
API process, or a Railway cron worker if we'd rather isolate it.

### Stale-data circuit breaker (DEC-20260428-B requirement)

If `be_kbo_snapshots.snapshot_date` is older than **7 days** at request
time, the executor must:
- Return a structured error `{error_code: "DATASET_STALE",
  snapshot_date, message: "Belgian KBO data is stale (last refresh
  YYYY-MM-DD); operator has been paged."}`
- Log a `kbo-bce-stale` event so the meta-monitoring channel picks it up.

7 days picked because the FPS Economy SFTP retains files 31 days, so
4-7 missed ingests is recoverable, but more than that means we're
silently serving outdated data — which is what DEC-20260428-B is
designed to prevent.

### Executor migration (final cutover)

Replace `belgian-company-data.ts` lookup body with:

1. Validate input (existing logic stays).
2. Find by KBO number → `SELECT * FROM be_kbo_enterprise WHERE
   enterprise_number = $1` (10-digit, no dots).
3. Find by name → full-text search on `be_kbo_denomination` denomination
   `to_tsquery`, prefer `type_of_denomination = 1` (social name) over
   commercial.
4. Hydrate from joined tables:
   - registered address from `be_kbo_address` where `type_of_address = 'REGO'`
   - main NACE from `be_kbo_activity` where `classification = 'MAIN'`
     and `nace_version` is the latest available for that entity
   - all denominations from `be_kbo_denomination`
5. Provenance: `acquisition_method: licensed_bulk`, `source:
   FPS Economy KBO Open Data`, `snapshot_date: <from be_kbo_snapshots>`,
   `license: "FPS Economy KBO Open Data ToU"`,
   `license_url: <link to PDF in docs/legal/>`.
6. Remove the CBEAPI path entirely. The capability becomes
   first-party-licensed and is no longer dependent on an external API
   at request time.
7. Add to `output_field_reliability`: a new field `snapshot_date` (when
   the FPS Economy snapshot used to answer this query was published).
8. Update manifest:
   - `data_source_type: licensed_bulk` (new value worth introducing)
   - or keep `api` but flip the description to make clear this is
     "from local replica of FPS Economy KBO Open Data, refreshed daily"
   - Add a new limitation: "Live filings appear after the next 04:00
     UTC ingest cycle (max 24h lag)."

## Step 3 — Estimate

Once registration unblocks: **~2 days for a clean implementation**:
- 0.5 day: SFTP client + downloader + zip handler
- 0.5 day: per-file CSV parser + upsert SQL (six tables)
- 0.25 day: stale-data gate + meta-monitoring hook
- 0.25 day: executor cutover + provenance update
- 0.5 day: smoke + edge cases (entity with no establishments, foreign
  branch, dissolved entity, multilingual denomination tie-breaks) +
  CBEAPI removal + commit

## Open dependencies on Petter
1. Send the registration email above, confirm receipt and provisioning.
2. Read the FPS Economy ToU when it arrives, flag any non-standard
   clauses, then sign.
3. Add SFTP credentials to Railway env vars (`KBO_SFTP_*`).
4. (Optional) Decide whether the ingest job lives in the API process or
   a separate Railway worker — leaning toward separate for isolation.

## What I did *not* do in this scaffold
- Did not send any email or provision anything externally.
- Did not write the SFTP client or DB migration files (those land
  alongside the implementation, after credentials are in hand).
- Did not pre-create an empty `kbo-bce-ingest.ts` to avoid scaffolding
  rot. The spec above is precise enough to guide the build.

## When this lands, two things change
1. `belgian-company-data` provenance flips from `vendor_aggregation`
   (CBEAPI) to `licensed_bulk` (FPS Economy KBO Open Data).
2. CBEAPI dependency is removed: no `CBEAPI_KEY` requirement, no
   third-party uptime risk, no Tier-2 ToS open question.
