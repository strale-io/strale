---
doc_type: decision-proposal
authority_scope: none
decision: DEC-20261023-A
date: 2026-10-23
status: proposed
---

# Proposal: replace the scraping doctrine with one risk-based data-access rule

Proposed decision **DEC-20261023-A**, drafted for Petter's review. It is not in
force. It becomes a formal decision record only when Petter adopts it; the M2
decision register is closed, so on adoption it is recorded the way
DEC-20260910-A was, in CLAUDE.md's Active Decisions, until the M4 cutover.
Queue entry: [DQ-35](../company/DECISION-QUEUE.md).

## Decision

The three-tier doctrine (DEC-20260428-A, as interpreted by DEC-20260813-A)
and CLAUDE.md remain authoritative until Petter adopts, amends or rejects this
proposal. Adoption is his decision alone, because it sets legal risk for
Moonlighter AB.

Replace the three-tier scraping doctrine with one rule that classifies every
way Strale obtains data by the risk it actually carries, not by whether it is
labelled "scraping". The rule has three lanes.

**Never (absolute, regardless of who performs the access):**

1. Access behind a login, a paywall, or through fake or borrowed accounts.
2. Getting around anti-bot measures: CAPTCHA solving, rotating proxies or
   residential IPs to evade blocking, browser fingerprint spoofing, or
   ignoring an explicit block.
3. Profiles, contact details or behavioural data about identifiable people
   (EU GDPR exposure), whether collected by Strale or bought from a vendor.
   Facts that registries publish about company officers by statute remain
   allowed under the preferred lane.
4. Platforms that run active anti-scraping litigation programmes, as listed
   in `apps/api/src/lib/tos-blocklist.ts` (today LinkedIn, Meta's Facebook
   and Instagram, X, Glassdoor, Trustpilot, Google Search and Google Patents).
   Reddit is added. Licensed APIs from these platforms are allowed and are a
   commercial decision.
5. Systematic extraction of a substantial part of a commercial database
   (the EU sui generis database right): for example rebuilding allabolag.se
   or northdata.com page by page.
6. Reselling a vendor's data where its terms do not permit commercial resale:
   free or non-commercial tiers included (the 2026-09-06 and 2026-09-10
   vendor-terms audits).
7. Copyrighted media (images, articles, video) resold as content rather than
   as facts about it.

**Allowed with checks:**

- *Customer-directed fetch.* Fetching a single public, logged-out page per
  call at the customer's direction (the URL is supplied in the request).
  Strale identifies itself honestly, honours an explicit block (HTTP 403,
  rate limits, robots.txt `Disallow` for the path), never retries around
  one, and keeps the fetch-path blocklist in force. This is how
  `url-to-markdown`, `web-extract`, `screenshot-url`, `seo-audit` and similar
  tools already work.
- *Per-call reading of public sources Strale chooses.* Reading public,
  non-personal facts from a public website, government portal or court
  register one entity at a time on behalf of a request. The same honesty and
  block rules apply. Bulk crawling stays out: no pre-fetching or building a
  mirror. This widens DEC-20260813-A's per-call permission from statutory
  registries to any public, non-personal source not caught by the "never"
  lane.
- *Vendor-sourced data whatever the vendor's collection method.* For example
  search-result data from a SERP vendor. Allowed when the vendor's terms
  permit resale, the data is not in the "never" lane, and the vendor is not
  itself a defendant for circumvention in the relevant data. Strale records
  the vendor and acquisition method per answer, as today.

**Preferred whenever available at compatible cost:** official APIs, licensed
data and statutory registries. This keeps DEC-20260428-A Tier 3 as a
preference, not a gate.

Every capability's manifest records which lane it uses
(`data_source_type`, and `acquisition_method` in provenance). A new source in
the "allowed with checks" lane needs a one-paragraph note in the manifest or
PR: what is fetched, why it is public and non-personal, and how blocks are
honoured.

## Context

