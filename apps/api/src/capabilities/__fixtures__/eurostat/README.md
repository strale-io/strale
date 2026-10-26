Recorded directly from the official Eurostat statistics API on 2026-10-26,
using `Strale/1.0 (+https://strale.dev)`. Bodies are unchanged (tec00013 is
pretty-printed). No production Strale calls or database writes.

Base URL: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/

| File | Request appended to base | HTTP |
| --- | --- | --- |
| tec00013.json | tec00013?geo=SE&lastTimePeriod=1 | 200 |
| unknown-dimension.json | nama_10_gdp?geo=SE&not_a_dimension=X | 400 |
| unknown-dataset.json | zzzz_nonexistent?geo=SE | 404 |
| extraction-too-big.json | bop_c6_q?geo=SE&lastTimePeriod=1 | 413 |
| asynchronous-response.json | bop_c6_q?geo=SE&partner=DE&lastTimePeriod=1 | 413 |

Geo codelist checked:
https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=TSV&lang=en

The live nama_10_gdp/une_rt_m categories include EU27_2020 and EA21; nama
also includes EA, EA20, EA19 and EA12. The codelist names EA21 as euro area
from 2026. EA14 is accepted as explicitly requested, though absent from the
codelist; accepting a code does not guarantee upstream observations exist.

Additional live dimension checks (geo=SE&lastTimePeriod=1): migr_imm1ctz
(citizen), migr_imm3ctb (c_birth), tour_occ_ninraw (c_resid), tour_dem_ttw
(c_dest), cult_trd_prd/bop_its6_tot/tet00038 (partner), lfst_r_lfe2ecomm
(c_work). The trade datasets remain refused; they were inspected to confirm
metadata shape, not reused as output.

Dataset DOI form confirmed in the official dataset page:
https://ec.europa.eu/eurostat/databrowser/view/nama_10_gdp/default/table?lang=en
and DISSEMINATION_DOI_XML in the recorded JSON-stat metadata.
