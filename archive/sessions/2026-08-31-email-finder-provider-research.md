# Email-finder capability and provider research

**Date:** 2026-08-31  
**Scope:** Current capability status, reason for deactivation, legal posture, alternative providers, and recommended path  
**Status:** Research complete; no vendor selected, account created, contract accepted, capability reactivated, or external claim made

## Executive conclusion

Keep the existing `email-finder` capability deactivated.

The capability was intentionally shelved on 2026-08-09 because its evidence path did not reliably establish that a generated address belonged to the requested person. It was not disabled because email finding is categorically illegal. The material issues are correctness, personal-data governance, source transparency, vendor redistribution rights, and the restrictions in Strale's active third-party scraping doctrine.

No reviewed self-serve email-finder provider passes all of Strale's current requirements:

1. explicit permission to expose results through a standalone paid API;
2. per-result provenance and acquisition method;
3. compatibility with DEC-20260428-A / DEC-20260813-A;
4. low fixed cost and workable unit economics inside the existing EUR 0.02-EUR 1.00 retail band;
5. bounded latency suitable for a synchronous capability;
6. GDPR roles, retention, suppression, and data-subject-right support.

The best fit with Strale's operating model is a narrower architecture using a verification provider such as **Bouncer**, not a contact-data corpus: customer-supplied name, domain, and pattern evidence; deterministic candidate generation; live verification; and return only a verified, non-catch-all candidate with explicit limitations. This would still require a new capability decision and a controlled accuracy evaluation before launch.

If demand emerges for a true full-service finder, the two vendors worth contractual clarification are:

- **emailfinder.dev**, for a custom OEM licence restricted to name + domain pattern generation and SMTP verification, with social-profile and database endpoints disabled;
- **Anymail Finder**, for written clarification of source attribution, acquisition method, retention, and a name+domain-only operating mode.

Neither is approved under the evidence presently available.

## Current Strale status

Production state observed on 2026-08-31:

| Capability | State | Notes |
|---|---|---|
| `email-finder` | deactivated, invisible, non-x402 | Deactivation reason records the failed evidence branch and need for a lawful evidence corpus; no recorded production transactions |
| `email-pattern-discover` | deactivated | One historical transaction; not a reliable substitute |
| `domain-contact-extract` | active | More than 1,100 calls; extracts contact addresses actually present on a supplied domain |

The public capability route for `email-finder` returns 404 and the slug is absent from public x402 surfaces. The executor remains in source control but registration intentionally skips it.

The current executor combines company-page evidence, MX information, and generated address patterns. Its core defect is that a plausible and deliverable-looking address is not proof that the mailbox belongs to the requested person. The manifest explicitly states that it does not perform mailbox verification.

The 2026-08 demand-mined build queue continues to decline `email-finder` because no new demand evidence has appeared. Nearby demand is concentrated in validation, deliverability, authentication, reputation, and domain contact extraction rather than person-level discovery.

## Why the capability was turned off

The 2026-08-09 decision was a product-quality decision, not a transient incident:

- the evidence branch did not fire reliably on real target domains;
- generated patterns could rank a wrong address above a correct one;
- a domain accepting email does not establish mailbox existence;
- mailbox existence would still not establish the intended person's identity;
- the capability had no proven customer demand or transaction history to justify the risk.

Therefore the right interpretation is **intentionally unavailable**, not **temporarily broken**.

## Legal and governance findings

Email finding is not categorically prohibited, but a named professional email address is normally personal data. A controller must establish and document a lawful basis, purpose limitation, accuracy controls, retention, transparency, source information, and objection/suppression handling.

Relevant surfaces:

