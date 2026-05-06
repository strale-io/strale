# bundesAPI civic-tech depth and integration audit

**Date:** 2026-05-06
**Author:** Claude Code (research session)
**Branch:** `research/bundesapi-civic-tech-2026-05-06`
**Trigger:** DEC-20260505-H names "bundesAPI civic-tech stack" as the architectural fallback for DE Counterparty Assurance if the OpenRegister audit-retention question can't be resolved. Memory references it as "Identity + Bundesanzeiger financials." Actual depth and integration cost was unverified.

---

## 1. Summary

- **Recommendation: bundesAPI is NOT a credible fallback for OpenRegister DE.** It is a thin scraping client over `handelsregister.de`, no LICENSE file, ~60 req/hour upstream cap (per Nutzungsordnung; >60/hr cited as potentially actionable under §§303a,b StGB), and the wrapper itself ignores robots.txt.
- **The Bundesanzeiger module exists, but it solves CAPTCHAs via an embedded ML model.** That is unambiguously a hostile-friendly bypass and squarely violates DEC-20260428-A Tier 1 (Strale itself never operates scrapers, absolute).
- **Coverage gap is large.** The Handelsregister wrapper returns 5 fields per company (court, register_num, name, state, status, history). It does NOT return registered_address, directors, legal_form, share_capital, financials, UBO, VAT, or LEI. ~6 of 13 CA Identity fields land at "No"; the rest at "No" or "Unknown."
- **Maintenance is intermittent.** `handelsregister` had ~13 months of zero-commit silence (Aug 2024 → Dec 2025), then a single contributor weekend-burst in Dec 2025. Open issues include 2025-05 "Anpassung auf neues Seitenformat in Arbeit?" (page format breakage). No fix shipped at audit time.
- **Practical implication:** the "fallback to bundesAPI" line in DEC-20260505-H should be revised. Realistic fallbacks are: (a) Topograph DE (paid licensed-bulk), (b) FPS-equivalent Open Data tier if Bund publishes one, (c) renegotiate OpenRegister audit-retention, (d) defer DE entirely. bundesAPI is not in this list.

---

## 2. Ecosystem catalog

`github.com/bundesAPI` is a community-run org of ~63 thin OpenAPI clients over German government sources. Most repos: small, single-author bursts, no license files, Python-only. The flagship meta-package is `deutschland` (1,398 stars, Apache-2.0).

### KYB-relevant repos (filtered from full catalog)

| Repo | Stars | Last push | License | Description |
|---|---|---|---|---|
| `deutschland` (meta) | 1,398 | 2026-04-28 | Apache-2.0 | Bundles bundesanzeiger + others. Active. |
| `handelsregister` | 411 | 2025-12-07 | **none** | CLI scraper of handelsregister.de. **No LICENSE file.** |
| `bundestag-lobbyregister-api` | 28 | 2024-04-17 | none | Lobby register; not a KYB primary source. |

### Other org repos (non-KYB; for context)

The remaining ~60 repos cover: `autobahn-api`, `dwd-api` (weather), `nina-api` (civil warnings), `marktstammdaten-api` (energy register), `tagesschau-api` (news), `feiertage-api` (holidays), `dashboard-deutschland-api` (DESTATIS dashboard), various Bundesagentur für Arbeit job-search APIs, etc. None are KYB-shaped. Most have no license file and last-commits in 2022–2024.

### Bundesanzeiger note

There is **no standalone `bundesAPI/bundesanzeiger` repo.** The Bundesanzeiger client lives inside `deutschland/src/deutschland/bundesanzeiger/`. The `handelsregister` repo's README says: *"The code for the Handelsregister moved to this [separate] repo"* — indicating an org pattern where the meta-package keeps simpler scrapers and registry-class scrapers split out.

---

## 3. Coverage matrix — bundesAPI vs Strale CA Identity field set

Two source modules in scope: `deutschland.bundesanzeiger` (financials/reports) and `bundesAPI/handelsregister` (search-result rows).

