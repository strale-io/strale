/**
 * Upstream hosts whose terms forbid how Strale would use them.
 *
 * Strale resells lookups. "Free and keyless" answers whether Strale can call
 * an upstream, not whether it may sell what comes back, and a commercial
 * vendor's free tier is usually the tier that excludes exactly this. Two
 * vendor-terms audits found fifteen capabilities on the wrong side of that
 * line, some live and paid for months:
 *   docs/security/2026-09-06-vendor-terms-audit.md
 *   docs/security/2026-09-10-vendor-terms-audit-batch-2.md
 *
 * vendor-terms.test.ts holds the source tree to this list: a live code path
 * may not reach any of these hosts. An executor that does must be in
 * auto-register's DEACTIVATED map, and a shared client must refuse the call
 * behind a licence gate. Removing a host from this list is a licence
 * decision — record the plan or permission that changed the answer.
 *
 * When the M3 vendor-state model lands `config/vendors.yaml` with its terms /
 * redistribution verification record (docs/strategy/2026-09-10-m3-vendor-state-model.md,
 * gap G4, batch 3), derive this list from that file's verdicts instead of
 * keeping both — two lists for one fact is how the drift in these audits began.
 */
export const PROHIBITED_UPSTREAM_HOSTS: ReadonlyMap<string, string> = new Map([
  // 2026-09-06
  ["suggestqueries.google.com", "Google — direct Google access is never lane item 4 under DEC-20261023-A (formerly an absolute prohibited target under DEC-20260813-A)"],
  ["api.coingecko.com", "CoinGecko free Demo plan excludes commercial use"],
  ["ip-api.com", "ip-api.com free endpoint is non-commercial only"],
  ["internetdb.shodan.io", "Shodan InternetDB is licensed for non-commercial use only"],
  ["api.etherscan.io", "Etherscan API content is for personal, non-commercial use; resale for commercial purposes prohibited"],
  // 2026-09-10
  ["api.gopluslabs.io", "GoPlus bars commercial use of its data without explicit written permission"],
  ["api.aviationstack.com", "AviationStack free plan is personal, non-commercial use"],
  ["api.adzuna.com", "Adzuna permits publishing listings with branding; other commercial use is a 14-day trial"],
  ["hub.docker.com", "Docker bars replicating content for an unauthorized commercial service"],
  ["ethereum-rpc.publicnode.com", "PublicNode bars selling or re-using Service Content commercially"],
  ["rpc.ankr.com", "Ankr bars commercial exploitation of the Service without written consent"],
  ["eth.llamarpc.com", "terms unreadable and the endpoint answered HTTP 525 when checked"],
  ["cloudflare-eth.com", "Cloudflare's anonymous Ethereum gateway is discontinued"],
  // 2026-10-24 (DEC-20261023-A; see VENDOR_TERMS_RECORDS below). Listed for the
  // rule's never lane item 2 (getting around blocks) as much as for its terms,
  // which are unrecorded: this list also holds hosts barred for HOW they fetch.
  ["r.jina.ai", "Jina Reader retries a blocked fetch through its own proxy pool by default and was used on an anonymous tier whose commercial terms were never recorded"],
]);

/** Every prohibited host named in `text` as a URL (scheme://host). */
export function prohibitedHostsIn(text: string): string[] {
  const found: string[] = [];
  for (const host of PROHIBITED_UPSTREAM_HOSTS.keys()) {
    const re = new RegExp(`\\bhttps?://${host.replace(/\./g, "\\.")}(?=[/:?"'\`\\s]|$)`, "i");
    if (re.test(text)) found.push(host);
  }
  return found;
}

