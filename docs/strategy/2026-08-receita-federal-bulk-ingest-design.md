# Receita Federal CNPJ bulk ingest — design and cost assessment

**Date:** 2026-08-14
**Status:** design only. Nothing built, nothing provisioned, no bulk data downloaded.
**Trigger:** `brazilian-company-data` failure rate; the doctrine-correct path for Brazilian
name→CNPJ resolution under DEC-20260813-A is licensed bulk, not per-call parsing.
**Bottom line:** **do not build this now.** The demand premise does not survive contact with
production data. §7 has the recommendation and the two-hour alternative. §1–§6 are the design,
so that a build session can execute it *if* the demand evidence changes.

---

## 0. Executive summary

| Question | Answer |
| --- | --- |
| Is the source real, current, and usable? | Yes. Verified 2026-08-14. Monthly, 37 files, **7.69 GB compressed / 28.4 GB CSV**. Latest vintage `2026-08` (data date 2026-08-08). |
| Which datasets are needed for name→CNPJ? | **Empresas + Estabelecimentos + 2 tiny reference tables.** Socios and Simples are NOT needed. |
| Can it live in the existing Railway Postgres? | Technically yes. **~5.9 GB** for the recommended reduced index vs. a **1.85 GB** production database today. Storage cost is trivial (~$0.92/mo); the *ingest event* is the risk. |
| What does it cost? | **$1–$6/month** infrastructure. **3–6 engineering days.** The money is not the constraint — the risk and the maintenance are. |
| Is there a blocking legal question? | **Yes.** No explicit open licence could be found for the dataset. The only licence statement on RF's pages is CC BY-**ND** 3.0 (§1.4). ND would forbid the derivative index this design creates. Unresolved. |
| Can we just buy it instead? | Four vendors do offer name search, from R$ 0,006/query. But one **prohibits resale outright**, two have silent or unreadable terms, and signup needs a **Brazilian tax ID Moonlighter AB does not have**. §7.4. |
| Should we build it? | **No.** In 120 days of production traffic, **zero callers have sent a company name** to this capability. §7. |

---

## 1. Source verification

Everything in this section was fetched on **2026-08-14**. Method is stated per item so it can be
re-run. No file larger than 1.6 MB was downloaded; sizes were read from ZIP central directories
via HTTP range requests.

### 1.1 Where the files actually are

The `dados.gov.br` dataset page is a JavaScript SPA and its public API returns `401` without a
token, so it is not a usable machine-readable entry point. The real host is a **Nextcloud
(SERPRO+) public share**:

```
https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9      # human UI
https://arquivos.receitafederal.gov.br/public.php/webdav/               # WebDAV, share token as username
```

`https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/` — the path most third-party
write-ups cite — returns **404**. RF changed the layout in January/February 2026.

WebDAV `PROPFIND` with `Depth: 1` and HTTP Basic `YggdBLfdninEJX9:` (empty password) returns a
`207 Multi-Status` listing. Verified working. This is the discovery mechanism a build should use;
do not hardcode a month.

### 1.2 Cadence, vintage, and completeness

Folders `2023-05` … `2026-08`, one per month, unbroken — **monthly, and reliably so for 40 months**.
The share root also contains `cnpj.tar.gz` (**63.95 GB**, last modified 2026-01-28) which is a
historical archive. **Do not download it.**

Latest folder `2026-08`, all files written 2026-08-09 between 18:26 and 18:35 UTC.

Every ZIP contains exactly **one** entry, and the entry name carries the extraction date:

```
Empresas1.zip           -> K3241.K03200Y1.D60808.EMPRECSV
Estabelecimentos0.zip   -> K3241.K03200Y0.D60808.ESTABELE
Socios2.zip             -> K3241.K03200Y2.D60808.SOCIOCSV
Simples.zip             -> F.K03200$W.SIMPLES.CSV.D60808
Cnaes.zip               -> F.K03200$Z.D60808.CNAECSV
```

`D60808` = 2026-08-08 on all 37 files. **This is the vintage-consistency check** (§3.5): the entry
name is readable from the ZIP central directory with a ~500-byte range GET, so all 37 files can be
proven same-vintage for well under 20 KB of traffic before a single byte of bulk data is pulled.

### 1.3 File inventory and verified sizes

Compressed sizes from `Content-Length`; uncompressed sizes read from each ZIP's central directory
(ZIP64-aware). **All verified, not estimated.**

| Dataset | Files | ZIP | CSV | Avg CSV line | **Rows (derived)** |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Empresas** | 10 | 1.369 GB | 5.431 GB | 78.75 B | **~69.0 M** |
| **Estabelecimentos** | 10 | 5.335 GB | 16.977 GB | 205.76 B | **~82.5 M** |
| Socios | 10 | 0.686 GB | 2.874 GB | 103.06 B | ~27.9 M |
| Simples | 1 | 0.302 GB | 3.142 GB | — | — |
| Reference (Cnaes, Motivos, Municipios, Naturezas, Paises, Qualificacoes) | 6 | 72 KB | ~0.2 MB | — | — |
| **Total** | **37** | **7.69 GB** | **28.4 GB** | | |

Row counts are **derived** (CSV bytes ÷ measured average line length from two independent samples:
Empresas0 = 78.72 B, Empresas5 = 78.77 B). Corroboration: RF's own October 2024 announcement states
*"cerca de 60 milhões de CNPJs, sendo mais de 21 milhões ativos"*. 60 M → 69 M over 22 months is
+15%, which is plausible. Treat ~69 M as ±5%.

The task brief's "~17 GB" understates it: **7.7 GB to download, 28.4 GB to parse.**

Note the partitioning is uneven — `Estabelecimentos0.zip` alone is 2.20 GB compressed / **7.01 GB
uncompressed**, while parts 1–9 are ~0.34 GB / ~1.1 GB each. Files are **not** sorted by CNPJ:
`Empresas1` begins at basic root `00000000`, `Empresas5` at `18421567`, `Empresas0` at `41273589`.
Any "process one file, get a contiguous ID range" assumption is wrong.

### 1.4 Licence — **unresolved, and a hard gate**

This is the one thing I could not verify, and it matters more than any number in this document.

- `gov.br/receitafederal/dados`, `.../dados-abertos/cadastros`, and the CNPJ sub-pages carry only
  a site-wide footer: *"Todo o conteúdo deste site está publicado sob a licença Creative Commons
  Atribuição-SemDerivações 3.0 Não Adaptada"* — **CC BY-ND 3.0**.
- On its face that footer governs *website content*, not the datasets. That is the ordinary reading
  and almost certainly the intent.
- But **no dataset-level licence statement was found anywhere**, and `dados.gov.br`'s metadata
  (which would normally carry one) is behind an authenticated API.
- **If CC BY-ND were held to apply to the data, this entire design is prohibited.** A normalized,
  filtered, re-indexed subset is a derivative work. ND forbids distributing derivatives.

The data's *public* status is not in doubt (Lei 12.527/2011 access-to-information; RF publishes it
deliberately and monthly). The *redistribution licence* is. Under DEC-20260428-A Tier 2, "vendor has
documented redistribution rights" is a stated precondition; the first-party equivalent here is
"publisher has documented redistribution terms". **We do not have that.**

**Required before any build:** obtain a written licence/terms answer from RF (Fale Conosco / e-SIC
request under LAI), or find the dataset-level metadata record. Estimated 2–6 weeks for an e-SIC
response. This is a blocking item, not a nice-to-have.

### 1.5 Which datasets are needed

**Required:**