| CA Identity field | `handelsregister` | `bundesanzeiger` | Combined |
|---|---|---|---|
| `legal_name` | Yes (`name`) | Yes (search input echo) | Yes |
| `registration_number` | Yes (`register_num`, e.g. "HRB 12345 B") | No | Yes |
| `registered_address` | **No** | No | **No** |
| `status` | Yes (`statusCurrent`, e.g. "ACTIVE") | No | Partial |
| `incorporation_date` | **No** | No | **No** |
| `vat_number` | **No** | No | **No** |
| `leiCode` | **No** | No | **No** |
| `directors` | **No** | No | **No** |
| `legal_form` | Partial (embedded in `name` string) | No | Partial |
| `nace_code` | **No** | No | **No** |
| `share_capital` | **No** | No (would require parsing free-text reports) | **No** |
| `financials` (revenue/employees/balance) | **No** | Partial — raw text/HTML reports, no structured fields | Partial |
| `UBO/shareholders` | **No** | Partial — sometimes named in reports as free text | **No** structured |
| `court` (DE-specific) | Yes (`court`) | No | Yes |
| `state` (Bundesland) | Yes (`state`) | No | Yes |
| `history` (prior names/locations) | Partial (free-text pairs) | No | Partial |

**Result:** 4 of 13 CA Identity fields land at "Yes" using bundesAPI alone. 4 at "No structured / Partial." 5 hard "No." Address — the field most central to Counterparty Assurance — is missing entirely from the wrapper's output. To get it from Handelsregister, you'd need to scrape the per-company detail/document download (PDF), which is a separate workflow the wrapper does not implement; open issue 2023-07-27 ("Accessing and downloading (xml, pdf) files from handelsregister API") still open at audit time.

---

## 4. Sample call results

**Live calls were not executed.** Documented as a finding, not a blocker.

