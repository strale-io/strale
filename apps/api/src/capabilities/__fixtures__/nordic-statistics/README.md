# Nordic statistics fixtures and allowlist provenance

The build container's CONNECT proxy returned HTTP 403 for all three official API hosts on 2026-11-06. These fixtures are therefore **hand-authored in the documented JSON-stat 2.0 shape, not recorded**. No fixture contains customer or production data.

Each success response represents a metadata `GET` followed by the literal `POST` below, with `Content-Type: application/json`:

* `scb-success.json` — SCB, hand-authored 2026-11-06. URL: `https://api.scb.se/OV0104/v1/doris/en/ssd/BE/BE0101/BE0101A/BefolkningNy`. Body: `{"query":[{"code":"Region","selection":{"filter":"item","values":["00"]}},{"code":"Tid","selection":{"filter":"item","values":["2023","2024"]}}],"response":{"format":"json-stat2"}}`.
* `ssb-success.json` — SSB, hand-authored 2026-11-06. URL: `https://data.ssb.no/api/v0/en/table/07459`. Body: `{"query":[{"code":"Region","selection":{"filter":"item","values":["0"]}},{"code":"ContentsCode","selection":{"filter":"item","values":["Population"]}},{"code":"Tid","selection":{"filter":"item","values":["2023","2024"]}}],"response":{"format":"json-stat2"}}`.
* `statfin-success.json` — Statistics Finland, hand-authored 2026-11-06. URL: `https://pxweb2.stat.fi/PxWeb/api/v1/en/StatFin/vaerak/statfin_vaerak_pxt_12af.px`. Body: `{"query":[{"code":"Alue","selection":{"filter":"item","values":["SSS"]}},{"code":"Tiedot","selection":{"filter":"item","values":["vaesto"]}},{"code":"Vuosi","selection":{"filter":"item","values":["2023","2024"]}}],"response":{"format":"json-stat2"}}`.
* `http-400.json` — SSB representative 400 response, hand-authored 2026-11-06. URL: `https://data.ssb.no/api/v0/en/table/07459`. Body: `{"query":[{"code":"UnknownVariable","selection":{"filter":"item","values":["x"]}}],"response":{"format":"json-stat2"}}`.
* `http-429.json` — SSB representative 429 response, hand-authored 2026-11-06. URL: `https://data.ssb.no/api/v0/en/table/07459`. Body: `{"query":[{"code":"Region","selection":{"filter":"item","values":["0"]}},{"code":"ContentsCode","selection":{"filter":"item","values":["Population"]}},{"code":"Tid","selection":{"filter":"item","values":["2024"]}}],"response":{"format":"json-stat2"}}`.

## Curated table selection

The allowlists intentionally contain only aggregate population, national accounts/GDP, prices, labour-market, earnings, housing-price and household-consumption tables. They exclude foreign trade, microdata and small-cell subjects. IDs were assembled from the offices' table-catalogue conventions and public examples, but the API catalogues could not be reached from this environment. Consequently **all IDs and paths below are unverified** and must be checked by the orchestrator before activation.

* SCB catalogue root: `https://api.scb.se/OV0104/v1/doris/en/ssd` — `BE0101N1`, `BE0101N2`, `NR0103N1`, `PR0101N1`, `AM0401N1`, `AM0110N1`, `BO0501N1`, `HA0101N1` (the executor maps these stable curated aliases to full v1 paths).
* SSB table catalogue: `https://data.ssb.no/api/v0/en/table` — `07459`, `05110`, `09189`, `11721`, `08804`, `13760`, `11418`, `07221`.
* Statistics Finland catalogue root: `https://pxweb2.stat.fi/PxWeb/api/v1/en/StatFin` — `vaerak_12af`, `synt_12dx`, `kan_12sv`, `khi_11xe`, `tyti_13al`, `palk_13rb`, `ashi_13mu`, `ktutk_13a6` (curated aliases map to full `.px` paths).

SCB v1 is pinned because it implements the PxWeb metadata-GET/data-POST protocol required by this brief. SCB describes v2 as current, so the v1 choice and migration path need operator review before activation. SSB's v1-compatible `v0` endpoint implements that same required protocol, though SSB now recommends v2; Statistics Finland publishes PxWeb API v1 documentation. None of those version statements could be rechecked through a live API call here.
