---
doc_type: decision-proposal
authority_scope: none
decision: DEC-20261023-A
date: 2026-10-23
status: proposed
---

# Proposal: replace the scraping doctrine with one risk-based data-access rule

Proposed decision **DEC-20261023-A**, drafted for Petter's review. It is not in
force. It becomes a decision only when Petter adopts it. The M2 decision
register is closed, so on adoption it is recorded the way DEC-20260910-A was,
in CLAUDE.md's Active Decisions, until the M4 cutover. Queue entry:
[DQ-35](../company/DECISION-QUEUE.md).

## Decision

The current doctrine stays authoritative until Petter adopts, amends or rejects
this proposal. That doctrine is DEC-20260428-A, with DEC-20260518-F and
DEC-20260813-A for per-call registry parsing, and DEC-20260427-H and
DEC-20260427-I for site bans. Adoption is Petter's decision alone, because it
sets legal risk for Moonlighter AB.

Replace the three-tier doctrine with one rule that classifies every way Strale
obtains data by the risk it carries, not by whether it is labelled "scraping".
There are three lanes.

### Never

1. **Gated access.** Access behind a login or paywall, or through fake or
   borrowed accounts.
2. **Getting around blocks.** Anti-bot circumvention: solving CAPTCHAs,
   rotating proxies or residential IPs to evade blocking, spoofing browser
   fingerprints, sending a blocked request to a real browser to get past a
   challenge, or retrying a blocked request through another route.
3. **Harvesting people data for resale.** Harvesting or reselling profiles,
   contact details or behavioural data about identifiable people: lead
   generation, enrichment, people search. This applies whether Strale collects
   the data or buys it from a vendor.
   - *Not covered:* screening with a lawful basis, such as sanctions, PEP
     (politically exposed person) and adverse-media checks for AML or KYB.
   - *Not covered:* officer and owner facts that registries publish by
     statute.
4. **Litigating platforms, accessed by Strale.** Platforms that forbid
   automated access and actively enforce it, accessed by Strale itself. These
   are listed in `apps/api/src/lib/tos-blocklist.ts`: today LinkedIn,
   Facebook, Instagram, X, Glassdoor, Trustpilot, Google Search and Google
   Patents. Reddit is added.
   - Data from these platforms bought from a vendor is also excluded, with
     two exceptions: the platform's own licensed API (a commercial decision),
     or search-engine data (result pages, autocomplete) from a SERP vendor
     (see the vendor lane).
5. **Commercial aggregators and credit-data sites.** Databases such as
   allabolag.se and northdata.com, whether by systematic extraction or by
   per-call reads. They hold an EU database right in what they compiled, and
   much of their value is personal data on officers.
6. **Reselling against vendor terms.** Reselling a vendor's data where its
   terms do not permit commercial resale, including free and non-commercial
   tiers. The vendor-terms audits of 2026-09-06 and 2026-09-10 apply, as does
   `PROHIBITED_UPSTREAM_HOSTS` in `apps/api/src/lib/vendor-terms.ts`.
7. **Media as content.** Copyrighted media (images, articles, video) resold as
   content rather than as facts about it.

### Allowed with checks

- **Customer-directed fetch of one public page.**
  - *What:* any capability that fetches a URL the customer supplies in the
    request. It fetches a single public, logged-out page once per call.
  - *Conditions:*
    - Strale sends an honest user agent on every fetch route.
    - It stops at an explicit block: HTTP 401/403/429, a challenge page, or
      robots.txt `Disallow` for the path.
    - It never retries a blocked request through another route.
    - The fetch-path blocklist stays in force.
  - *Deliberate relaxation:* there is no per-site terms check, because the
    customer chooses the page. The blocklist is the only terms gate here. This
    relaxes the "prohibited access" half of DEC-20260428-A's reversal
    condition for customer-named pages; the "evasive access" half is kept by
    the block rules.
  - **This is not how these tools work today** (see "On adoption").
