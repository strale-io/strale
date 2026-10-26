Recorded directly from the official Eurostat statistics API on 2026-10-26,
using `Strale/1.0 (+https://strale.dev)`. Bodies are unchanged (tec00013 is
pretty-printed), except sbs_na_2c_own-metadata.json omits value/status and is pretty-printed;
its recorded empty geo selection still exposes the owner dimension and source annotations. No production Strale calls or database writes.

Base URL: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/

| File | Request appended to base | HTTP |
| --- | --- | --- |
| tec00013.json | tec00013?geo=SE&lastTimePeriod=1 | 200 |
| unknown-dimension.json | nama_10_gdp?geo=SE&not_a_dimension=X | 400 |
| unknown-dataset.json | zzzz_nonexistent?geo=SE | 404 |
| extraction-too-big.json | bop_c6_q?geo=SE&lastTimePeriod=1 | 413 |
| asynchronous-response.json | bop_c6_q?geo=SE&partner=DE&lastTimePeriod=1 | 413 |

| sbs_na_2c_own-metadata.json | sbs_na_2c_own?geo=DE&sinceTimePeriod=2001&untilTimePeriod=2001 | 200 |

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

## Dataset allowlist audit — 2026-10-26

`dataset-audit-2026-10-26.json` records live JSON-stat metadata for every
successfully fetched candidate, its exact URL, inclusion verdict and findings.
Requests used `?lang=EN&lastTimePeriod=1` with **no dimension filters** (other
than time), preserving all returned category codes/labels. Only observation
values/status were omitted. This is a metadata audit, not a data mirror.
The executor's `EUROSTAT_ALLOWED_DATASETS` must equal the included rows;
tests independently repeat the dimension-code screen and source/trade checks.

The recorded `iso_3166_alpha2` set contains the 249 assigned country codes,
excluding Eurostat aliases. A dataset is excluded when any of these holds:

1. `checkEurostatMetadata` refuses it (a source other than Eurostat, or trade);
2. a dimension other than `geo`/`time` has a geographic id (partner, citizen,
   counterpart, vessel nationality, reporter, residence, origin, destination,
   control, `country*`, `c_*`);
3. such a dimension holds a category whose label names the country that its
   ISO-3166 alpha-2 code denotes (`eurostatCategoryIsCountry`, the same
   label-aware test the runtime applies to `geo`);
4. such a dimension holds five or more ISO-3166 alpha-2 codes, whatever their
   labels. Across all 127 audited tables no non-geographic dimension holds more
   than three (gov_10a_main `na_item`: NP, TC, TR); a real country dimension
   holds dozens.