- **Empresas** — supplies `RAZAO_SOCIAL`. This is the name column. **But it only carries
  `CNPJ_BASICO` (8 digits), not a usable CNPJ.**
- **Estabelecimentos** — supplies `CNPJ_ORDEM` (4) + `CNPJ_DV` (2), which are what turn the 8-digit
  root into the **14-character CNPJ the customer actually needs**. It also carries `NOME_FANTASIA`,
  `SITUACAO_CADASTRAL`, `UF`, `MUNICIPIO`, and the matriz/filial flag.

  **This is the single most important structural fact in the document.** A name→CNPJ index cannot
  be built from Empresas alone. Empresas is 5.4 GB; Estabelecimentos is 17.0 GB. The dataset you
  need for the identifier is three times the size of the one you need for the name.

- **Naturezas.zip** (1.5 KB) and **Municipios.zip** (43 KB) — needed to apply the natureza-jurídica
  personal-data exclusions (§5) and to render a município for disambiguation. Trivial.

**Not required:**

- **Socios** (2.87 GB, ~27.9 M rows) — partner/shareholder natural persons. Contributes nothing to
  name→CNPJ. **Excluded on LGPD grounds regardless — see §5.**
- **Simples** (3.14 GB) — Simples Nacional / MEI tax-regime flags. Irrelevant to name resolution.
- **Cnaes, Motivos, Paises, Qualificacoes** — only needed if enriching the *output*, which the
  existing ReceitaWS path already does per-call.

Excluding Socios and Simples removes **6.0 GB of the 28.4 GB** and removes the entire personal-data
ingest question for partners.

### 1.6 Verified CSV formats

No header row. `;` delimited. Every field `"`-quoted. **LF** line endings (not CRLF).

**Encoding: pure 7-bit ASCII.** Zero bytes above `0x7F` in a 901,070-byte sample. RF has already
uppercased and accent-folded the names — `CONSTRUÇÃO` is stored `CONSTRUCAO`. Decode as `latin1`
anyway (defensive: a stray high byte under `utf8` silently becomes U+FFFD).

**Empresas — 7 columns:**
```
CNPJ_BASICO(8) ; RAZAO_SOCIAL ; NATUREZA_JURIDICA ; QUALIFICACAO_RESPONSAVEL ;
CAPITAL_SOCIAL ; PORTE_EMPRESA ; ENTE_FEDERATIVO_RESPONSAVEL
```
```
"00000000";"BANCO DO BRASIL SA";"2038";"10";"120000000000,00";"05";""
"00000002";"WM&R EMPREITEIRA DE CONSTRUCAO CIVIL LIMITADA";"2240";"49";"0,00";"05";""
```
`CNPJ_BASICO 00000000 = "BANCO DO BRASIL SA"` is a stable, verifiable **golden anchor row** for
schema-drift detection (§3.4).

**Estabelecimentos — 30 columns** (positions that matter):
```
1 CNPJ_BASICO · 2 CNPJ_ORDEM · 3 CNPJ_DV · 4 MATRIZ_FILIAL(1=matriz,2=filial) ·
5 NOME_FANTASIA · 6 SITUACAO_CADASTRAL · 7 DATA_SITUACAO · 11 DATA_INICIO_ATIVIDADE ·
12 CNAE_PRINCIPAL · 14-19 address (TIPO_LOGRADOURO, LOGRADOURO, NUMERO, COMPLEMENTO, BAIRRO, CEP) ·
20 UF · 21 MUNICIPIO · 22-27 DDD/TELEFONE/FAX · 28 CORREIO_ELETRONICO ·
29 SITUACAO_ESPECIAL · 30 DATA_SITUACAO_ESPECIAL
```
Sampled prevalence (4,379 rows): `NOME_FANTASIA` present **50.9%**, `CORREIO_ELETRONICO` **15.3%**,
phone **34.9%**.

**Socios — 11 columns** (documented only to justify excluding it):
```
1 CNPJ_BASICO · 2 IDENTIFICADOR_SOCIO · 3 NOME_SOCIO · 4 CNPJ_CPF_SOCIO(masked "***623691**") ·
5 QUALIFICACAO · 6 DATA_ENTRADA · 7 PAIS · 8 REPRESENTANTE_LEGAL(masked) ·
9 NOME_REPRESENTANTE · 10 QUALIFICACAO_REPRESENTANTE · 11 FAIXA_ETARIA
```

### 1.7 The alphanumeric CNPJ change — affects the design *and* the shipped executor

**IN RFB nº 2.229/2024: from July 2026, newly issued CNPJs are alphanumeric.** The 14-position
structure is retained, but positions 1–8 (root) and 9–12 (establishment order) may contain letters;
only the two check digits stay numeric. Existing CNPJs remain valid and unchanged. RF's stated
motivation is combinatorial exhaustion — ~60 M CNPJs issued.

Consequences:

1. **Any schema storing `CNPJ_BASICO`/`CNPJ_ORDEM` as integers is wrong.** They must be `text`.
   This is easy to get wrong because every sample row today is numeric.
2. **`apps/api/src/capabilities/brazilian-company-data.ts` has a live bug independent of this
   design.** `const CNPJ_RE = /^\d{14}$/` and the digit-scanning regex in `findCnpj()` will reject
   every alphanumeric CNPJ. Companies registered from July 2026 onward are already being issued
   them. This is a two-line fix and is worth doing whether or not the ingest is ever built.

---

## 2. Storage options, with numbers

### 2.1 What production looks like today (verified)

```
Postgres 17.9 (Debian)          database size: 1,853 MB
shared_buffers          128 MB    effective_cache_size   4 GB
work_mem                  4 MB    maintenance_work_mem  64 MB
max_connections           100
largest tables: transactions 786 MB · cy_directors 366 MB · transaction_quality 240 MB
installed extensions: plpgsql only   (pg_trgm is NOT installed)
```

**`maintenance_work_mem = 64 MB` is the number to worry about.** Building a B-tree over 69 M rows
with a 64 MB sort budget means a large external merge sort — slow, and it writes heavily to the
same volume the database lives on.

**Calibration anchor.** `cy_directors` is a real bulk-ingested table in this database and gives
empirical bytes-per-row rather than textbook estimates:

| | rows | size | bytes/row |
| --- | ---: | ---: | ---: |
| heap | 1,168,754 | 175 MB | **157** |
| btree on one short text column | 1,168,754 | 32 MB | **27** |
| 3-column text PK | 1,168,754 | 151 MB | 129 |
| btree on `last_synced_at` | 1,168,754 | 7.4 MB | 6.3 ← Postgres 13+ btree deduplication; all values identical |

All Postgres estimates below are anchored on these, not on a formula.

### 2.2 Option (a) — full ingest of Empresas + Estabelecimentos

Load both files essentially as-is (Socios and Simples excluded per §1.5 / §5).

| | rows | est. bytes/row | est. size |
| --- | ---: | ---: | ---: |
| `br_empresas` heap | 69.0 M | ~100 | 6.9 GB |
| `br_estabelecimentos` heap | 82.5 M | ~215 | 17.7 GB |
| PKs + name index + CNPJ lookup index | | | ~6 GB |
| **Total** | | | **~31 GB** |

Storage cost at Railway's **$0.1555/GB-month** (derived from the verified `$0.00000006/GB/second`):
**$4.82/month**. During a rebuild you need roughly double → provision ~65 GB → **~$10/month**.

Verdict: **rejected.** It is 17× the current production database, it carries ~24 GB of columns
(street addresses, phones, emails, CNAE, dates) that name→CNPJ never reads, and §5 forbids ingesting
several of them anyway. The only argument for it is "we might want the other columns later" — and
the per-call ReceitaWS path already returns them.