- **Per-call reads of public sources Strale chooses.**
  - *What:* any capability that reads a public website, government portal or
    court register that Strale selected, one entity per call, on behalf of a
    request. This covers web-provider and Browserless reads.
  - *Conditions:*
    - The data is non-personal. *Exception:* personal data that a court or
      registry publishes by law, returned as published for that one request,
      never compiled into profiles.
    - The source's terms permit automated per-call access, verified and
      recorded in the manifest before launch. This keeps DEC-20260813-A's
      constraint (b) and widens its permission from statutory registries to
      any such public source.
    - Attribution and provenance are preserved, as DEC-20260813-A
      constraint (d) requires.
    - The same block-honouring and honest-identification rules apply.
    - No bulk crawling, pre-fetching or mirroring.
- **Vendor data, whatever the vendor's collection method.**
  - *What:* for example, search-result data from a SERP vendor.
  - *Conditions:*
    - The vendor's terms permit resale, verified and recorded.
    - The data is not in the never lane apart from the SERP carve-out.
    - The vendor's documented method involves no login or account use.
    - The vendor is not a defendant over circumvention for that data.
    - Strale records the vendor and acquisition method for every answer.
  - *What this drops:* DEC-20260428-A Tier 2 also required the vendor to
    warrant lawful collection, to indemnify Strale against upstream contract
    claims, and to give a primary-source reference for each fact. This
    proposal drops those three conditions **deliberately**. Commodity vendors
    such as Serper offer no indemnity, and the requirement was already not met
    by the tools that earn most. The residual risk is a claim reaching Strale
    as a customer of a circumventing vendor, as Reddit's claim reached
    Perplexity. The vendor-not-a-defendant check and the never-lane
    circumvention ban limit that risk; they do not remove it.

### Preferred

Official APIs, licensed data and statutory registries, whenever available at
compatible cost. This keeps DEC-20260428-A Tier 3 as a preference, not a gate.

### Recording the lane

Every capability's manifest records which lane it uses. A new source in the
"allowed with checks" lane needs a one-paragraph note in the manifest or PR:
- what is fetched;
- why it is public and non-personal;
- whose terms were checked;
- how blocks are honoured.

## Context

Strale's no-scraping posture began on 2026-04-20/21 as a product promise for
Payee Assurance, later Counterparty Assurance.
- DEC-20260420-I (record key
  `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef`; the id is shared
  with an unrelated row) quotes the doctrine it operationalised: direct data
  connections only, no scraping, full ToS compliance with every provider.
- DEC-20260421-C (record key
  `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711`; the id is shared
  with an unrelated row) made a "No scraping" landing-page line a v1 launch
  blocker.
- DEC-20260427-H and DEC-20260427-I recorded per-site bans with their reasons
  (each site's terms forbid automated access, or an aggregator's content was
  being taken).
- DEC-20260428-A recast this as three tiers.
- DEC-20260518-F and DEC-20260813-A permitted per-call parsing of statutory
  registries under four constraints.

The ban on social platforms is attributed in later records to DEC-20260420-H.
Neither of the two exported rows carrying that id states it. The Google ban is
attributed to DEC-20260427-H-4.

Counterparty Assurance was retired as the primary product by DEC-20260812-A in
August 2026. The doctrine written for it stayed in force.

The doctrine as written no longer matches the catalogue:

- **Vendor-collected Google results.** The tools behind about €138 of the last
  90 days' revenue resell Google results collected by a vendor (Serper.dev):
  `google-search`, `serp-analyze` and `brand-mention-search`. Google results
  are not statutory public records, so Tier 2 does not permit them as written.
  The vendor offers no indemnity, and Serper's resale terms are not on record.
- **Strale-operated fetches, routed around blocks.** `screenshot-url`,
  `web-extract`, `url-to-markdown` and `seo-audit` are Strale-operated
  headless-browser or HTTP fetches, which Tier 1 calls absolute never.
  - `apps/api/src/capabilities/lib/web-provider.ts` treats 400/403/429 as
    routine bot-gating. It falls through to Jina Reader and then Browserless,
    and sends challenge pages to a real browser.
  - That is retrying around a block, the behaviour the courts and this
    proposal treat as the real risk.
  - No fetch path honours robots.txt `Disallow`.
  - `tech-stack-detect` sends a spoofed desktop Chrome user agent, and the
    Jina and Browserless routes do not identify as Strale.
  - About twenty other capabilities fetch customer-supplied URLs through the
    same paths. Some read sources Strale chose through Browserless, such as
    enforcementtracker.com, maersk.com and PriceRunner search.
