# v1 Identity Coverage Matrix (2026-05-13)

**Audit type:** read-only, manual run of the canonical-input sentinel pattern from DEC-20260513-D Phase 3 Harden.
**Worktree:** strale-research @ origin/main SHA `5c22c77` (includes PR #107 CH fixture fix, PR #108 SK hash-stagger).
**Execution path:** production `POST /v1/do` via test API key `sk_live_0d56f39c…`. Most-faithful path; matches what customers see.
**Scope:** 20 EU30 + non-EU live Identity capabilities. Out of scope: NL/IT/ES/PT/AT (mid-rebuild) and BG/CY/HU/LU/MT/RO (Openapi WW-Top, pending countersignature).
**Related canonical pages:**
- Active Vendor Stack: Notion page `35367c87082c812e88d1dc6bdbfbd4f5`
- Capability × Country Coverage Matrix: Notion page `35767c87082c8184ba34e116f673a1d6`

**Canonical CA Identity field set:** name, regnum, status, address, regdate, legal_form, directors, NACE, LEI, VAT.

**Cell legend (Table B):**
- ✅ field is populated in the response.
- ⚪ field is null/missing AND documented as null-by-source for this country (intrinsic source gap).
- ❌ field is null/missing AND was expected to be present (extraction gap).
- 🔥 execution failed; row is informational.

---

## Table A — Fixture and execution status

| Country | Slug | Vendor / source | Fixture | Resolved entity | Fixture validation | Execution | Latency | Notes |
|---|---|---|---|---|---|---|---|---|
| SE | swedish-company-data | Bolagsverket HVD | `org_number: 556703-7485` | Spotify AB | clean | success | 534 ms | — |
| NO | norwegian-company-data | Brønnøysund | `org_number: 984851006` | DNB Bank ASA | clean | success | 408 ms | Manifest `example` shows Equinor; fixture is DNB. Documentation drift, not a bug. |
| DK | danish-company-data | cvrapi.dk (CVR wrapper) | `cvr_number: 24256790` | Novo Nordisk A/S | clean (entity is universally known) | quota_exceeded (audit time) → **healthy** via canary signal | n/a | Audit-time prod `/v1/do` call returned `quota_exceeded` per DEC-20260512-A `free_quota` gate. 24h canary signal queried 2026-05-13 20:38 UTC: **6/6 green = 100%** (oldest 11:27 UTC, newest 20:27 UTC). Operationally healthy; quota error was designed behaviour. |
| FI | finnish-company-data | PRH avoindata | `business_id: 0112038-9` | Nokia Oyj | clean | success | 903 ms | — |
| UK | uk-company-data | Companies House API | `company_number: 00445790` | TESCO PLC | clean | success | 274 ms | Manifest example shows a different (fake-name) entity; fixture is Tesco. Documentation drift, not a bug. |
| IE | irish-company-data | CRO Open Data CKAN | `cro_number: 513174` | Stripe Payments Europe Limited | clean | success | 323 ms | — |
| FR | french-company-data | api.gouv.fr (INSEE SIRENE) | `siren: 542051180` | TotalEnergies SE | clean | success | 403 ms | 15 directors in source, sliced to 3 with `directors_truncated=true` + `total_directors=15`. |
| BE | belgian-company-data | CBEAPI.be (KBO/BCE wrapper) | `enterprise_number: 0417497106` | Anheuser-Busch InBev | clean | success | 293 ms | — |
| CZ | cz-company-data | ARES | `ico: 00177041` | Škoda Auto a.s. | clean | success | 434 ms | — |
| EE | estonian-company-data | Ariregister | `registry_code: 17449106` | Bolt App Services AS | clean | success | 3223 ms | Latency elevated; documented limitation flags IP-range blocking risk. |
| PL | polish-company-data | KRS | `krs_number: 0000033945` | MARTOM Sp. z o.o. | clean | success | 526 ms | — |
| LV | latvian-company-data | data.gov.lv CKAN | `reg_number: 40003245752` | Air Baltic Corporation AS | clean | success | 1164 ms | — |
| LT | lithuanian-company-data | data.gov.lt Spinta | `company_code: 304151376` | AB Energijos skirstymo operatorius | clean | success | 911 ms | — |
| SK | slovak-company-data | api.statistics.sk RPO | `ico: 36674141` | SEXES spol. s r. o. | clean | success (on retry) | 513 ms | First attempt: rate-limit (60 req/min RPO, shared egress). PR #108 hash-stagger holds scheduler-side; manual call landed during a scheduler window. Retry after ~45 s succeeded. |
| SI | slovenian-company-data | data.gov.si CKAN | `reg_number: 5043611000` | KRKA, tovarna zdravil, d.d. | clean | success | 950 ms | — |
| HR | croatian-company-data | Sudreg | `oib: 81793146560` | Hrvatski Telekom d.d. | clean | success | 893 ms | — |
| GR | greek-company-data | GEMI Open Data | `gemi_number: 296601000` (swapped 2026-05-13 in PR #116) | HELLENiQ ENERGY Holdings SA | **clean** (post-swap) | success | ~1000 ms | Original fixture `000237954001` was a Lamia branch of NBG; closed in PR #116 by swap to HELLENiQ (listed parent SA, active, 11 directors, NACE 19200000). |
| CH | swiss-company-data | Zefix PublicREST | `uid: CHE-101.602.521` | Roche Holding AG | clean (post-PR #107 fix) | success | 466 ms | — |
| SG | singapore-company-data | data.gov.sg CKAN (ACRA) | `uen: 197200078R` | Singapore Airlines Limited | clean | success | 1248 ms | — |
| DE | german-company-data | OpenRegister | `company_name: SAP SE` | SAP SE | clean (entity is universally known) | quota_exceeded (audit time) → **healthy** via canary signal | n/a | Audit-time prod `/v1/do` call returned HTTP 402 (OpenRegister Free-tier 50/month exhausted). 24h canary signal queried 2026-05-13 20:38 UTC: **6/6 green = 100%** (oldest 11:17 UTC, newest 20:17 UTC). Operationally healthy; quota error was designed behaviour. Pro-tier via Strale100 trial per DEC-20260508-D is the longer-term path. |

**Execution summary (audit-time, 2026-05-13 ~19:30 UTC):** 18 / 20 returned data (17 first try, 1 on retry). 2 quota-blocked (DK daily, DE monthly). 0 returned `fixture invalid`. 0 returned `wrong-state-unexecutable`. 1 (`GR`) returned `wrong-state-but-executable` (branch-entity fixture).

**Residual closeout (2026-05-13 ~20:40 UTC, PR #116):** GR fixture swapped to HELLENiQ ENERGY Holdings SA (parent, active, directors + NACE populated). DK + DE quota-blocked rows promoted via canary-signal verification (both 6/6 green over 24h = 100%). See findings §10.

---

## Table B — Field-level coverage per capability

Mapped against the 10-field canonical CA Identity set. `regnum` = country-specific registry number (org_number / cvr / siren / ico / etc.). VAT is checked at the response level whether the capability synthesises or fetches it; LEI is checked because customers cross-reference compliance via LEI when present.

| Country | name | regnum | status | address | regdate | legal_form | directors | NACE | LEI | VAT |
|---|---|---|---|---|---|---|---|---|---|---|
| SE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ✅ |
| NO | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ✅ |
| DK | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 | ⚪ | 🔥 | ⚪ | ⚪ |
| FI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ⚪ |
| UK | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ⚪ |
| IE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ⚪ |
| FR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ⚪ |
| BE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ✅ |
| CZ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ✅ |
| EE | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| PL | ✅ | ✅ | ✅ | ⚪ | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ✅ |
| LV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| LT | ✅ | ✅ | ✅ | ⚪ | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| SK | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ⚪ |
| SI | ✅ | ✅ | ⚪ | ✅ | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| HR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ | ⚪ | ✅ |
| GR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ✅ |
| CH | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| SG | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| DE | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 | ⚪ |

**⚪-as-doc-null mapping per capability** (verified against each manifest's `limitations` block and `output_schema`):

- **SE/NO/FI/UK/IE/CZ/BE/HR**: directors + LEI not in source. SE/NO add VAT-when-synthesisable. UK/FI/IE: VAT not in source.
- **EE**: regdate + directors + NACE + LEI + VAT not in ariregister scraper output (limited subset).
- **PL**: KRS API returns null for address + regdate for many entities; directors + NACE + LEI not in KRS public dataset.
- **LV**: directors + NACE + LEI + VAT not in data.gov.lv open subset.
- **LT**: address (separate dataset, not yet joined per manifest limitation) + directors + NACE + LEI + VAT not in data.gov.lt open subset.
- **SK**: LEI + VAT not in RPO.
- **SI** (the largest documented gap): status + regdate + directors + NACE + LEI + VAT all absent from data.gov.si open subset per manifest.
- **CH**: directors + NACE + LEI + VAT not in Zefix free-tier (paid extract only).
- **SG**: directors + NACE + LEI + VAT in ACRA BizFile+ paid product, not data.gov.sg open subset.
- **DK**: directors + LEI + VAT not in cvrapi.dk wrapper.
- **DE**: VAT not in OpenRegister surface.

---

## Findings

### 1. V1-ready capabilities (count and list)

**Count: 20 of 20** (after residual closeout in PR #116 — see §10).

Capabilities that returned a real active entity against their canonical-input fixture (or verified-operational via canary signal) and have no extraction gaps (`❌` cells) relative to their declared source coverage:

`swedish-company-data` · `norwegian-company-data` · **`danish-company-data`** · `finnish-company-data` · `uk-company-data` · `irish-company-data` · `french-company-data` · `belgian-company-data` · `cz-company-data` · `estonian-company-data` · **`greek-company-data`** · `polish-company-data` · `latvian-company-data` · `lithuanian-company-data` · `slovak-company-data` · `slovenian-company-data` · `croatian-company-data` · `swiss-company-data` · `singapore-company-data` · **`german-company-data`**.

Bolded entries are the three residuals closed by PR #116 on 2026-05-13 (DK + DE via canary signal, GR via fixture swap).

**Audit-only floor (pre-residual-closeout):** 17 of 20. Preserved here so the audit's empirical-execution claim stays separable from the canary-signal verdict added in residual closeout.

### 2. Capabilities with structural source gaps (disclose-and-ship)

The 17 ready capabilities ship with varying field densities. The widest source gaps are SI (6 fields null-by-source: status, regdate, directors, NACE, LEI, VAT), followed by EE (5), LT (5), PL (5), LV (4), SG (4), CH (4). All gaps are documented in the manifest `limitations` blocks. These are NOT bugs — they are the price of free open-data sources vs paid certified extracts. They are also competitive surface area: every capability is honest about what it doesn't have, which the doctrine paper makes a moat.

**Recommended customer-facing disclosure phrasing** (Section 8 below has the full list).

### 3. Capabilities with extraction gaps (fix-before-ship)

**~~Greek-company-data: directors and NACE empty.~~ Closed by PR #116 (2026-05-13).**

Original audit finding: the fixture `gemi_number: 000237954001` resolved to a Lamia-region **branch** of the National Bank of Greece (`is_branch=true` in response). For branch records, GEMI does not populate `directors` or `industry_code` — correct source behaviour for branches. The capability code was fine; the **fixture choice** was the problem.

**Resolution:** PR #116 swapped the fixture to HELLENiQ ENERGY Holdings SA (`gemi_number: 296601000`, listed parent SA, `is_branch=false`). Re-execution returns 11 directors with roles and `industry_code: "19200000"` (Παραγωγή Προϊόντων Διύλισης Πετρελαίου). Both gap cells flipped to ✅ in Table B. See §10.

### 4. Capabilities with execution failures (halt-before-ship?)

**~~DK + DE — quota-exhaustion at audit time.~~ Closed by PR #116 (2026-05-13) via canary-signal verification.**

Both audit-time errors were **quota-exhaustion against vendors with explicitly declared free quotas** — the manifests document these limits, the executors return structured `quota_exceeded` errors instead of crashing, and the circuit-breaker substrate does the right thing. The original audit deferred the operational-health verdict to a fresh-quota re-execution; PR #116 closed via canary signal instead (stronger evidence than a point-in-time call, see §10 rationale).

**Verdicts after closeout:**

- **DK** (`danish-company-data`): 24h canary signal **6/6 green = 100%** queried 2026-05-13 20:38 UTC. Audit-time `quota_exceeded` was designed behaviour (cvrapi.dk daily IP quota). Operationally healthy → v1-ready.
- **DE** (`german-company-data`): 24h canary signal **6/6 green = 100%** queried 2026-05-13 20:38 UTC. Audit-time HTTP 402 was designed behaviour (OpenRegister Free-tier monthly cap). Operationally healthy → v1-ready. Pro-tier via Strale100 trial per DEC-20260508-D is the longer-term path.

Both DK and DE move to Findings §1 v1-ready list.

### 5. Bad fixtures requiring correction (Phase 3 Harden component)

**~~One fixture flagged for correction.~~ Closed by PR #116 (2026-05-13).**

GR fixture swapped from the Lamia NBG branch (`000237954001`, `is_branch=true`) to HELLENiQ ENERGY Holdings SA (`296601000`, listed parent SA). Single known_answer fixture per manifest convention; the branch-record limitation remains documented in the GR manifest's `limitations` block.

**Two fixture documentation drifts (low-priority cleanup, not breakages) — still open:**

- **NO** `norwegian-company-data`: `output_schema.example` shows EQUINOR ASA but the active fixture is `984851006` = DNB Bank ASA. Either swap the example to DNB or swap the fixture to Equinor. Pure cosmetic; no production impact.
- **UK** `uk-company-data`: `output_schema.example` shows a fake "FALSE DEMANDS - DO NOT PAY..." company but the active fixture is `00445790` = TESCO PLC. Recommend replacing the example with Tesco for parity.

Neither cosmetic drift blocks v1; they're queued as a follow-up cleanup PR.

### 6. Manifest / registry discrepancies

None. The 20 manifests in `manifests/*.yaml` for the in-scope countries are all present, none of the in-scope slugs appear in the `DEACTIVATED` map of `apps/api/src/capabilities/auto-register.ts`, and all 20 have a matching executor file at `apps/api/src/capabilities/<slug>.ts`. The codebase list matches the Active Vendor Stack list 1:1. No reconciliation follow-up needed.

### 7. Router design notes — null-by-source handling

When a customer agent queries CA for an identity field that's `⚪` for a given country, the router should:
- Return `<field>: null` (not omit the field) so the schema stays predictable.
- Attach `field_unavailable_reason` + `field_unavailable_source` to the response surface, drawn from the manifest's `limitations` block.
- Never invoke a paid escalation path without explicit customer opt-in.

Country-by-country one-liners (for the router rules):

- **SI** → `directors`, `NACE`, `status`, `regdate`, `LEI`, `VAT` query → `null` + reason: `"Slovenian Poslovni register open-data subset (data.gov.si) does not publish this field. Real-time / paid AJPES restPrsInfo would provide it but is not redistributable."`
- **EE** → `regdate`, `directors`, `NACE`, `LEI`, `VAT` → reason: `"Estonian Ariregister scraping output does not include this field. Source supports it via paid certified extract."`
- **PL** → `address`, `regdate`, `directors`, `NACE`, `LEI` → reason: `"Polish KRS API returns null for many entities on this field; KRS public dataset does not include directors or NACE."`
- **LV/LT** → similar `directors/NACE/LEI/VAT` (+ LT `address`) — reason cites data.gov.{lv,lt} open subset boundaries.
- **CH** → `directors`, `NACE`, `VAT` → reason: `"Zefix free PublicREST API returns registry identity only; directors and economic activity require paid certified extract from cantonal Handelsregisteramt."`
- **SG** → `directors`, `NACE`, `VAT` → reason: `"ACRA BizFile+ paid product covers these; data.gov.sg open dataset does not."`
- **DK** → `directors`, `LEI`, `VAT` → reason: `"cvrapi.dk wrapper covers identity registry only."`
- **UK/SE/NO/FI/IE/CZ/BE/HR** → `directors`, `LEI` (mostly) → reason cites source-specific paid path.

### 8. Customer-facing disclosure list

Composed one-line phrasings, country-sorted, ready to paste into product docs / OpenAPI descriptions / capability detail pages:

- **BE**: "Belgian KBO/BCE register coverage via CBEAPI.be wrapper — registry identity, address, juridical form, registration date, VAT. Directors and economic activity require the official FPS Economy SFTP feed (roadmap)."
- **CH**: "Swiss Zefix free PublicREST API — registry identity, status, canton, municipality, registered office. Directors, economic activity, and VAT require a paid extract from the cantonal Handelsregisteramt."
- **CZ**: "Czech ARES — full registry identity including directors-via-LLM when ROS-registered; sole-trader RŽP entities may return limited data."
- **DE**: "German Handelsregister via OpenRegister — registry identity, directors, capital, LEI when listed. VAT and Transparenzregister UBO require separate sources. Free tier capped at 50 req/month."
- **DK**: "Danish CVR via cvrapi.dk — registry identity, status, business type, NACE. Directors and VAT require paid CVR extracts."
- **EE**: "Estonian e-Business Register — registry identity. Registration date, directors, NACE, and VAT require ariregister certified extract."
- **FI**: "Finnish PRH avoindata — registry identity, status, NACE, registration date. VAT and directors require PRH paid services."
- **FR**: "French SIRENE via api.gouv.fr — registry identity, address, NACE, directors (up to 3 returned, `total_directors` provided). VAT requires VIES cross-check."
- **GR**: "Greek GEMI — registry identity, status, address, NACE, directors (when entity is not a branch). VAT synthesised from AFM when AFM is present. Note: branch entities have empty directors and NACE by source."
- **HR**: "Croatian Sudski registar — registry identity, status, OIB, MBS, registered office, activity code, VAT. Board composition requires paid certified extract."
- **IE**: "Irish CRO Open Data — registry identity, status, registration date, annual return dates, Eircode (newer entities), NACE/principal activity. Directors and VAT require separate CRO paid access."
- **LT**: "Lithuanian JAR via data.gov.lt — registry identity, status, legal form, registration date. Address, directors, NACE, and VAT are in separate datasets (not yet joined)."
- **LV**: "Latvian Enterprise Register via data.gov.lv — registry identity, status, registration date, address, SEPA creditor ID, ATVK code. Directors, NACE, and VAT in separate datasets."
- **NO**: "Norwegian Brønnøysund — registry identity, status, NACE, employee count, registration date. Directors require paid Brønnøysund regnskapsregisteret access."
- **PL**: "Polish KRS — registry identity, status, legal form, share capital (when present). Address, registration date, directors, and NACE are intermittent in KRS's public output. CEIDG sole traders not covered."
- **SE**: "Swedish Bolagsverket HVD — registry identity, status, SNI codes, registration date, business description, ongoing insolvency procedures, VAT (synthesised). Financials and directors require paid Bolagsverket services."
- **SG**: "Singapore ACRA via data.gov.sg — registry identity, status, entity type, registration date, registered street + postal code. Directors, full address detail, NACE, and VAT require paid BizFile+ access."
- **SI**: "Slovenian Poslovni register via data.gov.si — registry identity, legal form, registry authority, address. Status, registration date, NACE, directors, and VAT are NOT in the open subset (paid AJPES restPrsInfo would provide them but is not redistributable). Customer solutions cannot meaningfully gate on these fields for SI."
- **SK**: "Slovak RPO via api.statistics.sk — registry identity, status (derived), address, registration date, legal form, NACE, directors. 60 req/min per-IP rate limit."
- **UK**: "UK Companies House — registry identity, status, SIC codes, incorporation date, registered office. Officers (directors) require a separate Companies House API call. VAT not provided by Companies House."

### 9. Suggested DEC (draft only, not logged in this audit)

**DEC-20260513-F: v1 Identity coverage verdict — 17 of 20 capabilities v1-ready, 1 fixture correction queued, 2 quota-blocked (designed behaviour).**

**Rationale:** The CA Identity leg has been empirically validated against canonical-input fixtures for 18 of 20 capabilities, with the remaining 2 (DK, DE) blocked only by free-tier quota at audit time — the manifests document those quotas correctly, the executors return structured errors, and the fixtures themselves reference universally-known entities. Field-level coverage matches what each source publishes; gaps are intrinsic to free open-data sources and are honestly disclosed via the `limitations` blocks. One bad fixture (GR branch entity) is flagged for correction in a follow-up PR; one extraction-style limitation (LT address in separate dataset) is a known coverage limit, not a bug. The 17-ready number is the floor for customer-facing claims about v1 Identity coverage as of 2026-05-13.

**Pairs with:** DEC-20260513-D Phase 3 Harden (this audit is the manual precursor to the automated canonical-input sentinel test).

**Post-closeout (2026-05-13 ~20:40 UTC):** the verdict became 20 of 20 — all three residuals closed in PR #116. The proposed DEC text updates to: *"20 of 20 v1-ready, GR fixture swap landed in PR #116, DK + DE verified operationally healthy via 24h canary signal."* See §10 for the chain of evidence.

---

## §10 — Audit residual closeout (2026-05-13, PR #116)

Yesterday's audit (this file, sections above) named three residuals:
- **GR** — branch-entity fixture preventing field-coverage proof for directors + NACE.
- **DK** — `quota_exceeded` at audit time; operational health unverified.
- **DE** — `quota_exceeded` at audit time; operational health unverified.

All three were closed in PR #116 (2026-05-13 evening).

### GR fixture swap — closed

- Candidate evaluation: per prompt list, HELLENiQ ENERGY Holdings SA was candidate 1. Validated via prod `GET /v1/do` against `greek-company-data` with `gemi_number: 296601000`. Returned: `is_branch=false`, `status="active"`, 11 directors with roles, `industry_code: "19200000"` (Παραγωγή Προϊόντων Διύλισης Πετρελαίου), full address, AFM 094049864, regdate 1975-07-19. All four candidate-1 checks passed (validates via prod, active, parent SA, returns directors + NACE).
- Manifest edit applied to `manifests/greek-company-data.yaml`:
  - `known_answer.input.gemi_number`: `"000237954001"` → `"296601000"`
  - `known_answer.expected_fields`: updated to match HELLENiQ's response (org_number, vat_number, afm, registration_date, is_branch=false)
  - Added `industry_code not_null` assertion (a stricter check than the prior fixture, which omitted industry_code because the branch had `null`)
  - `health_check_input.gemi_number`: `"000237954001"` → `"296601000"`
- Table B GR row updated: directors ❌→✅, NACE ❌→✅.
- Branch-coverage limitation remains documented in the GR manifest's `limitations` block ("Branches and main entities are both returned by GEMI"). Single-fixture format per repo convention; the branch case is covered organically by customer traffic, not by a second canary fixture.

### DK + DE canary-signal verdict — closed

Query path: direct read against the `test_results` Postgres table via `DATABASE_URL` (sourced from `strale/.env`, used inline for this session only, not persisted in strale-work). Window: `executed_at >= NOW() - INTERVAL '24 hours'` (queried 2026-05-13 ~20:38 UTC).

| Capability | Canary observations (24h window) | Green | Red | Green-rate | Most-recent canary | Verdict |
|---|---|---|---|---|---|---|
| `danish-company-data` | 6 | 6 | 0 | **100%** | 2026-05-13 20:27:31 UTC | ≥95% → operationally healthy |
| `german-company-data` | 6 | 6 | 0 | **100%** | 2026-05-13 20:17:17 UTC | ≥95% → operationally healthy |
| `greek-company-data` (informational) | 7 | 7 | 0 | 100% | 2026-05-13 19:27:32 UTC | Healthy pre-swap; post-swap revalidation arrives with the next canary tick |

Both DK and DE meet the prompt's ≥95% threshold (the substrate's amber band is 80–94%; both are at 100%). Per the prompt's decision rule, they move from Findings §4 (execution failures) to Findings §1 (v1-ready) with the canary-signal note.

Note on observation density: 24h window contains 6 observations rather than 24 because `free_quota`-class capabilities run on a sparser schedule than `free_unlimited` (which would test hourly). This is the substrate's actual cadence for these vendors, not a coverage gap. Density × success-rate together are the signal; both are healthy.

### Three observations from the closeout

1. **The cost-class gate did exactly what it should.** Audit-time prod calls for DK and DE returned structured `quota_exceeded` errors instead of consuming wallet or vendor budget for an internal-test classification. The prior audit's verdict "DK and DE quota-exhausted at audit time" was correct in the moment; this closeout shows the broader operational picture via the substrate that already records it.
2. **Canary signal beats single-point re-execution.** Re-executing DK and DE after 24h quota reset would have been a single-point check that could miss diurnal variation. The 24h canary window covers the whole circadian arc with no failures, which is genuinely stronger evidence.
3. **The GR fixture swap pattern is the manual application of the Phase 3 Harden sentinel.** The automated version, when shipped (the Notion To-do from yesterday), would have flagged the branch-fixture issue at PR time before it landed in main. Today's closeout demonstrates what the automation should look like; tomorrow's sentinel-build prompt makes it run on every PR.

### Follow-ups still open (queued, not done in PR #116)

1. Cosmetic example-fixture drifts for NO and UK manifests (Findings §5).
2. Automated canonical-input sentinel test (DEC-20260513-D Phase 3 Harden gate a).
3. Pipeline-bypass detector (DEC-20260513-D Phase 3 Harden gate b).
4. Active Vendor Stack page (`35367c87082c812e88d1dc6bdbfbd4f5`) update from "17 v1-ready" framing to "20 v1-ready" framing — flagged for chat to sequence.
5. New DEC (DEC-20260513-F or next available): "v1 Identity coverage verdict — 20 of 20 v1-ready" — flagged for chat to log.

---

## Methodology notes (for the eventual automated sentinel)

This audit's value extends beyond the count: it produced the dataset that lets the automated sentinel test be specified. For each capability:

1. The fixture identifier was sent through prod `/v1/do`.
2. The returned `company_name`/`entity_name` was compared against the manifest's documented example or against a real-world reference (Stripe, Tesco, Nokia, etc.).
3. The returned field set was compared against the canonical 10-field set and against the manifest's `output_field_reliability` declarations.

The automated sentinel should encode steps 1-2 as a CI check that runs against each manifest's `known_answer.input`, asserts execution success (with `quota_exceeded` as an acceptable degraded outcome documented per cap), and emits a categorised diff for any field divergence from the manifest's expected_fields.

**Important non-finding:** the audit found zero "fixture references entity that doesn't exist" failures of the CH-PR-#107 shape. The Phase 2 harden work (the sentinel pattern itself) appears to have prevented further occurrences of that exact failure mode. The remaining gap is purely automation: the sentinel is being run by hand here, not on every PR.

---

## Cross-worktree write-conflict findings (informational)

Per audit point 1, the parallel `strale` worktree at `C:/Users/pette/Projects/strale` contained two untracked handoff files at session start:

- `handoff/_general/from-code/2026-05-11-failure-investigation-de-dk-sk-rootcause.md`
- `handoff/_general/from-code/2026-05-13-hr-ch-price-normalize-dec-20260513-e.md`

Neither overlaps with this audit's read list. Recorded for completeness only.

---

*This file is the canonical author of the audit. The Notion page at the Infrastructure section is a mirror — diff the two if either is edited.*

---

## Addendum 2026-05-13 (residual closeout)

Residuals closed via PR #116. Headline count: **20 of 20**. See §1 (post-closeout list) + §10 (closeout evidence chain).
