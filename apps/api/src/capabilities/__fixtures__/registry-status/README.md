# Registry status evidence

Live captures were read on 2026-10-26 from each JSON's `capture.url`.
Metadata records HTTP status, timestamp and SHA-256 of the full received body.
Only lifecycle inputs are retained: no natural-person identities, birth dates,
residential locations or registered locations. Full bodies are not committed.
Membership end/deletion dates describe appointments, not birth dates.

- Brreg: HTTP 200 `respons_klasse: SlettetEnhet`, `slettedato: 2026-10-15` (a deleted limited company, AS).
  [Official API documentation](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html).
- KRS: `odpis.naglowekP.wpis[]` contains numbered registry events; entry 148
  records registry deletion on 2022-08-12. The official
  [API documentation](https://prs.ms.gov.pl/krs/openApi) describes semantic JSON
  specific to legal form, without a complete field schema. The captured header
  events establish registration/deletion; individual field-removal markers do
  not establish entity deletion. The former active example is also deregistered.
- ARES: ROS/VR `AKTIVNI` does not exclude liquidation. Current VR
  `typOrganu: LIKVIDATOR` with current membership establishes liquidation.
  Captures keep only source status, organ type and appointment end/deletion
  fields. All free text and representative objects were discarded.
  [Official API documentation](https://mf.gov.cz/cs/ministerstvo/informacni-systemy/ares).
- PRH: the association and active-company captures have Business ID `status: 2`,
  no dissolution `endDate` and no current situations. Trade Register membership
  is not entity existence. [Official v3 schema](https://avoindata.prh.fi/opendata-ytj-api/v3/schema?lang=en).
- Singapore: the executor reads only
  [Entities Registered with ACRA](https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/explorer).
  Live filtered counts: Registered 638,463; Deregistered 1,488,626;
  unfiltered total 2,127,089. Their sum proves these are the only values in
  this snapshot. Separate count captures and a deregistered response are kept.
  The SQL endpoint returned 404; counts use the executor's datastore_search API.
- Switzerland: `ch-status-vocabulary.json` projects the live
  [Zefix OpenAPI](https://www.zefix.admin.ch/ZefixPublicREST/v3/api-docs)
  `CompanyFull.properties.status` enum. It is schema evidence, not a company
  capture. The company API returned 401 without credentials. Tests feed both
  documented nonactive values through the production provider parser.
- Canada: live API responses confirm `Dissolved`, `Inactive - Amalgamated`
  and `Inactive - Discontinued`. The
  [official search tips](https://ised-isde.canada.ca/site/corporations-canada/en/search-tips)
  explain that discontinuance means moving to other legislation; it is high,
  not terminal. All three API projections pass through the real executor.
- Ireland: live CRO datastore response confirms `company_status: Dissolved`.
  [Official status vocabulary](https://services.cro.ie/companystatuses.aspx/1000).
  `Ceased IRL` means ceased Irish registration, not proven termination abroad.
- Brazil: live ReceitaWS response confirms `situacao: BAIXADA`; all other
  response fields are omitted. The first attempted CNPJ lookup returned 400;
  the captured successful lookup is identified in its metadata.
- Australia: a live ABR public record confirms `Cancelled`. The recorded value
  is placed in a minimal synthetic XML envelope for the production XML parser;
  the XML API requires a GUID and was not called live.
  [Official status explanation](https://abr.business.gov.au/FAQ/ABNLookup).

`fi-distress.json` and `gr-distress.json` are explicitly synthetic lifecycle
inputs. Greece has no live capture because no GEMI credential was supplied.
Synthetic precedence variants in tests are separate from live captures.
Narrative regression tests run each source projection through its production
executor (Zefix uses its production provider parser) before asserting flags.