**Reconciling with `minha-receita`.** The reference open-source loader for this dataset documents
**~180 GB total** (140 GB tables + 10 GB indexes + ~30 GB working space). That is ~6× my figure and
the gap is real, not an error in either: `minha-receita` loads **all** datasets (including Socios and
Simples) and denormalizes each company into a single JSONB document, which expands 28.4 GB of CSV
about 5×. This design loads two datasets into narrow typed columns, which expands ~1.4×. **If you
ever hear "the CNPJ database needs 180 GB", that is the everything-as-JSONB number, not this one.**

### 2.3 Option (b) — reduced name-index table **(recommended, if built at all)**

One row per **matriz** establishment. Matriz count is definitionally equal to the Empresas row count
(every CNPJ root has exactly one matriz), so **69.0 M rows** at most.

```sql
CREATE UNLOGGED TABLE br_name_index (
  cnpj            text        NOT NULL,   -- 14 chars, alphanumeric-safe (§1.7)
  cnpj_basico     text        NOT NULL,
  razao_social    text        NOT NULL,   -- CPF-stripped (§5)
  razao_norm      text        NOT NULL,   -- normalized match key
  nome_fantasia   text,
  fantasia_norm   text,
  situacao        smallint    NOT NULL,   -- 01 nula 02 ativa 03 suspensa 04 inapta 08 baixada
  uf              char(2),
  municipio       integer,                -- code only; NO street address (§5)
  data_inicio     date,
  vintage         char(6)     NOT NULL    -- '202608'
);
```
Deliberately absent: `logradouro`, `numero`, `complemento`, `bairro`, `cep`, `ddd*`, `telefone*`,
`fax`, `correio_eletronico`. See §5.

Per-row estimate: 23 B tuple header + null bitmap + alignment ≈ 24; fixed columns ≈ 16; varlena
(cnpj 15 + razao 36 + razao_norm 30 + fantasia 10 + fantasia_norm 9) ≈ 100; line pointer 4.
**≈ 144 bytes/row** — consistent with `cy_directors`' measured 157 for a comparably shaped table.

| Variant | rows | heap | `btree(razao_norm)` | `btree(fantasia_norm)` partial | `unique btree(cnpj)` | GIN trgm | **total** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **b1** all statuses + fuzzy | 69.0 M | 9.9 GB | 3.4 GB | 1.4 GB | 2.1 GB | 3.1–5.2 GB | **~21 GB** |
| **b2** all statuses, exact-match only | 69.0 M | 9.9 GB | 3.4 GB | 1.4 GB | 2.1 GB | — | **~16.8 GB** |
| **b3** active only (`situacao=02`) + fuzzy | ~24 M | 3.5 GB | 1.2 GB | 0.5 GB | 0.7 GB | 1.1–1.8 GB | **~7.4 GB** |
| **b4 — recommended** active only, exact-match only | ~24 M | 3.5 GB | 1.2 GB | 0.5 GB | 0.7 GB | — | **~5.9 GB** |

Active-row count derives from RF's *"mais de 21 milhões ativos"* (Oct 2024) scaled to the 2026
population — **~24 M, estimated, ±20%.** This is the softest number in the document.