Strale's no-scraping posture began on 2026-04-20/21 as a product promise for
the Counterparty Assurance compliance product. DEC-20260421-C records the
planned landing-page line "No scraping." and made it a v1 launch blocker.
DEC-20260428-A then softened it into three tiers: Strale never operates
scrapers; vendor-scraped data only for statutory public records; prefer
licensed data. DEC-20260518-F and DEC-20260813-A carved out per-call parsing
of statutory registries. Several records attribute the social-platform and
Google bans to DEC-20260420-H, but that record's exported source contains only
a title about positioning. The reasoning behind those bans was never recorded
as such (see [its record](../decisions/records/DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md)).

Counterparty Assurance was retired as the primary product by DEC-20260812-A
in August 2026, but the doctrine written for it stayed in force.

The doctrine as written no longer matches the catalogue:

- The tools behind about €138 of the last 90 days' revenue (`google-search`,
  `serp-analyze`, `brand-mention-search`) resell Google results collected by
  a vendor (Serper.dev). Google results are not statutory public records, so
  Tier 2 does not permit them as written.
- `screenshot-url`, `web-extract`, `url-to-markdown` and `seo-audit` are
  Strale-operated headless-browser or HTTP fetches, which Tier 1 describes as
  absolute never.
- At the same time the strict reading switched off public, non-personal
  sources with no third-party terms problem: `eu-court-case-search` (CURIA and
  HUDOC; its own DEACTIVATED note says access is generally permitted) and
  government-portal readers.

On 2026-10-23 Petter asked whether the rules are too strict compared with
other players. A research pass on the October 2026 legal landscape found:

- *Logged-out public facts are low risk in the US:* Meta v. Bright Data
  (2024, contract), hiQ v. LinkedIn (CFAA), and Google v. SerpApi (July 2026,
  DMCA claims on ordinary results dismissed; refiled narrower and pending).
- *Getting around anti-bot measures is a live risk:* in Reddit v. SerpApi /
  Perplexity (S.D.N.Y., July 2026) the circumvention and conspiracy claims
  survived, including against Perplexity as a customer.
- *Logins and fake accounts are costly:* hiQ's $500k judgment, and Proxycurl
  shutting down after LinkedIn sued in 2025.
- *In the EU the main exposure is personal data:* the Dutch AP 2024 guidance,
  CNIL's €240k fine against KASPR (December 2024) for reselling contact data
  taken from LinkedIn, and the Clearview fines.
- *Competitors who list social data push the risk onto customers by contract.*
  Delegate's and Bright Data's terms make the customer indemnify them and cap
  their own liability at fees.

The research is not legal advice, and several of the cited rulings are not
final.

## Rationale

The risk that matters is created by *how* data is accessed and *what* it is,
not by the word "scraping". A single honest fetch of a public, non-personal
page that a customer names carries far less risk than buying a vendor's
LinkedIn profile feed, yet the current doctrine forbids the first in its text
and permits neither consistently. A rule built on the actual risk factors:

- matches where courts and regulators have drawn lines: gates, circumvention,
  personal data, database extraction and contract;
- legitimises what Strale already sells instead of leaving its best earners in
  quiet breach of its own text;
- reopens public, non-personal sources that were closed only because of the
  wording;
- keeps every protection that addresses a real exposure: personal data, the
  litigating platforms, commercial databases and vendor terms.

It also removes a positioning promise ("no scraping") that belonged to a
retired product and was never true across the catalogue. Strale's provenance
per answer stays, so the customer can still see how each answer was sourced.

## Consequences

**Tools that become permissible to rebuild or reactivate.** Each still needs
an executor review against the lanes above before it goes live.

