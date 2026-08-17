# CA/JP registry access verification — evidence for the doctrine ruling (2026-08-12)

Requested context: DEC-20260428-A (Tier 1 no-scraping) vs DEC-20260518-F
(per-call parsing of statutorily-public registries under four constraints)
decides whether canadian/japanese-company-data can stay live. This pass
verified what those capabilities actually hit and what compliant
alternatives exist.

## Headline: both countries have OFFICIAL free APIs — the scrapes can retire

The doctrine ruling no longer needs to carry CA or JP. Both should migrate to
official endpoints, which is cleaner than any per-call-parsing justification.
GR/MT/HU remain the genuinely sharp DEC-20260518-F cases.

## Canada — Corporations Canada official JSON API (endpoint probed 2026-08-12)

- Current executor: Browserless-renders the legacy UI + LLM extraction —
  `fdrlCrpDtls.html?corpId=` for numeric IDs, `fdrlCrpSrch.html` for names.
- **Official API**: `GET https://ised-isde.canada.ca/cc/lgcy/api/corporations/{corp_id}.json?lang=eng`
  — probe evidence is NEGATIVE-path only: an unknown ID returns clean JSON
  (`["could not find corporation …"]`, HTTP 200), proving the endpoint exists
  and speaks JSON, not the success-path shape. The claim that it carries
  **status, registered office address, directors** comes from the Open
  Government Portal docs ("Federal Corporations — API Documentation", dataset
  `0032ce54-c5dd-4b66-99a0-320a7b5e99f2`), not from the probe. No key
  required on the probe.
- **Bulk**: "Federal Corporations" JSON datasets (split into four files as of
  April 2026) under the **Open Government Licence – Canada** (re-use,
  redistribution, intermixing permitted).
- robots.txt: no Disallow on `/cc/lgcy/*` (checked 2026-08-12) — the current
  scrape isn't robots-prohibited, but that's moot given the API.
- **Name search**: the per-ID endpoint is confirmed; the API doc resource
  needs a read during migration for the name-search endpoint shape (a naive
  guess 302'd). Fallback: bulk dataset as the name index + per-ID API live.
- **Migration**: swap fetchRenderedHtml+LLM for the JSON API. No credential,
  no Petter action — but gated on one positive probe against a real
  corporation number (first step of the migration session), and on
  confirming the live API endpoint itself carries the Open Government
  Licence (evidenced here only for the bulk datasets) before the licence is
  asserted in per-response provenance.

## Japan — NTA Corporate Number Web-API Ver.4 (official, free, CC BY 4.0)

- Current executor: Browserless-renders `houjin-bangou.nta.go.jp` search pages.
- **Official Web-API**: free, XML/JSON, returns corporate number, name,
  address, entity type, status. NTA publishes the underlying data under
  **CC BY 4.0** (open-data declaration) — commercial use with attribution.
- **Requires an application ID** ("利用届出" usage notification form):
  https://www.houjin-bangou.nta.go.jp/webapi/riyo-todokede/ — **Petter
  action, ~5 minutes, a form not an account**. ID arrives by email.
- robots.txt: none (404/error page) — current scrape not robots-prohibited;
  moot after migration.
- **Migration**: once `HOUJIN_BANGOU_APP_ID` exists, swap the scrape for the
  Web-API. Note the NTA data covers identity (no officers) — same coverage as
  today's scrape, so no capability surface change.

## Doctrine ruling — what remains for Petter

With CA/JP exiting the contested set via official APIs, DEC-20260518-F's
per-call-parsing question decides only: **GR** (free by statute, HTML only —
the sharpest case), **MT/HU/LU** (paid/closed anyway), and the general
posture for future registries. Recommendation unchanged: affirm F as the
operative interpretation of A, with a per-registry ToS check recorded in each
capability's manifest before relying on it.

## Interim status (until migrations land) — recommendation, not a ruling

Whether the current Browserless-rendered fetches may keep running until the
migrations land is exactly the DEC-20260428-A-vs-DEC-20260518-F question
that is still **pending Petter's ruling** (CLAUDE.md's active text calls
Tier 1 absolute; F is not yet in CLAUDE.md's Active Decisions, and sibling
audit docs apply the absolutist reading). This doc's recommendation: keep
them live during the short migration window — the data is statutorily
public, access is per-call, robots.txt does not prohibit the paths, and
attribution is preserved — but that is a recommendation for the ruling to
confirm, not a status this doc can grant itself. If Petter rules
absolutist, deactivate both until the API migrations land.

Sources: [Federal Corporations dataset](https://open.canada.ca/data/en/dataset/0032ce54-c5dd-4b66-99a0-320a7b5e99f2),
[API doc resource](https://open.canada.ca/data/en/dataset/0032ce54-c5dd-4b66-99a0-320a7b5e99f2/resource/582644d6-e3a2-4fc6-a647-a07d81cc8104),
[Corporations Canada data services](https://ised-isde.canada.ca/site/corporations-canada/en/data-services),
[NTA Web-API notification form](https://www.houjin-bangou.nta.go.jp/webapi/riyo-todokede/),
[Corporate Number (Wikipedia)](https://en.wikipedia.org/wiki/Corporate_Number).