Codes that only look like countries do not exclude a dataset: `unit=NR`
("Number", not Nauru), `s_adj=SA/CA` ("Seasonally adjusted", "Calendar
adjusted"), `na_item=GD` ("Government consolidated gross debt"),
`coicop=CP00`, `cofog99=GF01`. Region-shaped classification codes (`unit=KM2`,
`material=MF11`, `airpol=CO2`, `hotelsize=GE100`) are not a separate rule:
a NUTS dimension always carries its national codes too, which rules 3 and 4
catch. The audit read the latest period only (`lastTimePeriod=1`), so a
category that exists only in earlier periods was not seen; rule 2 does not
depend on categories, and the runtime post-fetch `geo` drop still applies.

110 of the 127 fetched tables pass. The exclusions are third-party-sourced SDG
tables and env_air_gge (rule 1), sdg_17_10 (rules 1 and 2), and the tourism
tables by residence of guest, tour_occ_nim and tour_occ_ninat (rule 2).

Failed HTTP candidates (404, not included): demo_r_frate, lfsi_act_a, lfsi_act_q, sdg_01_30, sdg_03_10, sdg_03_40, sdg_04_30, sdg_04_50, sdg_05_10, sdg_09_20, sdg_10_40, sdg_11_10, sdg_11_50, sdg_12_20, sdg_12_30, sdg_12_40, sdg_12_50, sdg_13_20, sdg_13_30, sdg_15_10, sdg_15_30, sdg_17_30, tour_occ_mnor2, tour_occ_nights.
See per-dataset verdicts below for every successful metadata request.

| Dataset | Verdict | Findings (abbreviated; full findings in JSON) |
| --- | --- | --- |
| demo_find | included |  |
| demo_frate | included |  |
| demo_gind | included |  |
| demo_magec | included |  |
| demo_minfind | included |  |
| demo_mlexpec | included |  |
| demo_mlifetable | included |  |
| demo_nind | included |  |
| demo_pjan | included |  |
| demo_pjangroup | included |  |
| demo_pjanind | included |  |
| demo_r_d2jan | included |  |
| demo_r_d3area | included |  |
| demo_r_d3dens | included |  |
| demo_r_find2 | included |  |
| demo_r_gind3 | included |  |
| demo_r_magec | included |  |
| demo_r_mlifexp | included |  |
| demo_r_pjanaggr3 | included |  |
| env_ac_mfa | included |  |
| env_ac_rme | included |  |
| env_air_gge | excluded | Dataset 'env_air_gge' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| env_wasmun | included |  |
| gov_10a_exp | included |  |
| gov_10a_main | included |  |
| gov_10dd_edpt1 | included |  |
| gov_10q_ggdebt | included |  |
| gov_10q_ggnfa | included |  |
| ilc_di03 | included |  |
| ilc_di04 | included |  |
| ilc_di11 | included |  |
| ilc_di12 | included |  |
| ilc_li01 | included |  |
| ilc_li02 | included |  |
| ilc_li03 | included |  |
| lfsi_emp_a | included |  |
| lfsi_emp_q | included |  |
| lfst_r_lfe2eftpt | included |  |
| lfst_r_lfe2emp | included |  |
| lfst_r_lfe2emprt | included |  |
| lfst_r_lfp2act | included |  |
| lfst_r_lfu3pers | included |  |
| lfst_r_lfu3rt | included |  |
| nama_10_a10 | included |  |
| nama_10_gdp | included |  |
| nama_10_lp_ulc | included |  |
| nama_10_pc | included |  |
| namq_10_a10 | included |  |
| namq_10_gdp | included |  |
| nrg_pc_204 | included |  |
| nrg_pc_205 | included |  |
| prc_hicp_aind | included |  |
| prc_hicp_inw | included |  |
| prc_hicp_manr | included |  |
| prc_hicp_midx | included |  |
| prc_ppp_ind | included |  |
| sdg_01_10 | included |  |
| sdg_01_20 | included |  |
| sdg_01_40 | included |  |
| sdg_01_41 | included |  |
| sdg_02_10 | included |  |
| sdg_02_20 | included |  |
| sdg_02_40 | included |  |
| sdg_02_60 | excluded | Dataset 'sdg_02_60' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_03_20 | included |  |
| sdg_03_41 | included |  |
| sdg_03_60 | included |  |
| sdg_04_10 | included |  |
| sdg_04_20 | included |  |
| sdg_04_40 | excluded | Dataset 'sdg_04_40' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_05_20 | included |  |
| sdg_05_30 | included |  |
| sdg_05_40 | included |  |
| sdg_05_50 | excluded | Dataset 'sdg_05_50' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_06_10 | included |  |
| sdg_06_20 | included |  |
| sdg_06_30 | excluded | Dataset 'sdg_06_30' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_06_40 | excluded | Dataset 'sdg_06_40' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_06_50 | excluded | Dataset 'sdg_06_50' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_07_10 | included |  |
| sdg_07_20 | included |  |
| sdg_07_30 | included |  |
| sdg_07_40 | included |  |
| sdg_08_10 | included |  |
| sdg_08_11 | included |  |
| sdg_08_20 | included |  |
| sdg_08_30 | included |  |
| sdg_08_40 | included |  |
| sdg_08_60 | included |  |
| sdg_09_10 | included |  |
| sdg_09_30 | included |  |
| sdg_10_10 | included |  |
| sdg_10_20 | included |  |
| sdg_10_30 | included |  |
| sdg_11_20 | included |  |
| sdg_11_40 | excluded | Dataset 'sdg_11_40' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_11_60 | included |  |
| sdg_12_10 | included |  |
| sdg_13_10 | excluded | Dataset 'sdg_13_10' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_14_10 | excluded | Dataset 'sdg_14_10' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_14_30 | excluded | Dataset 'sdg_14_30' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_15_20 | excluded | Dataset 'sdg_15_20' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_16_10 | included |  |
| sdg_16_20 | included |  |
| sdg_16_30 | included |  |
| sdg_16_40 | excluded | Dataset 'sdg_16_40' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sdg_17_10 | excluded | Dataset 'sdg_17_10' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a).; dimension 'partner' is geographic by id |
| sdg_17_20 | excluded | Dataset 'sdg_17_20' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a). |
| sts_copr_a | included |  |
| sts_copr_m | included |  |
| sts_inpr_a | included |  |
| sts_inpr_m | included |  |
| sts_intv_m | included |  |
| sts_setu_m | included |  |
| sts_trtu_a | included |  |
| sts_trtu_m | included |  |
| tour_cap_nat | included |  |
| tour_cap_nuts2 | included |  |
| tour_cap_nuts3 | included |  |
| tour_occ_anor | included |  |
| tour_occ_anor2 | included |  |
| tour_occ_mnor | included |  |
| tour_occ_nim | excluded | dimension 'c_resid' is geographic by id |
| tour_occ_ninat | excluded | dimension 'c_resid' is geographic by id |
| une_ltu_a | included |  |
| une_rt_a | included |  |
| une_rt_m | included |  |