- **Live tools with personal data.** `social-profile-check` (live, €0.05)
  probes user profiles on TikTok, Reddit, YouTube, Pinterest, GitHub, npm and
  PyPI. The compliance screening tools (`sanctions-check`, `pep-check`,
  `adverse-media-check`) process personal data bought from Dilisense, under a
  lawful AML/KYB purpose.
- **Sources switched off by wording, not risk.** The strict reading switched
  off public sources with no known terms problem, such as
  `eu-court-case-search` (CURIA and HUDOC). That happened on 2026-04-28,
  before DEC-20260518-F and DEC-20260813-A existed.

On 2026-10-23 Petter asked whether the rules are too strict compared with
other players. A web research pass on the October 2026 legal landscape (law
firm and trade-press write-ups, not primary filings; not legal advice; several
rulings not final) found:

- **Logged-out reading of public facts is low risk in the US.**
  - Meta v. Bright Data (2024, contract).
  - hiQ v. LinkedIn (CFAA).
  - Google v. SerpApi (July 2026): DMCA claims on ordinary results were
    dismissed; Google has refiled narrower claims, which are pending.
- **Getting around anti-bot measures is a live risk.** In Reddit v. SerpApi /
  Perplexity (S.D.N.Y., July 2026), the circumvention and conspiracy claims
  survived, including against Perplexity as a customer.
- **Logins and fake accounts are costly.** hiQ paid a $500k judgment, and
  Proxycurl shut down after LinkedIn sued in 2025.
- **In the EU the main exposure is personal data.**
  - The Dutch AP's 2024 scraping guidance.
  - CNIL's €240k fine against KASPR (December 2024) for reselling contact data
    taken from LinkedIn.
  - The Clearview fines.
  - The EU sui generis database right (CV-Online Latvia v Melons, 2021).
- **Competitors who list social data push the risk onto customers by
  contract.** Delegate's and Bright Data's terms make the customer indemnify
  them and cap their own liability at fees.

## Rationale

The risk that matters comes from *how* data is accessed and *what* it is, not
from the word "scraping". A single honest fetch of a public, non-personal page
that a customer names carries far less risk than buying a vendor's LinkedIn
profile feed. Yet the current doctrine forbids the first in its text, while
the catalogue does both kinds of thing inconsistently.

A rule built on the actual risk factors does four things:
- It matches where courts and regulators have drawn lines: gates,
  circumvention, personal data, database rights and contract.
- It turns the gap between text and catalogue into concrete work. The fetch
  path must stop routing around blocks; provenance and lanes must be recorded.
  The earning tools keep running, now on a stated footing.
- It reopens public, non-personal sources that were closed only because of
  wording.
- It keeps every protection that addresses a real exposure: personal-data
  harvesting, the litigating platforms, commercial aggregators and vendor
  terms. It also keeps the terms check for sources Strale chooses.

It drops two things knowingly:
- **Tier 2's vendor indemnity, warranty and per-fact provenance conditions.**
  The reasons are under the vendor lane above.
- **The public "no scraping" promise.** It belonged to a retired product and
  was never true across the catalogue.

DEC-20260428-A's reversal condition asks that any relaxation keep a verifiable
sourcing chain and the prohibition on prohibited or evasive access.
- **Sourcing chain:** kept, by requiring the vendor and acquisition method on
  every answer. Making that true is adoption work.
- **Evasive access:** kept, through never item 2 and the block rules.
- **Prohibited access:** relaxed deliberately, and only for pages a customer
  names, where the blocklist is the gate.

## Consequences

### Tools that become permissible

Each needs an executor review against the lanes before it goes live.