- [GDPR, including Articles 5, 6, 14, 15, and 21](https://eur-lex.europa.eu/eli/reg/2016/679/2016-05-04)
- [Swedish IMY guidance on legitimate interests](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/intresseavvagning/)
- [Swedish Marketing Act (2008:486), sections 19-20](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/marknadsforingslag-2008486_sfs-2008-486/)
- [CNIL's December 2024 KASPR enforcement](https://www.cnil.fr/en/data-scraping-kaspr-fined-eu240000)
- [CNIL's March 2026 closure after KASPR deleted its database and stopped LinkedIn collection](https://cnil.fr/en/closure-order-issued-against-kaspr)

The KASPR matter is relevant because it concerned restricted-visibility contact data, excessive retention, delayed Article 14 notice, and inadequate source answers. It does not establish that all professional-email discovery is unlawful. It does show that “publicly accessible sources” is not an adequate substitute for per-person source accountability.

Strale also has a stricter internal boundary than baseline law. DEC-20260428-A allows vendor-scraped data only under a narrow Tier-2 doctrine involving statutory public records, documented redistribution rights and indemnification, primary-source provenance per fact, and sourcing disclosure. Ordinary corporate websites and social profiles are not statutory public records. Re-enabling a crawler- or waterfall-backed finder would therefore conflict with the active Decision unless it were formally revised or superseded.

Customer transaction evidence must never be repurposed into an email corpus or prospect list. Content and provenance are redacted after 90 days under the operating charter.

## Evaluation criteria

The provider scan applied Strale's internal [Vendor Evaluation Methodology](https://www.notion.so/35d67c87082c819f9cecd689c6fa5d10): vendor claims are not treated as coverage evidence; sandboxes establish only authentication and wire shape; and any selection requires a bounded production evaluation using independently known fixtures.

Hard gates used in this review:

| Gate | Requirement |
|---|---|
| Downstream rights | Explicit standalone API, resale, or OEM permission; internal-use API language is insufficient |
| Source accountability | Upstream vendor, acquisition method, and the best available primary source or explicit `inferred` status |
| Doctrine | No Strale scraping; no hidden social-profile data; no crawler-derived ordinary-web corpus under the current Decision |
| Correctness | Score person-identity precision separately from mailbox deliverability |
| Economics | Low fixed floor, success-based charging preferred, and margin inside the current retail band |
| Operations | Bounded synchronous response or a design explicitly compatible with Strale's execution model |
| Privacy | DPA, documented roles, retention/deletion, suppression, data-subject-right assistance, and transfer safeguards |

## Provider findings

### 1. Bouncer — recommended verification substrate

- Not a finder; verifies candidate addresses supplied by Strale.
- Pay-as-you-go starts at USD 8 for 1,000 checks; purchased credits do not expire.
- DPA describes Bouncer as processor, covers potential customers among data-subject categories, uses EU AWS Frankfurt, supports deletion, and otherwise deletes/anonymises after its stated retention period.
- Does not solve the identity-evidence problem by itself.

Sources: [pricing](https://www.usebouncer.com/pricing/), [DPA](https://www.usebouncer.com/dpa/).

**Verdict:** Best match for a narrower, evidence-backed Strale architecture. Not sufficient for reactivating the current finder unchanged.

### 2. emailfinder.dev — best full-finder OEM candidate, not currently licensed

- Claims real-time name+domain pattern generation and SMTP verification without a stored email database.
- Starter plan: EUR 19/month for 1,000 success-only results.
- Spanish legal entity and published DPA; US infrastructure subprocessors are covered by stated transfer mechanisms.
- Acceptable Use Policy prohibits harvesting data for resale/redistribution and creating competing services using its data.

Sources: [product and pricing](https://www.emailfinder.dev/), [DPA](https://www.emailfinder.dev/dpa), [Acceptable Use Policy](https://www.emailfinder.dev/acceptable-use).

**Verdict:** Architecturally promising only if Moonlighter AB obtains a written OEM agreement expressly covering a standalone Strale capability. No such right is currently established.

### 3. Anymail Finder — closest published commercial fit, governance incomplete

- Published Acceptable Use Policy expressly permits resale or provision of returned email data as part of another product or service.
- Low-volume monthly plan: GBP 26 for 400 success-only credits.
- Person endpoint returns address, verification status, and MX information, but not a primary-source URL or acquisition method.
- Policy says customers “should not” disclose that data came from Anymail Finder, which conflicts with Strale's transparency posture.
- Public materials contain inconsistent retention descriptions: product marketing refers to 30 days, while the DPA describes longer retention for search data.
- LinkedIn fallback and website-dependent operations must be disabled for a Strale-compatible mode.

Sources: [Acceptable Use Policy](https://anymailfinder.com/legal/acceptable-use-policy), [pricing](https://anymailfinder.com/pricing), [person API response](https://anymailfinder.com/email-finder-api/docs/find-person-email), [DPA](https://anymailfinder.com/legal/dpa).

**Verdict:** Worth written clarification if demand appears; not approvable on the current documentation.

### 4. Hunter — strongest provenance, but doctrine and product-replication conflicts

- Minimum Data Platform example: USD 61/year for 1,000 Search and 1,000 Verification credits.
- Publicly sourced results expose source URLs and review dates; inferred results are explicitly labelled and verified.
- Hunter's API material supports integration into applications, but its embedding guidance does not permit replicating Hunter's core finder as a standalone product without custom permission.
- Hunter crawls ordinary public webpages, which does not meet Strale's current statutory-public-record doctrine.

Sources: [Data Platform pricing](https://help.hunter.io/en/articles/9920427-data-platform-plans-for-api-users), [source behaviour](https://help.hunter.io/en/articles/2085802-are-the-emails-found-in-the-email-finder-publicly-sourced), [API for Data Plans](https://help.hunter.io/en/articles/12149400-hunter-api-for-data-plans), [data methodology](https://hunter.io/our-data).

**Verdict:** Best transparency among conventional finders, but not a current Strale fit without both custom rights and a deliberate doctrine change.

### 5. Tomba — good response provenance, prohibited standalone use

- API response includes source URI, extraction date, last-seen date, score, and verification status.
- API terms prohibit standalone lookup services, public endpoints, resale, and redistribution under standard plans.

Sources: [finder response schema](https://docs.tomba.io/api/finder), [API terms](https://tomba.io/legal/api-terms).

**Verdict:** Technically strong; contractually disqualified under self-serve terms.

### 6. FullEnrich — explicit reseller programme, opaque waterfall

- Advertises custom reseller terms and white-label resale.
- Standard baseline shown at approximately USD 55/month for 1,000 work-email credits; reseller pricing is custom.
- Uses a 20+ provider waterfall.
- Published material does not establish a per-result primary-source reference or a complete auditable downstream rights chain for each contributing provider.

Sources: [reseller programme](https://fullenrich.com/partners/resellers), [pricing](https://fullenrich.com/pricing).

**Verdict:** Commercially possible, but fails Strale's present provenance and scraping-doctrine gates unless a custom agreement supplies substantially more detail than the public documentation.

### 7. BetterContact — white-label offer, standard terms remain internal-use

- Advertises a white-label waterfall across 20+ providers.
- Standard terms grant a non-transferable, non-sublicensable internal-business-use right.
- Async workflow may take minutes, a poor fit for the current synchronous capability surface.

Sources: [white-label offer](https://bettercontact.rocks/whitelabel/), [terms](https://bettercontact.rocks/terms/), [API behaviour](https://doc.bettercontact.rocks/quickstart).

**Verdict:** Custom-contract only; operational and provenance fit remain weak.

### 8. Enrow — attractive economics, own-behalf use only

- EUR 15/month for 1,000 successful finder credits; API included.
- Terms license enriched data only for B2B prospecting on the client's own behalf.
- Async-first API.

Sources: [pricing](https://enrow.io/es/pricing), [terms](https://enrow.io/en/legal/terms-and-conditions), [API](https://enrow.io/en/api).

**Verdict:** Not licensed for a Strale resale capability.

### 9. Findymail — high fixed floor, resale rights unclear

- USD 99/month for 5,000 successful finder credits.
- EU-hosted and API-capable.
- Standard terms do not clearly grant downstream resale or standalone lookup rights.

Sources: [pricing](https://www.findymail.com/pricing/), [terms](https://www.findymail.com/terms-conditions/).

**Verdict:** Insufficient rights clarity and unnecessarily high fixed cost at current demand.

### 10. Prospeo — internal use only

- Functional person-enrichment API with success-based charging.
- Terms limit output to internal B2B use and prohibit resale, redistribution, publication, or third-party disclosure absent a separate arrangement.

Sources: [terms](https://prospeo.io/terms-of-service), [API](https://prospeo.io/api-docs/enrich-person).

**Verdict:** Reject under standard terms.

### 11. LeadMagic, Dropcontact, Snov.io, and Apollo

- LeadMagic requires a separate written reseller agreement.
- Dropcontact prohibits monetising, selling, or granting access to its service or information.
- Snov.io prohibits using its information for resale or commercial third-party transfer without consent.
- Apollo's standard API posture is internal-use; an OEM/reseller arrangement is a separate commercial relationship. The existing Strale vendor roster already records Apollo as rejected for redistribution in another data context.

Sources: [LeadMagic partner terms](https://partners.leadmagic.io/terms), [Dropcontact terms](https://www.dropcontact.com/terms), [Snov.io terms](https://snov.io/t_and_c), [Apollo API terms](https://www.apollo.io/terms/api), [Apollo reseller programme](https://www.apollo.io/partners/api-reseller).

**Verdict:** No self-serve Strale fit.

## Recommended architecture if demand appears

```text
customer-supplied name + company domain
                |
customer-supplied pattern evidence
or known colleague address
                |
deterministic candidate generation
                |
EU verification provider (Bouncer first candidate)
                |
return only verified, non-catch-all candidate
with method, evidence and limitations
```

Required safeguards:

- B2B professional domains only; reject personal webmail domains.
- No LinkedIn URL input, social-profile lookup, bulk enumeration, crawling, or persistent contact corpus.
- Require caller-supplied evidence of the organisation's pattern, or return no result.
- Reject catch-all domains and ambiguous same-name/initial collisions.
- Separate `identity_evidence` from `deliverability_status` in the wire shape.
- Include `acquisition_method`, verification timestamp, provider, confidence, and an explicit `inferred` marker.
- Maintain suppression and data-subject-right workflows.
- Apply the platform's 90-day content/provenance redaction.
- Never represent a technically valid mailbox as permission to contact the person.

Economics at Bouncer's entry rate: five to ten candidate checks cost approximately USD 0.04-USD 0.08. A retail price in the EUR 0.20-EUR 0.40 range could fit the existing pricing band, subject to measured candidate counts and retry costs.

## Required evaluation before any selection

No provider claims in this report should be treated as measured Strale coverage. A pilot should be pre-registered and use only consenting or independently known fixtures.

Suggested fixture set:

- 20 known valid professional addresses across small and large companies, EU and non-EU domains, diacritics, compound surnames, and several mail providers;
- 10 known non-existent or deliberately ambiguous identities;
- explicit catch-all, role-address, shared-mailbox, and same-name collision cases;
- exact expected identity and expected outcome recorded before calls.

Metrics:

- wrong-person rate — hard gate, scored separately from bounce/deliverability;
- precision among returned results;
- coverage among eligible known-valid fixtures;
- catch-all false-positive rate;
- p50/p95/p99 latency and timeout rate;
- cost per correct returned identity, including all candidate checks and retries;
- source/method completeness and suppression behaviour.

The vendor methodology budget heuristic is approximately EUR 5 per vendor and 50-60 production calls, but creating accounts, accepting vendor terms, or contacting a vendor remains founder-gated under the operating charter.

## Decision recommendation

1. Keep `email-finder` deactivated.
2. Add no conventional contact-data provider now.
3. Prioritise the already proposed DNS-only `domain-email-provider-detect` capability if the email cluster is expanded; it has observed adjacency and no person-level discovery.
4. Require fresh demand evidence before starting procurement or a new capability proposal.
5. If demand clears that gate, first evaluate the Bouncer-backed evidence model.
6. If a full finder is still required, seek written clarification from emailfinder.dev and Anymail Finder; do not rely on self-serve terms or marketing assurances.
7. Treat Hunter, Tomba, FullEnrich, BetterContact, Apollo, and other crawler/waterfall providers as incompatible unless the active scraping doctrine is formally revised or superseded.

## Related internal records

- Existing email-finder task / shelving record: https://www.notion.so/3b667c87082c81c5a682cccab0f82774
- Prior implementation session: https://www.notion.so/3b667c87082c8142ba40fb3ec099f9b7
- Vendor Evaluation Methodology: https://www.notion.so/35d67c87082c819f9cecd689c6fa5d10
- Capability Pricing Framework: https://www.notion.so/31767c87082c81ae9098eeb8269c2b22
- Active doctrine: `CLAUDE.md`, DEC-20260428-A and DEC-20260813-A
- Demand evidence: `docs/strategy/2026-08-demand-mined-build-queue.md`, explicitly declined section

## Research limitations

- This was a documentation and terms review, not a production coverage benchmark.
- Vendor accuracy and coverage percentages were treated as vendor assertions and were not used to approve a provider.
- Custom commercial terms can supersede standard terms, but no vendor was contacted and no custom terms were reviewed.
- Legal analysis is operational risk analysis, not external legal advice.
- Vendor terms and pricing are time-sensitive and must be rechecked immediately before procurement.