/**
 * What a vendor's terms say about Strale reselling its data, as read, with the
 * evidence (DEC-20261023-A: vendor data is allowed only when "the vendor's
 * terms permit resale, verified and recorded").
 *
 * `resale` is what the terms SAY, not what Strale would like: "unverified"
 * means nobody has read a current copy that settles it. Being unverified does
 * not by itself put a vendor on `PROHIBITED_UPSTREAM_HOSTS` (Jina is there
 * for how it fetches, see above); a vendor still in use with unverified terms
 * is an open decision, and the entry names where that decision is queued.
 *
 * `vendor-terms.test.ts` holds `capabilities` to the source tree: every
 * executor that calls one of `hosts` must be listed, so the record cannot
 * silently understate who depends on a vendor.
 */
export interface VendorTermsRecord {
  vendor: string;
  hosts: readonly string[];
  /** Restrict a host-wide record to these service URL prefixes, if set. */
  url_prefixes?: readonly string[];
  /** Vendor id passed to meteredVendorFetch, when calls go through it. */
  metered_id?: string;
  /** Executors that call one of `hosts`. */
  capabilities: readonly string[];
  resale: "permitted" | "prohibited" | "unverified";
  terms_url: string;
  /** ISO date the terms were read (or the read was attempted). */
  accessed: string;
  /** How the text was obtained, and its limits. */
  how_read: string;
  findings: readonly string[];
  /** Where the open question or the decision lives. */
  decision_ref: string;
}