| Tool | Blocked today because | Under this rule |
|---|---|---|
| `product-search` | Strale-operated Google Shopping scrape (blocklisted) | Allowed via a SERP vendor whose terms permit resale. Direct Google access stays blocked. |
| `keyword-suggest` | Calls an undocumented Google endpoint directly | Allowed via a SERP vendor's autocomplete data with resale rights (never item 4 carve-out). Direct Google access stays blocked. |
| `eu-court-case-search` | Tier 1 categorical (2026-04-28, before DEC-20260518-F and DEC-20260813-A) | Allowed under the per-call lane, including the carve-out for personal data courts publish, once CURIA's and HUDOC's terms are recorded as permitting per-call access. |
| Government-portal readers (pattern) | Tier 1 categorical | Allowed per call for public, non-personal company facts where no API exists and the portal's terms allow it. Each needs its manifest note. |

### Tools already permitted today (migration or terms work, not a doctrine change)

| Tool | Route |
|---|---|
| `patent-search` | EPO OPS or USPTO. Google Patents stays blocked. |
| `salary-benchmark` | Rebuild on Eurostat and US BLS statistics. Adzuna is not available: `vendor-terms.ts` prohibits it. Glassdoor stays blocked. |
| `australian-company-data` | Redundant: `au-company-data` covers it by API. Leave off. |

### Tools that stay off

| Tool | Why it stays off |
|---|---|
| `linkedin-url-validate` | LinkedIn: forbids automated access and actively enforces it |
| `trustpilot-score` | Trustpilot: terms forbid automated access; reviewer personal data; the licensed API is the route |
| `employer-review-summary` | Glassdoor: terms, anti-bot measures, reviewer personal data |
| `annual-report-extract`, `credit-report-summary` | allabolag.se: a commercial aggregator (never item 5). Routes: Bolagsverket's paid annual-report ordering, or a credit-bureau licence |
| `business-license-check-se` | allabolag.se. Routes: a Skatteverket public API if one ships, or an aggregator licence |
| `github-user-profile` | Personal data resale (never item 3) |
| `amazon-price` | Anti-bot (CAPTCHA) and terms; needs a licensed product-data API |
| `ip-geolocation`, `ip-risk-score`, `crypto-price`, `flight-status`, `host-exposure-lookup`, the `token-security-check` family, `docker-hub-info` | Vendor terms forbid commercial resale on the tier used; only a paid licence changes this |
| Any content from blocklisted social platforms (X, Instagram, Facebook, Reddit) | Never item 4. Licensed APIs (X pay-per-use, Reddit commercial) are a separate commercial decision |

### Live tools that need a decision on adoption

| Tool | Issue |
|---|---|
| `social-profile-check` | Probes personal profiles on TikTok, Reddit, YouTube, Pinterest, GitHub, npm and PyPI, and is live and paid. Under never item 3 it should be deactivated or reduced to package registries (npm, PyPI). Blocklisting Reddit without changing it would make it silently report "does not exist", because `checkPlatform` turns a blocklist refusal into `exists: false`. |
| `google-search`, `serp-analyze`, `brand-mention-search`, adverse-media fallback | Allowed under the SERP carve-out **only once** Serper's terms are confirmed to permit resale and recorded in `vendor-terms.ts`. If they do not, these need a vendor that does. |
| Every capability that fetches a customer-supplied URL. Includes `url-to-markdown`, `web-extract`, `screenshot-url`, `seo-audit`, `tech-stack-detect`, `company-enrich`, `cookie-scan`, `domain-contact-extract`, `html-to-pdf`, `landing-page-roast`, `page-speed-test`, `privacy-policy-analyze`, `product-reviews-extract`, `terms-of-service-extract`, `accessibility-audit`, `structured-scrape`, `pricing-page-extract`, `return-policy-extract`, `competitor-compare`, `company-tech-stack` | Allowed only once the whole web-provider and Browserless path stops at a block (no Jina or Browserless fallthrough after 403/429 or a challenge page), honours robots.txt `Disallow`, and sends an honest user agent. Jina Reader's terms must be checked, because it sits on that path on a free tier. `domain-contact-extract` must also be checked against never item 3. |
| Capabilities that read a source Strale chose through Browserless or web-provider: `gdpr-fine-lookup` (enforcementtracker.com), `container-track` (maersk.com), `eu-trademark-search`, `japanese-company-data`, `customs-duty-lookup`, `price-compare` (PriceRunner search) | Each needs its source's terms recorded as permitting per-call access, and a check against never item 5 for aggregators (enforcementtracker.com and PriceRunner may be). |
| `youtube-summarize`, and the TikTok and YouTube probes in `social-profile-check` | YouTube and TikTok are not on the blocklist, and their terms restrict automated access outside their APIs. Rule per platform: the official API, or off. |