| Tool | Blocked today because | Under this rule |
|---|---|---|
| `eu-court-case-search` | Tier 1: Strale-operated reading of CURIA / HUDOC | Allowed: public court registers, read per call, blocks honoured. Personal data limited to what courts publish. |
| `product-search` | Strale-operated Google Shopping scrape (blocklisted) | Allowed via a vendor whose terms permit resale (e.g. a SERP vendor's shopping endpoint). Direct Google access stays blocked. |
| `keyword-suggest` | Calls an undocumented Google endpoint directly | Allowed via a vendor with resale rights (SERP vendors offer autocomplete). Direct Google access stays blocked. |
| `patent-search` | Google Patents scrape | Allowed via EPO OPS or USPTO (already permitted; this is migration work, not a doctrine change). Google Patents stays blocked. |
| `salary-benchmark` | Glassdoor scrape | Allowed only as a rebuild on public statistics (Eurostat, US BLS, Adzuna API). Glassdoor stays blocked. |
| `australian-company-data` | Tier 1 Browserless read of the ABR site | Permissible, but redundant: `au-company-data` covers it by API. Leave off. |
| Government-portal readers (pattern) | Tier 1 categorical | Allowed per call for public, non-personal company facts where no API exists. Each needs its manifest note. |

**Tools that stay off:**

| Tool | Why it stays off |
|---|---|
| `linkedin-url-validate` | LinkedIn: active litigation programme |
| `trustpilot-score` | Trustpilot: terms forbid automated access, reviewer personal data; licensed API is the route |
| `employer-review-summary` | Glassdoor: anti-bot, reviewer personal data |
| `annual-report-extract`, `business-license-check-se`, `credit-report-summary` | allabolag.se is a commercial database (database right) holding personal data on officers; the routes are Bolagsverket's paid ordering or a credit-bureau licence |
| `github-user-profile` | Personal data |
| `amazon-price` | Anti-bot (CAPTCHA) and terms; needs a licensed product-data API |
| `ip-geolocation`, `ip-risk-score`, `crypto-price`, `flight-status`, `host-exposure-lookup`, `token-security-check` family, `docker-hub-info` | Vendor terms forbid commercial resale on the tier used. Only a paid licence changes this. |
| Any social-platform data (X, Instagram, Facebook, TikTok, Reddit) | "Never" lane. Licensed APIs (X pay-per-use, Reddit commercial) are a separate commercial decision. |

**Tools that the rule legitimises as they are:** `google-search`,
`serp-analyze`, `brand-mention-search`, the adverse-media fallback (Serper),
`url-to-markdown`, `web-extract`, `screenshot-url`, `seo-audit`,
`tech-stack-detect` and the other customer-directed fetch tools. Each keeps
the fetch-path blocklist.

**On adoption:**

- DEC-20261023-A becomes active and supersedes DEC-20260428-A and
  DEC-20260813-A, and interprets DEC-20260427-H.
- The CLAUDE.md doctrine bullets and the AGENTS.md summary are rewritten.
- `tos-blocklist.ts` gains Reddit.
- The project memory note on the three-tier doctrine is replaced.
- The DEACTIVATED notes that cite Tier 1 are updated to cite this record.

**Recommended before adoption:** a short review of the EU personal-data and
database-right points by a Swedish or EU technology lawyer. This is a spend
decision for Petter.

## Reversal conditions

- **A ruling that makes logged-out access unlawful.** Tighten the allowed lane
  if a final appellate ruling or an EU or Swedish authority holds that
  logged-out, non-circumventing access to public, non-personal pages is
  unlawful as such. Likely triggers: the Google v. SerpApi or Reddit v.
  SerpApi appeals, or an IMY or EDPB statement.
- **Demand from the site.** Move a host to the "never" lane on any
  cease-and-desist or complaint from a site owner, and honour it immediately.
- **A partner requirement.** Restore a stricter posture for a specific product
  line if a customer or partner contract requires a no-scraping warranty.

## Evidence

- Current doctrine: [DEC-20260428-A](../decisions/records/DEC-20260428-A.md),
  [DEC-20260518-F](../decisions/records/DEC-20260518-F.md),
  [DEC-20260813-A](../decisions/records/DEC-20260813-A.md),
  [DEC-20260427-H](../decisions/records/DEC-20260427-H.md),
  [DEC-20260421-C](../decisions/records/DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md).
- Deactivation reasons per tool: `apps/api/src/capabilities/auto-register.ts`
  (the `DEACTIVATED` map).
- Fetch-path blocklist: `apps/api/src/lib/tos-blocklist.ts`.
- Vendor-terms audits: [2026-09-06](../security/2026-09-06-vendor-terms-audit.md),
  [2026-09-10](../security/2026-09-10-vendor-terms-audit-batch-2.md).
- Revenue figures: production `transactions`, last 90 days to 2026-10-23,
  external customers only, read through the read-only role.
- The legal landscape summary came from a web research pass on 2026-10-23
  (court write-ups by law firms and trade press, not primary filings). Several
  rulings it relies on are not final.
