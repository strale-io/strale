# Nordic statistics fixtures

All files are **real responses recorded on 2026-11-06** from the offices' open APIs with the executor's own request shapes and user agent (`Strale/1.0 (+https://strale.io)`). They are aggregate open statistics with no personal data. The only edit is trimming: metadata files keep every variable but only the values the recorded query selects plus up to two others; data responses are unmodified.

| File | Source |
| --- | --- |
| `scb-metadata.json`, `scb-success.json`, `scb-request-body.json` | `https://api.scb.se/OV0104/v1/doris/en/ssd/BE/BE0101/BE0101A/BefolkningNy` (GET, then POST of the request body) |
| `ssb-metadata.json`, `ssb-success.json`, `ssb-request-body.json` | `https://data.ssb.no/api/v0/en/table/07459` |
| `statfin-metadata.json`, `statfin-success.json`, `statfin-request-body.json` | `https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/vaerak/11ra.px` |
| `ssb-http-400.json` | The real body SSB returned (HTTP 400) for a POST naming an unknown variable. |

A real HTTP 429 cannot be provoked responsibly; the rate-limit tests build the status in code.

To re-record, run the metadata GET and the POST in `*-request-body.json` against the URLs above, and keep the tests offline.

## Verified allowlist (2026-11-06)

Every table below answered a metadata GET and a small json-stat2 POST with data. Statistics Finland's official host is `pxdata.stat.fi` (linked from stat.fi's open-data page); the table path form is `<folder>/<table>.px` (the earlier `statfin_<folder>_pxt_<table>.px` form returns 400).

* SCB: `BE0101N1` BefolkningNy, `BE0101N2` BefUtvKon1749, `NR0103N1` NR0103ENS2010T01NA, `PR0101N1` KPI2020M, `AM0401N1` AKURLBefAr, `AM0110N1` LonYrkeRegion4AN, `BO0501N1` FastprisSHRegionAr, `HA0101N1` NR0103ENS2010T03NAN.
* SSB: `07459`, `05110`, `14700`, `09189`, `05803`, `13760`, `11418`, `07221`.
* Statistics Finland: `vaerak_11ra`, `synt_12dx`, `ntp_15a9`, `khi_11xt`, `tyti_13al`, `ktps_14n2`, `ashi_13mw`, `ntp_15ag`.