### On adoption

1. DEC-20261023-A becomes active and supersedes these records, named by record
   key so the unrelated rows sharing two of the ids are untouched:
   - `DEC-20260428-A`
   - `DEC-20260518-F`
   - `DEC-20260813-A`
   - `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711`
   - `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef`

   It interprets DEC-20260427-H and DEC-20260427-I: their site bans stay, now
   under never items 4 and 5.
2. Rewrite the CLAUDE.md doctrine bullets and the AGENTS.md summary.
3. Change the whole fetch path (`web-provider.ts`, the Browserless and Jina
   routes, and direct fetches) to stop at blocks, honour robots.txt
   `Disallow`, and send an honest user agent. This includes removing the
   spoofed user agent in `tech-stack-detect`.
4. Add `acquisition_method` and the lane to every answer's provenance and to
   manifests. Today SERP tools return only a source name and timestamp, and
   `data_source_type` does not record the lane.
5. Check Serper's and Jina's terms and record them.
6. Decide `social-profile-check`, then add Reddit to `tos-blocklist.ts`.
7. Update every code and doc citation of the superseded ids. These include
   the DEACTIVATED notes, the `tos-blocklist.ts` header, `vendor-terms.ts`,
   and the executors and jobs that cite DEC-20260813-A or DEC-20260518-F.
   Also replace the project memory note on the three-tier doctrine.

**Recommended before adoption:** a short review of the EU personal-data and
database-right points by a Swedish or EU technology lawyer. This is a spend
decision for Petter.

## Reversal conditions

- **A ruling against logged-out access.** Tighten the allowed lanes if a final
  appellate ruling, or an EU or Swedish authority, holds that logged-out,
  non-circumventing access to public, non-personal pages is unlawful as such.
  Likely triggers: the Google v. SerpApi or Reddit v. SerpApi appeals, or an
  IMY or EDPB statement.
- **Trouble with a vendor.** Revisit the vendor lane, including the dropped
  indemnity condition, if a vendor Strale relies on becomes a defendant over
  how it collects data, or if a claim reaches Strale as a customer of a
  vendor.
- **A site owner's demand.** Move a host to the never lane on any
  cease-and-desist or complaint from a site owner, and honour it immediately.
- **A contract requirement.** Restore a stricter posture for a product line if
  a customer or partner contract requires a no-scraping warranty.

## Evidence

- **Current doctrine:**
  [DEC-20260428-A](../decisions/records/DEC-20260428-A.md),
  [DEC-20260518-F](../decisions/records/DEC-20260518-F.md),
  [DEC-20260813-A](../decisions/records/DEC-20260813-A.md),
  [DEC-20260427-H](../decisions/records/DEC-20260427-H.md),
  [DEC-20260420-I](../decisions/records/DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md),
  [DEC-20260421-C](../decisions/records/DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md).
- **Code:**
  - Deactivation reasons per tool: the `DEACTIVATED` map in
    `apps/api/src/capabilities/auto-register.ts`.
  - Fetch-path blocklist: `apps/api/src/lib/tos-blocklist.ts`.
  - Vendor-terms list: `apps/api/src/lib/vendor-terms.ts`.
  - Fetch fallthrough: `apps/api/src/capabilities/lib/web-provider.ts`.
  - Profile probes: `apps/api/src/capabilities/social-profile-check.ts`.
- **Vendor-terms audits:**
  [2026-09-06](../security/2026-09-06-vendor-terms-audit.md) and
  [2026-09-10](../security/2026-09-10-vendor-terms-audit-batch-2.md).
- **Revenue figures:** production `transactions`, last 90 days to 2026-10-23,
  external customers only, read through the read-only role.
- **Review:** an independent same-provider review in a separate context
  checked this proposal against the code on 2026-10-23. Its findings are
  reflected in this version.
