# Registry status captures

Captured live, read-only on 2026-10-26 from the URL in each JSON's `capture` block.
`response` projects only fields used by the executor. Capture metadata includes
HTTP status, capture timestamp and SHA-256 of the full received body. Full bodies
are intentionally not committed: representative identities, addresses and other
unused personal details have been removed. The deleted Norwegian record's name
is also omitted; the organisation number is retained for the requested regression.

- Brreg: HTTP 200 `respons_klasse: SlettetEnhet`, `slettedato: 2026-10-20`.
  [Official API documentation](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html).
- KRS: `odpis.naglowekP.wpis[]` contains numbered registry events; Grupa Lotos
  entry 148 records registry deletion on 2022-08-12. Individual field removals
  (`nrWpisuWykr`) do not mean entity deletion. The official
  [API documentation](https://prs.ms.gov.pl/krs/openApi) describes the full extract
  as semantic JSON specific to legal form; it does not publish a complete field
  schema or a documented `czyWykreslony` boolean. The captured official response
  is evidence of the header event field used here. MARTOM, the previous manifest
  known-answer, is also deregistered; ORLEN is the active replacement.
- ARES: ROS and VR source statuses remain `AKTIVNI` for TIKA; VR contains a current
  `statutarniOrgany` entry with `typOrganu: LIKVIDATOR` and a non-deleted member.
  Both supplied liquidation examples are captured. Membership/function lifecycle
  fields are retained, while representative identities are removed.
  [Official operating conditions and API documentation](https://mf.gov.cz/cs/ministerstvo/informacni-systemy/ares).
- PRH: both FC Honka and Nokia have Business ID `status: 2` and no dissolution
  `endDate`; Honka's `tradeRegisterStatus: 3` is not evidence of entity inactivity.
  [Official v3 schema](https://avoindata.prh.fi/opendata-ytj-api/v3/schema?lang=en)
  links [STATUS3](https://avoindata.prh.fi/opendata-ytj-api/v3/description?code=STATUS3&lang=en)
  (1 pending, 2 valid, 5 invalidated) and
  [situation codes](https://avoindata.prh.fi/opendata-ytj-api/v3/description?code=SELTILA,SANE,KONK&lang=en)
  (SELTILA liquidation, SANE reorganisation, KONK bankrupt).

Greece has no live capture: no GEMI key was supplied. Its cases are explicitly
synthetic unit inputs. Additional lifecycle/precedence variants in the tests are
also synthetic, not altered live evidence.