Reasons:
1. **DEC-20260428-A Tier 1 (absolute):** Strale itself never operates scrapers. Running `bundesAPI/handelsregister` (which calls `set_handle_robots(False)` and POSTs to `handelsregister.de`'s erweiterte-suche form) or `deutschland.bundesanzeiger` (which solves CAPTCHAs via embedded ML) from a Strale-aligned environment would directly violate the doctrine. A research probe is borderline; doing it during this audit produces no information that the source code review didn't already produce.
2. **No Python toolchain in this session.** The wrapper depends on `mechanize` + `BeautifulSoup` (handelsregister) and `onnxruntime` + custom ML model (bundesanzeiger). Setting these up just to confirm the response shape that source code already shows is not cost-effective.
3. **handelsregister.de has cookie/CAPTCHA gates and the 60 req/hr ceiling.** Even a successful probe is a single data point and can't generalize across the three suggested entity types (mid-cap, SME, recently incorporated GmbH).

**What we know without running the wrapper, from source code review:**

- `handelsregister.search_company()` returns a list of dicts shaped: `{court, register_num, name, state, status, statusCurrent, documents, history}`. The `documents` field is the cell text; the wrapper has a TODO: *"todo: get the document links."*
- `bundesanzeiger.get_reports(company_name)` returns `Dict[hash, {date, name, company, report, raw_report}]` where `report` is `BeautifulSoup.text` and `raw_report` is `prettify()`-ed HTML. No structured financial fields.
- Neither response type maps cleanly to the CA wire shape without significant post-processing (regex/LLM parse on free text).

**If a future session needs live samples**, the right venue is a sandboxed Python container in a separate environment, not a Strale-aligned dev box, and the request volume must respect the 60 req/hr Nutzungsordnung cap.

---

## 5. Maintenance health

### `bundesAPI/handelsregister`

- **Last push:** 2025-12-07 — but the prior commit before that was 2024-05-20. **~19-month silence**, then a single weekend burst (12 commits 2025-12-07) by `danielsippel` (introducing `statusCurrent` normalization).
- **Open issues:** 17. Oldest: 2021-12-28 (still open at audit time). Notable open issues:
  - 2026-02-25: "Add SI detail page scraping (structured register content)" — unimplemented core gap.
  - 2025-05-27: "Anpassung auf neues Seitenformat in Arbeit?" — site format change, fix in progress 7+ months and counting.
  - 2024-11-22 / 2024-07-14: "FormNotFoundError: no form matching name 'form'" — recurring breakage from upstream HTML mutation.
  - 2023-07-27: "Accessing and downloading (xml, pdf) files from handelsregister API" — the missing-document-download gap.
- **Distinct contributors (12-month window):** 2 (`danielsippel`, `LilithWittmann`).
- **License:** **none.** This is a hard blocker for redistribution and a soft risk for runtime use.
- **Upstream rate-limit / posture:** `handelsregister.de` Nutzungsordnung caps at 60 req/hour; the README itself warns that excess may meet §§303a,b StGB elements. Single Strale prod box probably stays under, but any backfill or batch ingest would not.
- **`set_handle_robots(False)`:** the wrapper actively disables robots.txt compliance.

### `bundesAPI/deutschland` (containing `bundesanzeiger`)

- **Last push:** 2026-04-28 (recent, healthy at the meta-package level).
- **`bundesanzeiger.py` last touched:** 2024-05-11 — **~12-month silence on the actual module.**
- **Open issues:** 30 across the meta-package; not specifically counted for the bundesanzeiger module.
- **Distinct contributors (12-month window):** ~5 (top: `wirthual`, `LilithWittmann`, `lukaspanni`, `imadreamerboy`, `PJUllrich`).
- **License:** Apache-2.0 (compatible).
- **CAPTCHA bypass:** the module ships an ONNX model (`assets/`) trained to solve Bundesanzeiger captchas. This is an active circumvention measure. Running this from Strale infra is doctrine-incompatible regardless of legal status.

### Production-use signals

- GitHub "Used by" / dependents: `gh search repos` finds two visible re-implementations (`amacado/handelsregister-cli`, `Amsterdam/handelsregister`) and a couple of NorthData / OpenRegister wrappers. None of these are evidence of large-scale production use.
- The flagship 1,398-star count on `deutschland` reflects civic-tech enthusiasm, not regulated-environment deployment. There's no vendor selling support or SLAs around this stack.

---

## 6. Engineering effort estimate

Estimates assume Strale would integrate as a fallback (re-fetchable layer), conforming to the capability onboarding pipeline (manifests, expected fields, reliability, validation, smoke tests).

### Initial wrap (Strale capability `de-company-data-bundesapi-fallback`)

- **5–8 engineering days** to wrap Handelsregister: re-implement in TypeScript (avoid pulling in Python), respect the 60 req/hr cap with token bucketing, handle session/cookies/CSRF, parse the search-results table, persist `register_num` + `court` + `state` + `status`. Handelsregister scraping is fragile — half the days are absorbed by HTML quirks already documented in the open-issues list.
- **+5–10 days** to add per-company detail / document fetch (issue 2023-07-27, currently un-shipped upstream). Without this, you don't get address, directors, legal_form, share_capital. This is the integration's load-bearing piece and is *not* what bundesAPI hands you for free.
- **+10–20 days** for Bundesanzeiger — IF you accept the CAPTCHA-bypass posture. Otherwise: not feasible.
- **Realistic total to reach OpenRegister-equivalent CA Identity fields: 25–40 engineering days**, with most of that on the Handelsregister detail-page scraping that bundesAPI doesn't ship.

### Ongoing maintenance

- **3–8 engineer-days per quarter** on parser breakage. Handelsregister.de has had at least 3 documented HTML format changes in the last 24 months. Each one requires a same-day fix or the capability returns nothing.
- **Cookie/anti-bot drift risk:** higher than typical APIs. The site is one CAPTCHA rollout away from breaking the wrapper completely. Bundesanzeiger has already gone there.
- **License risk:** zero LICENSE on `handelsregister` repo. Re-implementing in TypeScript sidesteps this, but reading the source code as a reference also has implications for clean-room defensibility.

### Risks

- **Doctrine conflict (DEC-20260428-A Tier 1):** even a TS re-implementation that does the same thing as bundesAPI is Strale-the-platform operating a scraper. The doctrine is absolute, not vendor-shaped.
- **Rate-limit ceiling:** 60 req/hr is fine for low-volume CA pipeline traffic. It is not fine for any kind of backfill, dataset rebuild, or burst.
- **CAPTCHA escalation:** the upstream registries are aware of automated abuse and have escalated before. Any wrapper is one CAPTCHA-rollout away from zero.
- **§§303a,b StGB exposure:** German criminal-law cite in the README itself is unusual. Risk is low at single-box request volumes but cannot be ignored at scale.

---

## 7. Recommendation

**bundesAPI is NOT a credible fallback for OpenRegister DE. Conditional? No. Hard No.**

Reasoning compounds:
1. **Coverage gap.** The wrapper returns ~5 fields. CA Identity needs ~13. The missing fields require building the scraper bundesAPI didn't ship.
2. **Doctrine conflict.** DEC-20260428-A Tier 1 is absolute. A bundesAPI integration is a scraping integration regardless of how it's packaged. The doctrine doesn't have a "fallback" carve-out.
3. **License gap.** `handelsregister` has no LICENSE file. Without a clean license, redistribution and modification posture is untenable for a regulated-data layer.
4. **Maintenance signal.** ~19-month silence on `handelsregister`, ~12-month silence on `bundesanzeiger.py`. Single-author bursts. This is hobbyist civic-tech, not infrastructure.
5. **Operational ceiling.** 60 req/hr is structurally incompatible with batch / backfill / rebuild operations Strale will eventually need.

**Implication for DEC-20260505-H:** the "Fallback if audit-retention can't be resolved → bundesAPI civic-tech stack" line is theoretical, not operational. The decision should be revised. Realistic alternatives if OpenRegister audit-retention falls through:

- **(a) Topograph DE** (paid licensed-bulk) — verify pricing, Tier 2 terms.
- **(b) Renegotiate OpenRegister audit-retention** — likely cheaper than building DE from scratch; the negotiation just got tougher because there's no architectural backstop.
- **(c) Bundesanzeiger XBRL bulk download** (separate from the bundesAPI scraper) — the official bulk-financials endpoint is XBRL-shaped and licensed, distinct from the captcha-walled web frontend the bundesAPI wrapper hits. Worth a separate audit.
- **(d) Defer DE Counterparty Assurance** — accept that DE is Tier 2 vendor-only (Implisense per DEC-20260505-G) and ship without OpenRegister-grade primary.

The Active Vendor Stack DE row should be updated to remove the "bundesAPI civic-tech kickoff" framing.

---

## 8. Open questions for follow-up

1. **Bundesanzeiger XBRL bulk-data feed.** Distinct from the captcha-walled web UI — is there a licensed-bulk feed Strale could subscribe to? `publikations-plattform.de` and `bundesanzeiger-verlag.de` may be the right entry points. This is the cleanest path to DE financials and was not in scope for this audit.
2. **FPS-Economy KBO equivalent for Germany.** BE has a free-tier open-data licensed-bulk feed (DEC-20260429-A, queued). Does Bund publish the equivalent for Handelsregister? `unternehmensregister.de` is the legal-publication portal; there is also a German Government Data portal `govdata.de` that may surface Handelsregister-shaped feeds. Worth a separate research session.
3. **OpenRegister audit-retention question.** What is the actual blocker — pricing, contract language, sunset risk? If renegotiable, the bundesAPI question moves from "fallback architectural backstop" to "irrelevant."
4. **Does Topograph DE coverage match OpenRegister 1:1?** For the renegotiation BATNA, this matters more than bundesAPI.
5. **Doctrine clarification (one-off).** Should DEC-20260428-A Tier 1 explicitly call out "hosted/operated wrappers of public-records scrapers"? The current language already covers this, but a worked example would harden it for future "but it's just a thin wrapper" arguments.

---

*Report length: approximately 2,000 words. Sources reviewed: `github.com/bundesAPI` org listing (63 repos), `handelsregister` source + README + commit history + open issues, `deutschland/src/deutschland/bundesanzeiger/bundesanzeiger.py` source + README. No live API calls executed (Section 4).*