export const VENDOR_TERMS_RECORDS: readonly VendorTermsRecord[] = [
  {
    vendor: "NTA Corporate Number Web-API",
    hosts: ["api.houjin-bangou.nta.go.jp"],
    capabilities: ["japanese-company-data"],
    resale: "permitted",
    terms_url: "https://www.houjin-bangou.nta.go.jp/webapi/riyokiyaku.html",
    accessed: "2026-10-27",
    how_read: "Fetched the official API terms, Article 7's linked content terms at /riyokiyaku/, and their incorporated Digital Agency Public Data License 1.0. Read the v4 specification revision 1.2, overview and April 2022 published samples. No authenticated request made.",
    findings: [
      "Article 7 incorporates https://www.houjin-bangou.nta.go.jp/riyokiyaku/, which adopts https://www.digital.go.jp/resources/open_data/public_data_license_v1.0. PDL1.0 section 1 permits redistribution: 「複製、公衆送信、翻訳・変形等の翻案等、自由に利用できます」 and 「商用利用も可能です。」. Preserve source attribution and identify processing by Strale; third-party rights and logos are excluded.",
      "Article 6 verbatim: 「このサービスは、国税庁法人番号システムWeb-API 機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない」. The overview at https://www.houjin-bangou.nta.go.jp/webapi/ instead says 「このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない」. Response attribution emits the Article 6 text plus the content-licence source and Strale processing credit.",
      "Article 8(3) permits restrictions on concentrated traffic; Article 9(1)(3) prohibits 「短時間における大量アクセスその他本機能の運用に支障を与えること」. No numeric requests-per-time quota is published in these terms. API overview limits number lookup to 10 numbers and differences to 50 days; overview specification splits responses above 2,000 records. This executor performs one request per lookup, never retries or bulk crawls; HTTP 403/429 stop. HTTP 404 means an invalid/unregistered app ID, not company-not-found. Article 9 prohibits disclosure/lending of the ID.",
    ],
    decision_ref: "DEC-20261023-A; portfolio plan 1.13; orchestrator instruction 2026-10-27",
  },
  {
    vendor: "Eurostat",
    hosts: ["ec.europa.eu"],
    url_prefixes: ["https://ec.europa.eu/eurostat/"],
    capabilities: ["eurostat-data"],
    resale: "permitted",
    terms_url: "https://ec.europa.eu/eurostat/help/copyright-notice",
    accessed: "2026-10-26",
    how_read: "Official copyright notice fetched via web open, including General principles and Exceptions; candidate list checked on the EU enlargement page.",
    findings: [
      "Commission Decision 2011/833/EU authorises commercial reuse with source acknowledgement, subject to individual notices and these exceptions; this record covers only the restricted eurostat-data executor.",
      "(a) Data identified as belonging to sources other than Eurostat and third-party copyrighted material are excluded: refuse non-Eurostat source declarations and unrecognised rights notices in returned JSON-stat source/extension/annotations. SOURCE_INSTITUTIONS and other explicit source anchors are checked; DISSEMINATION_SOURCE_DATASET annotations identify lineage, not ownership. Separately linked ESMS documents and catalogue notices are not inspected; missing declarations are reported as an output limitation. No third-party documents are returned.",
      "(b) Data for countries outside EU/EFTA/official acceding and candidate countries are excluded. Round 5 uses EUROSTAT_ALLOWED_DATASETS: a curated Eurostat-sourced dataset list audited against live JSON-stat metadata on 2026-10-26 (recorded in __fixtures__/eurostat/dataset-audit-2026-10-26.json). The sole geographic dimension must be geo; partner/citizen/birth/residence/load/unload/origin/destination/control/counterpart/vessel-nationality tables are excluded. The audit conservatively rejects every non-geo/time code matching ISO alpha-2 or a country-prefix NUTS shape, including non-geographic collisions; this necessarily narrows coverage of requested families. There is no runtime country-content detection outside geo. Require geo and accept only exact EU/EFTA/official candidate countries, their NUTS regions (country prefix plus 1–3 letters/digits), and supported EU/EFTA/euro-area aggregates. Potential candidate Kosovo is excluded. Retain post-fetch geo dropping/counting and label-aware defence in depth only for geo. Omit excluded labels. Other datasets return dataset_not_supported with the supported list and instructions to request an addition through Strale support; additions require metadata and terms review. This implements the country restriction without trying to infer geographic meaning in arbitrary codelists.",
      "(c) Liechtenstein and Switzerland declaring-country trade data from 1995 under HS, SITC, BEC, NSTR and national classifications are excluded. Austria declaring-country CN8 trade data are also excluded: the curated list excludes international trade; retain defence-in-depth refusal through the executor's dataset-prefix, title/theme/category and trade-lineage rules. Domestic retail trade, wholesale trade, distributive trade and trade sector phrases are exempt; international/foreign/extra-EU/intra-EU trade remains refused. A stk_flow dimension also triggers refusal (including nrg_stk_gas). Source-key rules inspect dataset metadata, not data.dimension ids/categories such as owner.",
      "Logos and trademarks are excluded; the executor returns statistical codes, labels and observations only, with no logos or publications. Modifications must be declared with a non-responsibility disclaimer: every output includes the dataset DOI (10.2908/CODE), access date, acknowledges Eurostat and the Commission Decision and states Strale flattened the data and Eurostat is not responsible for the rendering.",
    ],
    decision_ref: "DEC-20261023-A; orchestrator approval 2026-10-26 scoped to commercial-permitted Eurostat data",
  },
  {
    vendor: "Brønnøysundregistrene",
    hosts: ["data.brreg.no"],
    capabilities: ["norwegian-company-data", "no-bankruptcy-check", "vat-validate"],
    resale: "permitted",
    terms_url: "https://www.brreg.no/en/use-of-data-from-the-bronnoysund-register-centre/datasets-and-api/",
    accessed: "2026-10-26",
    how_read: "Official datasets/API terms read via web open; API documentation links NLOD.",
    findings: ["NLOD permits commercial reuse with attribution; anonymous per-entity API calls need no registration. Both executors call the shared lib/brreg-fetch.ts helper."],
    decision_ref: "DEC-20261023-A (existing official registry API; status correction)",
  },
  {
    vendor: "KRS (Ministry of Justice Poland)",
    hosts: ["api-krs.ms.gov.pl"],
    capabilities: ["polish-company-data"],
    resale: "permitted",
    terms_url: "https://prs.ms.gov.pl/krs/openApi",
    accessed: "2026-10-26",
    how_read: "Official reuse page and prs.ms.gov.pl/krs/openApi read; extracted the latter from its served JavaScript because the HTML is an app shell. Also read the linked 2021 open-data act at eli.gov.pl/api/acts/DU/2021/1641/text.html.",
    findings: ["Statutory basis: official API page authorises anyone to download full/current semantic JSON under KRS Act art. 4b(2) and Open Data Act art. 24(1). Open Data Act allows commercial reuse; preserve attribution and privacy restrictions. The KRS extract contains personal data which this executor does not return. No per-call automation or resale prohibition in these published terms."],
    decision_ref: "DEC-20261023-A (existing official registry API; status correction)",
  },
  {
    vendor: "ARES (Czech Ministry of Finance)",
    hosts: ["ares.gov.cz"],
    capabilities: ["cz-company-data"],
    resale: "unverified",
    terms_url: "https://mf.gov.cz/cs/ministerstvo/informacni-systemy/ares",
    accessed: "2026-10-26",
    how_read: "Official operating conditions read via web open, including API usage limits and third-party portal attribution.",
    findings: ["Public API available to everyone subject to operating conditions: at most 500 requests/minute, no excessive parallel requests, repeated identical/invalid queries or evasion. Informational data only; preserve ARES source attribution. The page declares no reuse licence or resale grant. Regulation (EU) 2023/138 includes company registers among high-value datasets with reuse requirements; this is context pending assessment of applicability, not an established legal basis for this API."],
    decision_ref: "docs/company/DECISION-QUEUE.md DQ-40",
  },
  {
    vendor: "PRH (Finnish Patent and Registration Office)",
    hosts: ["avoindata.prh.fi"],
    capabilities: ["finnish-company-data"],
    resale: "permitted",
    terms_url: "https://avoindata.prh.fi/opendata-ytj-api/v3/schema?lang=en",
    accessed: "2026-10-26",
    how_read: "Official open-data page read via web open and v3/schema?lang=en fetched directly.",
    findings: ["API schema info.license licenses data CC BY 4.0 (commercial reuse permitted). Attribute PRH; do not use PRH/YTJ logos or imitate PRH services."],
    decision_ref: "DEC-20261023-A (existing official registry API; status correction)",
  },
  {
    vendor: "GEMI Open Data",
    hosts: ["opendata-api.businessportal.gr"],
    capabilities: ["greek-company-data"],
    resale: "permitted",
    terms_url: "https://opendata.businessportal.gr/license/",
    accessed: "2026-10-26",
    how_read: "Official API terms page read via web open; no authenticated company lookup attempted.",
    findings: ["API and open data licensed ODC-BY-1.0, permitting commercial reuse with attribution. Existing API-key access remains required."],
    decision_ref: "DEC-20261023-A (existing official registry API; status correction)",
  },
  {
    vendor: "GLEIF",
    hosts: ["api.gleif.org"],
    capabilities: ["lei-lookup", "entity-resolve", "gleif-l2-ubo-lookup", "gleif-l2-children-lookup"],
    resale: "permitted",
    terms_url: "https://www.gleif.org/en/meta/lei-data-terms-of-use",
    accessed: "2026-10-26",
    how_read: "Read the actual GLEIF terms page through the web tool on 2026-10-26.",
    findings: [
      "Section II permits individual lookups through the Access Service, free of charge; data are licensed CC0 1.0.",
      "Commercial reuse is permitted. No circumvention or claims of GLEIF endorsement; availability and accuracy are not guaranteed.",
    ],
    decision_ref: "DEC-20261023-A",
  },
  {
    vendor: "Serper.dev",
    hosts: ["google.serper.dev"],
    metered_id: "serper",
    capabilities: [
      "adverse-media-check",
      "backlink-check",
      "brand-mention-search",
      "google-news-search",
      "google-search",
      "keyword-rank-check",
      "serp-analyze",
      "serp-related-questions",
    ],
    resale: "unverified",
    terms_url: "https://serper.dev/terms",
    accessed: "2026-10-24",
    how_read:
      "serper.dev was unreachable from the 2026-10-24 session (environment network policy). Read instead: a " +
      "web-search tool's summary of, and excerpts from, a cached copy about 878 days old per that tool. The " +
      "quotations below are the tool's excerpts, not verified word-for-word against the page, and an ellipsis may " +
      "hide qualifying words.",
    findings: [
      "Licence is a B2B use licence ('Permission is granted to download the materials … for as long as your use case " +
        "requires'), not a transfer of title; no clause grants resale or sublicensing of results.",
      "Prohibits 'Mirror the materials on any other server as-is with no-value-added' — close to returning raw results.",
      "States 'Serper provides web-scraped data collected from public domain sources' and no affiliation with Google.",
      "Termination at any time, with or without cause.",
    ],
    decision_ref: "docs/company/DECISION-QUEUE.md DQ-39",
  },
  {
    vendor: "Jina AI (Reader)",
    hosts: ["r.jina.ai"],
    capabilities: [],
    resale: "unverified",
    terms_url: "https://jina.ai/legal/",
    accessed: "2026-10-24",
    how_read:
      "jina.ai was unreachable from the 2026-10-24 session. Read instead: the reader's open-source code " +
      "(github.com/jina-ai/reader, src/api/crawler.ts, src/dto/crawler-options.ts) and search summaries of jina.ai pages.",
    findings: [
      "Jina's sales FAQ (per search summary) says hosted-API commercial use is covered by its service terms for " +
        "signed-up, paying users; Strale called it keyless, on the anonymous tier, whose terms were never recorded.",
      "The hosted reader retries a non-200 fetch through its own rotating proxy pool unless X-Proxy: none is sent, " +
        "and does not report the target's status — DEC-20261023-A never lane item 2.",
      "Removed from every fetch path on 2026-10-24 (PR #723); listed in PROHIBITED_UPSTREAM_HOSTS so it cannot return.",
    ],
    decision_ref: "DEC-20261023-A (removed; no open decision)",
  },
  {
    vendor: "Have I Been Pwned",
    hosts: ["haveibeenpwned.com"],
    capabilities: ["breach-exposure-check"],
    resale: "permitted",
    terms_url: "https://haveibeenpwned.com/API/v3",
    accessed: "2026-09-06",
    how_read:
      "Read in the 2026-09-06 vendor-terms audit (docs/security/2026-09-06-vendor-terms-audit.md), which quotes the " +
      "licence; not re-read on 2026-10-24 (the session's network policy blocked the site).",
    findings: [
      "The public API is licensed CC BY 4.0, and its author says charging for it as part of a broader offering is fine.",
      "Condition: 'clear and visible attribution with a link to haveibeenpwned.com ... anywhere data from the service is " +
        "used'. The provenance carries source_url and licence since 2026-09-06.",
    ],
    decision_ref: "docs/security/2026-09-06-vendor-terms-audit.md",
  },
  {
    vendor: "Alternative.me",
    hosts: ["api.alternative.me"],
    capabilities: ["fear-greed-index"],
    resale: "permitted",
    terms_url: "https://alternative.me/crypto/fear-and-greed-index/",
    accessed: "2026-09-10",
    how_read:
      "Read in the 2026-09-10 vendor-terms audit (docs/security/2026-09-10-vendor-terms-audit-batch-2.md), which quotes " +
      "the clause; not re-read on 2026-10-24 (the session's network policy blocked the site).",
    findings: [
      "'Commercial use is allowed as long as the attribution is given right next to the display of the data.' The " +
        "output carries the attribution beside the values.",
    ],
    decision_ref: "docs/security/2026-09-10-vendor-terms-audit-batch-2.md",
  },
];
