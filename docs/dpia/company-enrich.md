# DPIA: `company-enrich`

**Last reviewed:** 2026-04-30
**Owner:** Strale (controller for Strale-side LLM processing; processor for customer-supplied domain/email/name)
**Re-review trigger:** addition of contact-extraction step, change to the LLM model, or change to the scrape doctrine (DEC-20260428-A)

## 1. Description of processing

`company-enrich` accepts a domain, email, or company name and returns
enriched company-level data: industry, employee estimate, HQ location,
description, social links, tech stack. Implementation:

1. Resolve input to a canonical company website (e.g. domain from
   email, search-then-confirm if name).
2. Fetch the company's public homepage (and optionally /about,
   /contact) via the Browserless headless-browser tier.
3. Pass the rendered HTML to Anthropic Claude for structured
   extraction.

**Personal data categories processed**: in principle, the **company-
level** focus means personal data is incidental. In practice, the
scraped homepage may include:
- Names + titles of company executives (about pages, leadership pages)
- Email addresses (contact pages)
- Photos of staff (which we do NOT extract or store; the LLM is
  prompted to ignore images and persons)

**Where processing happens**: Browserless (EU region; see Privacy §4)
for the headless browser; Anthropic (US region) for the LLM extraction.

## 2. Necessity and proportionality

**Lawful basis** (controller-side): typically Art. 6(1)(f)
(legitimate interest in understanding a counterparty's business
profile for sales / due-diligence / market-research purposes), with
the controller's own balancing test required.

**Necessity**: the customer needs structured company-level data
(industry, size, location) for downstream workflows. Manual lookup
would produce the same data at higher cost; bulk vendor data (e.g.
ZoomInfo, LinkedIn) is more comprehensive but typically requires
contracts, includes more personal data than the customer needs, and
has its own DPIA implications. `company-enrich` is the
narrowest-scope option for the company-only use case.

**Proportionality**: the input is the minimum necessary (a domain).
The output schema is restricted to company-level fields; the LLM
prompt instructs the model not to extract personal data of named
individuals beyond what's necessary for the company description.
Customer cannot ask `company-enrich` for "who works at this
company" — that's a different capability with different
proportionality analysis.

## 3. Risks to rights and freedoms

| Risk | Likelihood | Severity | Notes |
|---|---|---|---|
| **Inadvertent personal data extraction** — the LLM extracts an executive's name + email when summarising the company | Medium | Low | The prompt instructs the model to focus on company-level data; the output schema doesn't have a "personnel" field. Names appearing in `description` are treated as factual public information about the company (e.g. "Founded in 2018 by Jane Smith"). |
| **Stale data** — scraped homepage may be outdated | Medium | Low | Documented in the manifest's `limitations`. The output includes `fetched_at` so the customer knows the freshness. |
| **Wrong company resolution** — input "spotify" resolves to the wrong Spotify entity (e.g. a satellite project rather than the parent company) | Low | Low | Customer is expected to supply a domain when accuracy matters; name-only input is a convenience for non-critical use cases. |
| **Cross-border transfer** — LLM step happens at Anthropic (US) | Certain | Low | Anthropic is DPF-certified (covered in Privacy §5). |
| **Re-identification through audit retention** | Low | Low | The retained input is just a domain name; the retained output is company-level data. Personal data exposure is minimal. |
| **TOS/scraping risk** — fetching a company website may violate that site's TOS | Low | Low | The Browserless tier respects robots.txt. Fetching a public company homepage is the same act as a manual visit; we do not bypass authentication or paywalls. |

## 4. Mitigations

- **LLM prompt** instructs the model to focus on company-level data
  and not to extract personnel information.
- **Output schema** does not have personal-data fields (no
  `personnel`, no `contacts`); the LLM cannot smuggle personal data
  through the output type without violating the schema.
- **Browserless tier** is used for the fetch step; same constraints
  as for any other public-page scrape (robots.txt compliance, no
  authenticated content).
- **Audit response** carries the same Art. 22 disclosure as other
  capabilities; classification is `data_lookup` (factual data, not
  decision-supporting on its own).
- **DPF coverage**: Anthropic's US processing is covered by the EU-US
  Data Privacy Framework as documented in Privacy §5.

## 5. Residual risk and decision

After mitigations, the residual risk is **low and acceptable** for
the typical use case (B2B sales / due-diligence enrichment). The cap
is correctly classified as `data_lookup` (not `screening_signal` or
`risk_synthesis`); it does not produce decision-relevant signals on
its own.

The one risk worth surfacing on the manifest's `limitations` array
(open follow-up, this DPIA is the audit trail for that decision):

- **The LLM occasionally includes an executive's name in the
  `description` field when summarising the company.** This is
  factually present on the source page (a public homepage that names
  its leadership) so the lawful basis is the same as for the rest of
  the company description, but the customer should be on notice that
  the `description` may include named individuals.

We will add this to the manifest's `limitations` array in the next
manifest-edit pass.

## 6. Consultation

Per Art. 35(2) the DPO function (petter@strale.io) has been
consulted. Per Art. 36, no prior consultation with the supervisory
authority is required. This DPIA describes a low-risk processing
operation against publicly-published company information.