**Independent corroboration of the index sizes.** `minha-receita`'s FAQ reports that on the same
~60 M-row population a **CNAE-only index cost ~2 GB** and a **UF + município composite ~1.5 GB** —
i.e. ~33 and ~25 bytes/row for short keys. My `btree(razao_norm)` estimate of ~49 B/row for a
~30-character key sits appropriately above both. Two independent calibrations (that project's, and
this database's own `cy_directors`) agree, which is the most confidence available without building it.

Estimate-quality flags:
- heap, B-tree sizes: **estimates**, anchored on measured `cy_directors` bytes/row → confidence high.
- GIN trigram sizes: **estimates with a wide band** (1.5–2.5× indexed text volume). Nothing in this
  database uses `pg_trgm` — the extension is not even installed — so there is no local calibration.
- `pg_trgm` would have to be enabled: `CREATE EXTENSION pg_trgm`. Whether Railway's managed Postgres
  image permits it is **unverified**.

Railway cost for **b4**: 5.9 GB → **$0.92/month**, or **~$1.9/month** provisioning 2× for rebuild
headroom. Storage is genuinely cheap.

**The real cost is RAM, and it is 10–40× the storage cost.** Railway RAM is **$10.00/GB-month**
(derived from `$0.00000386/GB/second`). With `shared_buffers` at 128 MB, random probes into a 1.2 GB
name index will miss cache constantly. Two honest options:

- **Pay for it:** ~+1.5–2 GB resident → **+$15–20/month** for b4; ~+4 GB → **+$40/month** for b1.
- **Don't, and accept disk-bound lookups:** a Railway volume is network-attached; a 4-level B-tree
  probe is ~4–12 ms. At €0.05/call and single-digit calls/day, that is completely acceptable. **This
  is the right answer** — this capability does not have the traffic to justify buying RAM.

CPU during ingest is a non-issue: decompressing 22 GB and parsing ~150 M lines at ~15 MB/s is ~25
minutes of CPU; even a 6-hour ingest costs **~$0.11** at $20.01/vCPU-month.

Egress is **$0.05/GB** but the ingest is *ingress* (downloading into Railway), which is not billed.

### 2.4 Option (c) — offline build + external artifact

Do the parse, filter, normalize, and sort **off production entirely** (GitHub Actions runner, or
Petter's laptop, once a month). Emit a compact sorted artifact and serve lookups from it.

**(c1) Artifact on Cloudflare R2, queried by HTTP range.**
- Artifact: ~24 M rows × (`razao_norm` ~30 B + cnpj 14 B + uf/município/situação ~6 B). Raw ≈ 1.2 GB;
  sorted, dictionary-encoded and compressed (Parquet or a purpose-built sorted block file) →
  **~250–400 MB**. *(Estimate; compression ratio not measured.)*
- R2 pricing: **$0.015/GB-month** storage, **$0 egress**, Class B reads $0.36/million.
  → **$0.006/month** storage. At 100 lookups/day × 4 range GETs = 12,000 reads/month → **$0.004**.
  **Effectively free.**
- Latency: 3–4 binary-search range GETs, Railway US-East → R2, ≈ 30–50 ms each → **~150 ms added**.
  Fine for a €0.05 capability.
- **Zero production-database impact. Zero WAL. No bulk write ever touches the live DB.** This
  eliminates the exact failure mode DEC-20260504-B exists to prevent — not by mitigating it, but by
  removing it.
- Cost: a new moving part (R2 bucket, credentials, a build pipeline) and a hand-written range-read
  query layer. Fuzzy matching over a remote sorted file is impractical — you get exact-normalized
  match plus prefix. Given §4's refuse-on-ambiguity requirement, that is an acceptable, arguably
  desirable, constraint.

**(c2) In-memory in the API process.** ~24 M × ~40 B compact ≈ 1 GB RSS → **$10/month**, plus a
400 MB cold-start download on every deploy. **Rejected** — Railway app instances restart often.

**(c3) Read-only SQLite on a Railway volume attached to the API service.** ~24 M rows with one index
≈ 2.5–3 GB → **$0.39–0.47/month**. Query via `better-sqlite3`; swap monthly by writing a new file
and flipping a pointer. No Postgres impact, no new vendor. Downsides: volumes bind to one service
instance (blocks horizontal scaling), synchronous SQLite calls block the event loop (bounded by a
per-query row cap), and the API service may not currently have a volume attached (**unverified**).

### 2.5 Comparison

| | infra $/mo | prod-DB risk | new vendor | latency added | fuzzy match | effort |
| --- | ---: | --- | --- | ---: | --- | ---: |
| (a) full Postgres | $5–10 | **high** | no | ~5 ms | yes | 5–7 d |
| (b1) index, all statuses + trgm | $3.3 + up to $40 RAM | **high** | no | ~5 ms | yes | 4–6 d |
| **(b4) index, active-only, exact** | **$0.9–1.9** | **medium** | no | 4–12 ms | no | **3–5 d** |
| **(c1) R2 artifact** | **~$0.01** | **none** | R2 | ~150 ms | no | **4–6 d** |
| (c3) SQLite on volume | ~$0.45 | none | no | ~2 ms | limited | 4–6 d |

**If this is built, build (c1).** It costs essentially nothing, and it is the only option where a
bulk-ingest bug cannot take production down. **(b4)** is the acceptable alternative if adding R2 is
unwelcome — but it accepts a monthly 24 M-row write against the live database, which is precisely
the thing that crashed production on 2026-05-04.

---

## 3. Ingest mechanics

### 3.1 The pattern already exists

`apps/api/src/jobs/ingest-cy-directors.ts` is the template and it is good: `pg_try_advisory_lock`
for cross-instance dedup, a dedicated `postgres({ max: 1 })` connection so long work never shares
the request pool, `HEAD`/`Last-Modified` skip-if-unchanged, stream-to-tmpfile then stream-parse,
batched UPSERT in short transactions, tombstone sweep on `last_synced_at`, `isShuttingDown()` checks
between batches. Reuse the structure wholesale.

**It does not generalize unmodified.** It handles one 120 MB plain CSV. This is 37 ZIPs, 7.69 GB
compressed, ~150 M rows, requiring a cross-file join. The differences are §3.2–§3.7.

### 3.2 Download

1. `PROPFIND Depth: 1` on the share root → pick the lexically greatest `YYYY-MM` folder.
2. `PROPFIND Depth: 1` on that folder → 37 names + `Content-Length` each.
3. **Vintage gate (§1.2):** range-GET the last ~700 bytes of each file, parse the ZIP central
   directory, extract the entry name, assert all 37 carry the same `D%y%m%d` token. ~20 KB total.
   Abort if mixed — RF's publish window spans ~9 minutes and a downloader that starts mid-publish
   otherwise silently produces a Frankenstein vintage.
4. Compare that vintage token to the last successful ingest. Equal → no-op.
5. Download the **12 required files only** (10 Empresas + … see §3.3) — **not all 37**.

**Partial downloads.** Range requests are supported (verified: `206 Partial Content`). Resume with
`Range: bytes=N-`. RF publishes **no checksums**, so verification is: (a) final size equals the
`Content-Length` seen at listing time; (b) the ZIP central directory parses and its
`uncompressed size` matches what the streaming inflater actually produced; (c) we record our own
SHA-256 per file per vintage, so a re-publish mid-month is detectable.

### 3.3 The join problem

Name lives in Empresas (5.4 GB); the CNPJ suffix lives in Estabelecimentos (17.0 GB); files are not
sorted by CNPJ and the two datasets' part-numbering does not align. You cannot stream-merge them.

Three ways, in preference order:

1. **Estabelecimentos-first, two passes (recommended).** Pass 1: stream all 10 Estabelecimentos,
   keep **only matriz rows** (`col 4 = '1'`) and **only active** (`col 6 = '02'`) for b4, projecting
   6 fields. ~24 M × ~30 B ≈ **720 MB** — holdable in a `Map` on a build runner, or spilled to a
   sorted temp file. Pass 2: stream Empresas; for each `CNPJ_BASICO` present in the pass-1 set,
   emit the joined row. Peak RSS ~1.2 GB. Trivially satisfiable on a GitHub Actions runner (7 GB)
   or a laptop; **not** something to do inside the Railway API container.
2. **Stage both in Postgres, join in SQL.** Simplest to write, worst for the live database — stages
   ~24 GB before producing a 3.5 GB result.
3. **Sort both to disk and merge-join.** Lowest memory, most code. Only needed if pass-1 memory is
   a hard constraint, which it isn't.

**This is the strongest argument for option (c): the join wants a build machine, not a web service.**

### 3.4 Parsing failure modes

| Failure | Detection | Handling |
| --- | --- | --- |
| **ZIP64** — `Estabelecimentos0.zip` is 7,007,687,931 B uncompressed; its 32-bit field reads `0xFFFFFFFF` with the real size in a ZIP64 extra. **Verified.** | central-directory parse | Use a ZIP64-aware reader. `yauzl` with `lazyEntries` handles it; `unzipper` has a history of ZIP64 bugs. A hand-rolled local-header + `zlib.createInflateRaw` path also works (used for this document's measurements). |
| **No header row** — column identity is positional and undocumented in-file | assert exact column count per row (7 / 30 / 11) | Reject the vintage, don't ingest a shifted one |
| **Silent column reordering between months** | golden anchor: `CNPJ_BASICO 00000000` must yield `RAZAO_SOCIAL = "BANCO DO BRASIL SA"` (verified present in `Empresas1`) | Abort ingest, alert, keep the previous vintage serving |
| **Alphanumeric CNPJ (§1.7)** | any non-digit in `CNPJ_BASICO`/`CNPJ_ORDEM` | Must be accepted, not rejected. `text` columns throughout. Add a fixture row before July-2026 registrants appear. |
| **Encoding** | bytes > `0x7F` (currently zero) | Decode `latin1`, never `utf8` |
| **Embedded `;` or `"` inside quoted fields** | — | The `CsvStreamer` in `ingest-cy-directors.ts` is RFC-4180-correct including doubled-quote escaping; change the delimiter to `;` and disable header detection. Reuse it. |
| **Truncated final line** | streamer `flush()` emits a partial row | Compare final row count against the previous vintage; a >2% drop aborts |

### 3.5 Bulk-Operation Deploy Protocol (DEC-20260504-B) compliance

The protocol applies in full. On 2026-05-04 a correct-in-isolation retention fix filled the volume
and crash-looped Postgres for 28 minutes. A 24–69 M-row monthly rebuild is a far larger workload
than that was.

**1. Identify the latency.** This is not a resumed silent job — it is a *new* bulk operation whose
first run has no steady state. Every monthly tick is a full-population write. Treat **every tick**
as a workload-resumption event, not just the first.

**2. Accumulated-workload audit (must be in the PR body, with real queries):**

| | b4 (active only) | b1 (all statuses) |
| --- | ---: | ---: |
| rows written per tick | ~24 M | ~69 M |
| heap written | ~3.5 GB | ~9.9 GB |
| indexes rebuilt | ~2.4 GB | ~6.9 GB |
| **WAL if LOGGED** | **~12–15 GB** | **~34–42 GB** |
| **WAL if UNLOGGED** | **~0** | **~0** |
| peak disk during table swap | ~12 GB | ~34 GB |
| current DB size for scale | 1.85 GB | 1.85 GB |

**3. Deploy strategy — pick explicitly. Three mandatory choices:**

- **(i) `UNLOGGED` table.** This is derived, 100% reproducible data. `UNLOGGED` removes essentially
  all WAL for the bulk load and roughly halves ingest time. Cost: the table is **truncated on crash
  recovery**. That is acceptable *only* with (ii).
- **(ii) Empty-table circuit breaker.** The capability must check that the index is populated and
  the vintage is fresh before using it, and fall back to the CNPJ-only path when it isn't — not
  return "no match found". An empty `UNLOGGED` table silently answering "not found" would be a
  confidently-wrong answer, the exact failure class §4 exists to prevent. This is also the
  stale-data circuit breaker DEC-20260428-B requires.
- **(iii) Build-then-swap, throttled.** `COPY` into `br_name_index_next` in 50 k-row chunks with a
  yield between chunks and a per-tick time budget; then a single short transaction to `DROP` the old
  and `RENAME` the new. Never `DELETE`-then-`INSERT` in place. Never one giant transaction.

  With option (c) the entire table disappears from this list: the artifact is built off-prod and
  published atomically. **"Ship and pray" is not on the menu; option (c) is the version where there
  is nothing to pray about.**

  Build-then-swap is also what the reference implementation does. `minha-receita`'s documentation
  states there is no incremental update path — *"Não existe 'atualizar' o banco de dados"* — and
  prescribes building a fresh database, repointing the API, then dropping the old one. Full monthly
  reload is the normal operating mode for this dataset, not a shortcut.

**4. Post-run reporting** (protocol requirement): rows processed, duration, peak volume usage, WAL
generated, and the first-successful-run outcome must be recorded in the PR and the Journal entry.

### 3.6 Scheduling and concurrency

Monthly cadence, but poll **weekly** with the vintage-token skip (RF's publish day drifts; the
`cy_directors` job uses the same weekly + skip-if-unchanged reasoning). Dedicated advisory lock ID,
distinct from `20260519`. Dedicated `postgres({ max: 1 })` connection. `isShuttingDown()` between
chunks. Startup delay so a deploy storm doesn't trigger ten concurrent ingests.

### 3.7 Deploy-mechanism verification (DEC-20260504-C)

The job only runs if it is actually wired. Before merge, confirm by file path — not by pattern —
that the new job's `start*Ingest()` is called from `apps/api/src/index.ts` exactly as
`startCyDirectorsIngest()` is. Post-deploy, verify by **querying prod for the effect**
(`SELECT count(*), max(vintage) FROM br_name_index`), not by reading a log line.

---

## 4. Name matching

### 4.1 The requirement

Registry name search never ranks by relevance — this is written into
`apps/api/src/lib/company-name-match.ts` and was learned the hard way (Brreg returned
`NITO TELENOR` before `TELENOR ASA`; PRH returned Fysios for "Nokia"). A local index is *worse*
than a registry API here, because there is no upstream relevance signal at all: a normalized-name
lookup either hits or it doesn't, and multiple rows can hit identically.

**Returning the wrong company is worse than returning nothing.** The design must refuse.

### 4.2 Brazilian normalization

Reuse `normalizeCompanyName` / `classifyNameMatch` from `apps/api/src/lib/company-name-match.ts`.
Two BR-specific additions, applied **before** the shared normalizer:

**(1) Strip MEI/EI identifier decoration from `RAZAO_SOCIAL`.** Two conventions coexist:
- `"IRENILDA OLIVEIRA SILVA 11338767810"` — natural-person name + **unmasked 11-digit CPF**
- `"41.273.592 HELIO DE JESUS PEREIRA"` — formatted CNPJ + natural-person name

Measured on 11,447 Empresas0 rows and 11,440 Empresas5 rows: **52.5% / 57.8%** carry the trailing
CPF form; **11.6%** carry the leading-CNPJ form. Both must be stripped before storing (§5 makes the
CPF strip mandatory, not cosmetic).

**(2) Extend the corporate-suffix list.** `CORP_SUFFIX_RE` already covers `sa`, `co`, `ltd`,
`limited`, `group`, `srl`, `sas`. Add: **`ltda`, `limitada`, `eireli`, `epp`, `cia`**.

**Do NOT add `me`, `ei`, `ss`, or `mei`.** `ME` (Microempresa) and `EI` are real legal-form suffixes,
but they are also ordinary tokens that appear inside real names. This is exactly the reasoning the
file already documents for refusing bare `as` (Norwegian) and `kg` (German) — follow it. Companies
suffixed `ME` still resolve via the multi-token Jaccard path.

Accents: RF has already folded them (§1.6), but **callers have not** — a caller typing
`"Construção Naval"` must fold to `CONSTRUCAO NAVAL` to match. The existing `foldDiacritics` handles
this. Do not skip it because the stored side looks like plain ASCII.

`razao_norm` and `fantasia_norm` are computed **at build time** with the exact same function the
query path uses. If the normalizer changes, the index must be rebuilt — enforce with a
`normalizer_version` column checked at query time.

### 4.3 Resolution algorithm

```
1. Fold + normalize the caller's input.
2. Exact lookup on razao_norm.  If 0 hits, exact lookup on fantasia_norm.
3. Prefer situacao = 02 (Ativa) candidates. If the only candidates are baixada/inapta,
   keep them but mark the result and never auto-resolve from them.
4. Score every candidate with classifyNameMatch(input, candidate.razao_social).
5. Resolve ONLY if:
     exactly one candidate scores "exact"
   OR
     exactly one candidate scores "high" AND no other candidate scores "high" or "exact".
   Otherwise REFUSE.
6. On refusal, return up to 10 candidates with { cnpj, razao_social, uf, municipio,
   situacao, match_confidence } and ambiguous: true, so the caller can disambiguate.
   Never pick one.
```

Always emit `match_confidence`, `is_exact_match`, `candidates_considered`, `ambiguous`, plus
`index_vintage` and `resolution_method: "bulk_index" | "direct_cnpj"`.

### 4.4 How ambiguous is it, really — honestly

Within an 11,447-row contiguous slice of Empresas0: **11,431 distinct normalized names, 14 names
occurring more than once, 30 rows (0.3%) in a collision group.** Every top collision was a
natural-person name (`VANESSA ANDRADE BATISTA` ×4).

**That 0.3% is a lower bound and should not be quoted as the real rate.** The sample is a tiny
contiguous slice of the ID space; collision probability across 69 M rows is vastly higher (Brazil
has thousands of companies literally named `TRANSPORTES SAO JOSE LTDA` across different states).
Measuring the true rate requires the full ingest — which is circular, and is itself the argument
for a hard refuse-on-ambiguity rule rather than a tuned confidence threshold.

Two consequences:
- **Return UF + município on every candidate.** It is often the only thing distinguishing two
  identically-named companies, and it is the *reason* those two columns survive the §5 cut.
- **Excluding natural-person-name rows (§5) is a match-quality improvement, not just compliance.**
  ~76% of Empresas rows are natureza 2135 (Empresário Individual). Indexing them turns a
  company-name search into a people-search where the top collisions are all human names.

---

## 5. Personal-data assessment (LGPD)

Lei 13.709/2018 applies. The data being public by statute does **not** dispense with LGPD's other
duties — building a searchable index over it is a distinct processing operation from RF publishing
a file, and it is the operation we would be responsible for.

### 5.1 MUST NOT be ingested

**All 10 Socios files (2.87 GB, ~27.9 M rows) — excluded entirely.**
Natural-person names, partially-masked CPF (`***623691**` — the middle 6 of 11 digits), age band
(`FAIXA_ETARIA`), and legal-representative names. Contributes nothing to name→CNPJ.
This is deliberately *not* the `cy_directors` precedent: Cyprus publishes names + roles only, with
no national identifier and no age data, and it served a specific tier-2 KYB need. A Brazilian
partner register with a masked national ID and an age band is a materially different risk profile
and would be **DEC-20260428-B-grade** work — versioned dataset, match explainability, dispute
endpoint, threat model, public methodology page. Not in scope for name resolution.

**Estabelecimentos columns 22–28 — contact fields.**
`DDD_1`, `TELEFONE_1`, `DDD_2`, `TELEFONE_2`, `DDD_FAX`, `FAX`, `CORREIO_ELETRONICO`. Present in
34.9% / 15.3% of sampled rows. For the ~76% of records that are Empresário Individual or MEI, these
are the natural person's own phone and email.

This is the **direct analogue of the approved Mexican DENUE decision — "exclude sole-trader contact
fields"** (`handoff/_general/from-code/2026-08-14-settlement-outage-and-monitoring.md`;
`docs/strategy/2026-08-demand-mined-build-queue.md` §274, which flags that DENUE's business phone
"may also be a personal one" and requires a human read before launch).

Apply the same conservatism, and apply it **to every row rather than trying to classify sole
traders**. Natureza jurídica is not a reliable proxy — a one-person company under an ordinary
corporate form has the same problem — and a partial exclusion creates a rule that quietly fails.

**Estabelecimentos columns 14–19 — street address.**
`TIPO_LOGRADOURO`, `LOGRADOURO`, `NUMERO`, `COMPLEMENTO`, `BAIRRO`, `CEP`. For a sole trader the
registered address is typically their **home** address. Keep **UF + `MUNICIPIO` code only** —
sufficient to disambiguate two same-named companies (§4.4), insufficient to locate a person's home.

**Unmasked CPFs inside `RAZAO_SOCIAL`.**
The single most under-appreciated risk in this dataset. **52–58% of Empresas rows** carry a natural
person's full name followed by their **unmasked 11-digit CPF** in what looks like a company-name
column. RF masks CPF in the Socios file and does not mask it here.

Two obligations:
- **(a) Strip it at parse time, before the value is written anywhere** — including logs, error
  messages, the transaction `input`/`output` audit trail, and any dispute-endpoint payload. A CPF
  must never reach a Strale-persisted record.
- **(b) Exclude natureza-jurídica 2135 (Empresário Individual) rows from the searchable name index
  by default.** These are natural persons trading under their own name; indexing them makes the
  capability a people-search over tens of millions of Brazilians. Load `Naturezas.zip` (1.5 KB) and
  have a human review the full code list to finalize the exclusion set before launch — I verified
  2135 = Empresário (Individual) at ~76% prevalence, but did not verify the other individual-person
  codes and will not guess them.

### 5.2 Erasure rights survive the rebuild — the classic trap

LGPD Art. 18 gives data subjects correction and deletion rights. A **monthly full rebuild silently
resurrects anything deleted by hand.** A one-off `DELETE` is not compliance; it is a 30-day pause.

Required: a `br_name_suppression` table applied **as a build-time filter on every ingest**, never as
a post-hoc delete. It must survive table swaps and be covered by a test that asserts a suppressed
key is absent after a simulated rebuild.

### 5.3 Manifest and disclosure

- `processes_personal_data: true` — unavoidable. Even after every exclusion above, some razão
  sociais of non-MEI entities incorporate personal names.
- `gdpr_art_22_classification: data_lookup` — it resolves an identifier; it produces no screening
  finding and no recommendation.
- Provenance must state `acquisition_method: licensed_bulk` (contingent on §1.4 resolving),
  `primary_source_reference` pointing at RF, and the **`index_vintage`** so a caller can see how
  stale the answer is. Monthly data means a company registered three weeks ago is absent — a
  limitation that must be declared, not discovered.

### 5.4 Non-negotiable prerequisites

1. §1.4 licence question answered in writing.
2. Human sign-off on the natureza-jurídica exclusion list.
3. Suppression-list mechanism built and tested **before** first production serve, not after.

---

## 6. Effort estimate

| | option (b4) | option (c1) |
| --- | ---: | ---: |
| ZIP64 + `;`-CSV streaming reader (adapting `CsvStreamer`) | 0.5 d | 0.5 d |
| WebDAV discovery + vintage gate + resumable range download | 0.5 d | 0.5 d |
| Two-pass cross-file join | 1.0 d | 1.0 d |
| BR normalization + `classifyNameMatch` extension + tests | 1.0 d | 1.0 d |
| LGPD filters, CPF stripping, suppression list + tests | 0.5 d | 0.5 d |
| Throttled build-and-swap, UNLOGGED, circuit breaker, DEC-20260504-B audit | 1.0 d | — |
| Artifact format + R2 publish + range-read query layer | — | 1.5 d |
| Capability wiring, manifest, onboarding pipeline, readiness check | 0.5 d | 0.5 d |
| First-ingest supervision + post-deploy verification | 0.5 d | 0.5 d |
| **Total** | **~5.5 d** | **~6.0 d** |

Excludes the §1.4 licence resolution (2–6 weeks of calendar time, ~0.5 d of work) and the human
review in §5.4. **Ongoing:** a monthly ingest that can break on upstream schema drift — realistically
0.5–1 d/quarter of maintenance, forever.

---

## 7. Recommendation: **do not build this**

### 7.1 The demand premise does not survive production data

The brief states a paying customer is failing 59% of calls because they send company names. **All
three parts of that are wrong.** Production, queried 2026-08-14:

**Who is actually calling `brazilian-company-data` (90 days):**

| caller | calls | completed | revenue |
| --- | ---: | ---: | ---: |
| `system@strale.internal` (our own test harness) | **3,591** | 1,450 | **€0.00** |
| anonymous x402 (real paying traffic) | 31 | 19 | **€0.95** |
| `test2@strale.io` (our own account) | 1 | 1 | €0.05 |
| **total** | **3,623** | **1,470** | **€1.00** |

**What callers actually send (120 days).** Enumerating every JSON key ever passed to this capability:

```
input key   occurrences
---------   -----------
cnpj                 32
```

That is the complete list. Every other call — **3,591 of them** — passed `{}`, an empty object.
**Not one caller has ever sent a company name.** A query for any input that is neither `{}` nor a
plain CNPJ returns zero rows over 120 days.

**So the 17-of-29 failures in the last 12 hours are our own test harness calling with no input at
all.** They are a fixture bug, not a customer signal.

**What the real customers hit.** The 31 x402 calls all sent well-formed CNPJs. Their failures are
`ReceitaWS returned HTTP 429` (11 in 14 days) and one 404. **The actual customer-facing defect is a
rate limit — and we are the ones consuming it.**

The mechanism, verified against the scheduler source and prod:

| | value |
| --- | --- |
| `test_suites` for this slug | 7 rows, **all `test_mode='live'`, all `active`, all `scheduled_testing_eligible = TRUE`** |
| scheduler filter | `ts.scheduled_testing_eligible = TRUE` + slug-hash stagger (`test-scheduler.ts:288,347`) |
| `capabilities.cost_class` | **`free_unlimited`**, `quota_window = 'none'`, `quota_cap = NULL` |
| ReceitaWS free tier | ~3 requests/minute |

**The bug is the `cost_class`.** ReceitaWS is not `free_unlimited` — it is rate-limited, which is
precisely the `free_quota` class that `guardedExecute`'s ALLOW_MATRIX exists to budget-check.
Declaring it unlimited disarms that check: the gate sees no quota to protect, the scheduler sees an
eligible suite, and six schedulable suites (piggyback is excluded per Principle C) dispatch hourly —
**≈60 calls/day, matching the observed volume.**

This is the same incident repeating. `guarded-executor.ts` opens by documenting the 2026-05-11
finding that 95% of 60-day DE OpenRegister traffic came from the test scheduler and exhausted a
50/month free tier, with the root cause named as *"scheduler treated `external_cost_cents = 0` as
'free to test,' conflating 'no per-call cost' with 'no quota'."* The machinery built in response is
present and working as designed. `brazilian-company-data` simply carries a classification that tells
it there is nothing to protect.

> **Correction.** An earlier revision of this document (and a PR comment) asserted that the
> scheduler dispatches on `external_cost_cents = 0`. That is wrong, and it is the exact conflation
> the 2026-05-11 incident identified. The scheduler reads `scheduled_testing_eligible`;
> `external_cost_cents` is billing-only (`schema.ts:571-577`). The claim came from CLAUDE.md's
> simplified paraphrase, which is stale, and I labelled it "verified" without reading the scheduler.
> The corrected control flow is in §7.3.

### 7.2 Against the standard the platform already set

`docs/strategy/2026-08-demand-mined-build-queue.md` ranks `mexican-company-data` #1 *because* it had
50 paid calls from a named, repeat buyer identifiable before the build — and explicitly notes that
"12 company-data capabilities have earned €0 in 90 days" and that DEC-20260812-A requires a named
buyer. Brazil name→CNPJ has **zero** calls from **zero** buyers. Building 5.5 days of infrastructure
plus permanent monthly maintenance for a use case with no observed instance is exactly what that
document was written to stop.

### 7.3 Do this instead — roughly two hours

1. **Fix the self-inflicted 429s.** *Highest value per minute in this entire document.* Two changes,
   and the order of operations matters:

   - **Reclassify** `brazilian-company-data` from `cost_class = 'free_unlimited'` to `'free_quota'`
     with a real `quota_window` / `quota_cap`. This is the actual defect and it re-arms
     `guardedExecute`'s budget check for every non-customer context.
   - **Stop the hourly dispatch.** Set `external_cost_cents` to a non-zero value on the suites —
     **not** `scheduled_testing_eligible` directly.

   **The trap: do not hand-edit `scheduled_testing_eligible`.** Startup migration Block 0066 runs on
   *every boot* and executes
   `UPDATE test_suites SET scheduled_testing_eligible = (external_cost_cents = 0)` as an interim
   derivation bridge, with a post-condition that **fails boot** if any row disagrees. A manual
   eligibility flip is silently reverted at the next deploy. `external_cost_cents` is therefore the
   only durable control knob today — which is confusing, because it is documented as billing-only
   and the scheduler does not read it. That indirection is worth removing when PR B lands and
   forces explicit eligibility declarations.

   **Then check whether this is systemic.** The failure is not BR-specific: any capability whose
   upstream is rate-limited but which is classified `free_unlimited` gets proactively dispatched.
   Worth one catalogue-wide query joining `cost_class = 'free_unlimited'` against capabilities with a
   metered or throttled dependency. **A rate limit is a cost even when the invoice is €0** — that is
   the lesson the 2026-05-11 DE OpenRegister incident already paid for, and this is its second
   occurrence.
2. **Fix the `{}` fixture** so the harness stops generating 2,100 fake failures a quarter and
   poisoning the quality signal. Under DEC-20260812-A's quality floor, a 59% "failure rate" that is
   entirely self-generated could quarantine a working capability.
3. **Fix the alphanumeric-CNPJ regex (§1.7).** `/^\d{14}$/` rejects every CNPJ issued since July
   2026. Two lines. Independent of everything else here.
4. **Keep today's improved error message.** It is the correct response to a name input, and it
   costs nothing.
5. **Instrument the demand.** Log every rejected-because-not-a-CNPJ input shape. If name-shaped
   inputs start arriving from a paying wallet, that is the trigger to reopen this document — which
   is then ready to execute.

### 7.4 The vendor path — surveyed, and mostly closed

A vendor survey was run alongside this design (primary docs only; see Appendix A rows 21–24).

**There is no official government API for name→CNPJ. Verified, not assumed.** Serpro's paid
`Consulta CNPJ` v2 takes the CNPJ as a **path segment**
(`/consulta-cnpj-df-trial/v2/basica/34238864000168`) — there is no name operation. gov.br Conecta's
`Consulta CNPJ` is CNPJ-keyed *and* restricted to public bodies by IP registration. This closes the
"official API" tier of DEC-20260813-A's preference order and is why licensed bulk is next in line.

Four commercial vendors do offer genuine name search, confirmed in their own documentation:

| Vendor | Name search | Price | Redistribution status |
| --- | --- | --- | --- |
| **CNPJ.ws** | `GET comercial.cnpj.ws/v2/pesquisa?razao_social=` (premium plan) | unpublished | **Prohibited — hard no.** ToS: *"não sendo permitida qualquer comercialização através de outros sites ou qualquer outro meio."* |
| **Casa dos Dados** | `POST api.casadosdados.com.br/v5/cnpj/pesquisa`, `tipo_busca: exata\|radical` | R$ 0,006 → 0,00067/query; R$ 29,90–1.999,90/mo | **Silent.** ToS read in full (rev. 2025-02-07); no clause either way. Silence is not a licence. |
| **CNPJá** | `office.search()` with `names.in` / `company.name.in` | ~R$ 25/100/825 mo — **unconfirmed** | **Unknown.** Site returned HTTP 429 to all 8 fetch attempts; ToS never reached. |
| **BigDataCorp** | `POST plataforma.bigdatacorp.com.br/empresas`, `q: name{...}` | R$ 0,03/query, 500 free/mo | Reseller programme exists but only as a marketing page; contract terms require sales contact. |

Two things make this path harder than the price list suggests:

1. **No vendor currently satisfies DEC-20260428-A Tier 2.** That decision requires *documented*
   redistribution rights plus indemnification plus per-fact primary-source provenance. One vendor
   explicitly forbids resale, one is silent, two are unreadable. This is procurement, not
   engineering, and it gates the whole buy path.
2. **Moonlighter AB has no Brazilian tax ID.** Casa dos Dados' signup requires a CPF or CNPJ;
   BigDataCorp requires a contracting flow. **This binds before price or API shape ever matters** and
   is the first thing to test if the vendor path is ever pursued.

Also worth recording, because it will otherwise be rediscovered: **BigDataCorp bills per *entity
returned*, not per call** (*"considera a quantidade de entidades retornadas"*), so a loose name query
has variable cost — a poor fit for a fixed €0.05 resale price. And **`minha-receita`, the reference
self-host loader, deliberately does not implement name search** — the omission is documented as an
economic choice, and its own `Query` struct exposes only CNAE, município, natureza jurídica and UF.
`razao_social` is output-only. Anyone self-hosting it still has to write §4 themselves.

Do not cite Econodata's marketing claim of name+state matching: their published v3 OpenAPI spec
accepts only `cnpj`, `site`, `email`, `raiz_cnpj`. Neoway's developer portal no longer resolves in
DNS. OpenCorporates' free tier requires derived products be released under an open licence, which is
structurally incompatible with resale.

### 7.5 The alternatives, ranked

| Option | Cost | When it's right |
| --- | --- | --- |
| **Accept CNPJ-only + today's error (recommended)** | ~2 h | Now. No demand evidence exists. |
| Tier-2 vendor with name search | R$ 0,006–0,03/query, no infra, no LGPD ingest exposure | Only after a Brazilian tax ID exists *and* redistribution is resolved in writing. Casa dos Dados is the better-shaped primitive; BigDataCorp the better-shaped relationship. §7.4 |
| **Option (c1) bulk ingest** | ~6 d + ~$0.01/mo + licence resolution | Only after a named buyer sends name-shaped BR queries at volume, *and* §1.4 resolves favourably. |
| Option (b4) bulk ingest | ~5.5 d + ~$1–2/mo | Same trigger, if adding R2 is unwelcome. Accepts monthly bulk writes against production. |

Note the shape of this: the vendor path is blocked on a **corporate registration** problem and the
bulk path on a **licence** problem. Neither is an engineering problem, and neither is solved by
writing code this week.

### 7.6 Decisions for Petter

1. **Build or not?** The recommendation is **not now**. Confirm or override.
2. **§1.4 — the licence.** Even if you override (1), this blocks the build. Do you want an e-SIC
   request filed with RF? It is cheap and slow, so filing it now costs little and unblocks later.
3. **The 429 fix.** This one is genuinely urgent and unrelated to the ingest — it is degrading the
   only paying traffic this capability has. Approve as a standalone fix?
4. **Vendor path.** Casa dos Dados is cheap (R$ 0,006/query) and well-shaped, but its ToS is silent
   on redistribution and its signup needs a Brazilian tax ID. Is it worth spending an hour asking
   them both questions in writing, or is that a dead end you'd rather not open?
5. **If overridden — (c1) R2 artifact or (b4) Railway Postgres?** The recommendation is (c1): the
   cost difference is negligible and (c1) removes production-database risk entirely rather than
   mitigating it.
6. **§5.4 human review.** The natureza-jurídica exclusion list needs a human decision before launch,
   as the Mexican build did. That is yours, not an engineering call.

---

## Appendix A — verification log

Everything below was executed on 2026-08-14. Total bulk data downloaded: **< 6 MB.**

| # | What | Method | Result |
| --- | --- | --- | --- |
| 1 | `arquivos.receitafederal.gov.br/dados/cnpj/...` | `curl -I` | **404** — commonly-cited URL is dead |
| 2 | Share root listing | WebDAV `PROPFIND Depth:1`, Basic `YggdBLfdninEJX9:` | `207`, folders `2023-05`…`2026-08` + `cnpj.tar.gz` (63.95 GB) |
| 3 | `2026-08` listing | `PROPFIND Depth:1` | 37 files, sizes + mtimes 2026-08-09 18:26–18:35 UTC |
| 4 | Range-request support | `curl -r` | **`206`** — resumable downloads confirmed |
| 5 | Uncompressed sizes, all Empresas + Estabelecimentos + sampled Socios/Simples/refs | ~700 B tail range-GET per file, ZIP central-directory parse | table in §1.3 |
| 6 | **ZIP64 in use** | `Estabelecimentos0.zip` CD | 32-bit field `0xFFFFFFFF`; ZIP64 extra → **7,007,687,931 B** |
| 7 | Empresas CSV layout + anchor row | 900 KB head range-GET, raw inflate | 7 cols; `00000000` = `BANCO DO BRASIL SA` |
| 8 | Estabelecimentos CSV layout | 900 KB head | 30 cols; fantasia 50.9%, email 15.3%, phone 34.9% |
| 9 | Socios CSV layout | 600 KB head | 11 cols; CPF masked `***623691**`; `FAIXA_ETARIA` present |
| 10 | Avg line length | exact byte/line count, 2 independent Empresas samples | 78.72 / 78.77 B; Estab 205.76 B; Socios 103.06 B |
| 11 | Encoding | byte scan, 901,070 B | **0 bytes > 0x7F** — pure ASCII, pre-folded |
| 12 | MEI CPF-in-name prevalence | regex over 22,887 rows (2 files) | **52.5% / 57.8%** trailing 11-digit CPF; 11.6% leading formatted CNPJ; 76% natureza 2135 |
| 13 | Name collision rate | normalize + count, 11,447 rows | 14 dup names / 30 rows (0.3%) — **lower bound**, see §4.4 |
| 14 | Prod DB size + settings | `pg_database_size`, `pg_settings` (read-only) | 1,853 MB; `shared_buffers` 128 MB; `maintenance_work_mem` 64 MB; `pg_trgm` **not installed** |
| 15 | `cy_directors` calibration | `pg_relation_size` (read-only) | 1,168,754 rows / 175 MB heap = **157 B/row** |
| 16 | BR capability traffic + revenue | `transactions ⋈ capabilities` (read-only) | §7.1 |
| 17 | Every input key, 120 d | `jsonb_object_keys` (read-only) | **only `cnpj`, 32 times** |
| 18 | Railway unit prices | `railway.com/pricing` | RAM `$0.00000386/GB/s` = **$10.00/GB-mo**; vCPU **$20.01/mo**; volume **$0.1555/GB-mo**; egress $0.05/GB |
| 19 | Licence | RF + gov.br pages | **only** site-footer CC BY-**ND** 3.0; no dataset-level licence found — §1.4 |
| 20 | Alphanumeric CNPJ | RF announcement + IN RFB 2.229/2024 coverage | live from July 2026; 14 positions, alphanumeric root + order, numeric DV |
| 21 | Official name→CNPJ API? | Serpro quick-start + gov.br Conecta catalogue | **None.** CNPJ is a path segment; Conecta is agency-only. Serpro pricing unverified — `loja.serpro.gov.br` timed out 3× |
| 22 | Vendor name-search support | primary API docs per vendor | 4 confirmed (§7.4); CNPJ.ws public API, CNPJá open API, OpenCNPJ, Speedio, Econodata v3, Consultar.IO, Infosimples all CNPJ-in only |
| 23 | Vendor redistribution terms | ToS pages | CNPJ.ws **prohibits resale** (quoted); Casa dos Dados silent; CNPJá unreachable (429 ×8); BigDataCorp marketing page only |
| 24 | `minha-receita` sizing + name search | project docs + `db/pagination.go` | **~180 GB** (140 GB tables + 10 GB idx + ~30 GB working); RAM/CPU/ingest-time **undocumented**; **no name search, by design**; full monthly reload; project moved to Codeberg |
| 25 | BR test-suite config | `test_suites WHERE capability_slug='brazilian-company-data'` (read-only) | 7 suites, **all `test_mode='live'`, `active`, `scheduled_testing_eligible=TRUE`**. 6 schedulable × hourly ≈ 60/day — **matches observed volume** |
| 26 | Scheduler eligibility filter | `apps/api/src/jobs/test-scheduler.ts:288,347` | `ts.scheduled_testing_eligible = TRUE`. **`external_cost_cents` is billing-only** (`schema.ts:571-577`) — CLAUDE.md's "dispatches capabilities where `external_cost_cents = 0`" is a stale paraphrase |
| 27 | Cost classification | `capabilities WHERE slug='brazilian-company-data'` (read-only) | **`cost_class='free_unlimited'`, `quota_window='none'`, `quota_cap=NULL`** — wrong for a ~3 req/min vendor; disarms the `guardedExecute` budget check. **The actual defect.** §7.1 |
| 28 | Eligibility is re-derived at boot | `startup-migrations.ts:564-600` (Block 0066) | `UPDATE test_suites SET scheduled_testing_eligible = (external_cost_cents = 0)` every boot, with a boot-failing post-condition. **A hand-edited eligibility flag is reverted on the next deploy.** §7.3 |
| 29 | Prior occurrence of the same failure | `guarded-executor.ts:1-31` | 2026-05-11: 95% of 60-day DE OpenRegister traffic came from the scheduler, exhausting a 50/mo free tier. Root cause recorded as conflating "no per-call cost" with "no quota" |

**Estimates, flagged.** Row counts (derived from verified bytes ÷ measured line length, ±5%);
active-company share ~24 M (±20%, scaled from RF's 2024 figure); all Postgres heap/index sizes
(anchored on measured `cy_directors` bytes/row); GIN trigram sizes (**wide band, no local
calibration**); artifact compression ratio in §2.4; effort estimates in §6.
