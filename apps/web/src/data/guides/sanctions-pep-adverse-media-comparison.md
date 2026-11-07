---
slug: sanctions-pep-adverse-media-comparison
title: "Sanctions, PEP and adverse media screening APIs: what Strale does and where it sits"
description: "What Strale's sanctions, PEP and adverse media tools do, where the data comes from, and how they differ from calling the database or running your own."
group: screening
framework: "REST API"
language: "cURL"
tools: [sanctions-check, pep-check, adverse-media-check]
---
`sanctions-check`, `pep-check` and `adverse-media-check` are pay-per-call tools over Dilisense's consolidated screening database. Adverse media falls back to a web search when Dilisense cannot answer. They cost {{price:pep-check}}, {{price:sanctions-check}} and {{price:adverse-media-check}} a call, with no subscription or minimum. Strale does not run its own screening database. This page says what you gain and give up compared with other routes.

## The solution

```bash PEP check
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -d '{
    "capability_slug": "pep-check",
    "inputs": { "name": "Example Person" },
    "max_price_cents": 10
  }'
```
```bash Sanctions check
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -d '{
    "capability_slug": "sanctions-check",
    "inputs": { "name": "Spotify AB" },
    "max_price_cents": 30
  }'
```
```bash Adverse media check
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -d '{
    "capability_slug": "adverse-media-check",
    "inputs": { "name": "Wirecard AG", "entity_type": "company" },
    "max_price_cents": 30
  }'
```

## What a sanctions answer looks like

The field names are the tool's own. The name is the tool's test input and is expected to return no matches, so this is a real negative case.

```json Answer
{
  "output": {
    "query": "Spotify AB",
    "schema": "Company",
    "is_sanctioned": false,
    "match_count": 0,
    "total_results": 0,
    "matches": [],
    "lists_queried": { "collection": "dilisense/consolidated-sanctions" },
    "source": "dilisense"
  }
}
```

## What Strale does here

`sanctions-check` and `pep-check` call Dilisense's consolidated database. For sanctions that is the US OFAC SDN list, the EU financial sanctions list, the UN Security Council list, the UK sanctions list, Swiss SECO and a large set of national lists; for PEPs it covers politically exposed persons, their relatives and close associates. The tool pages name the sources.

`adverse-media-check` calls Dilisense's media endpoint first. Only if Dilisense is unavailable does it fall back to a web search with fixed keyword categories and no language model. The answer says which path produced it, in `source`.

A match means a name appears on a list that was searched. It is a screening signal for a person to review before any decision, not an automatic block or allow.

## Ways to get this data

Strale is a thin, pay-per-call layer over the database, and that is the trade. The alternatives are described in general terms because vendors change their prices; check each vendor's own page before you decide.

| Route | How you pay | What it suits |
| --- | --- | --- |
| Strale tools | Per call, no minimum | You want screening next to the rest of the catalogue: one key, one price list, one record of each call, and x402 for agents with no account. |
| Dilisense directly | Dilisense's own pricing | The database is the same one Strale calls. If you only need screening, calling it directly can cost less per call, and you handle the integration, billing and record-keeping yourself. |
| A self-hosted open-data screening service | Your own infrastructure, plus a data licence where one applies | You have the infrastructure to run it and want control over the data, and do not need a managed service. |
| A subscription screening vendor | A subscription, often priced by monitored entities or volume | You need ongoing monitoring of a list of entities, not one-off checks. |

If price per call is the only variable, a direct route can beat Strale's per-call price. Strale is the better fit when you want these checks in the same account and the same record-keeping as the rest of your tools.

## Limits

- **Fuzzy name matching produces false matches on common names.** Pass `country` and, for a person, `birth_date` where you have them.
- **Per-list freshness is not returned.** Dilisense says it updates its sanctions lists every 60 minutes and its PEP data once a day by default, but the answer carries no per-list update time. For a same-day check against a new designation, ask the primary source, such as OFAC or the EU Official Journal.
- **The adverse media fallback is weaker evidence.** When it runs, `source` says so and `fallback_reason` gives the reason. Treat those results as a lower standard of evidence for an audit file.
- **The risk level is a rule of thumb.** It comes from hit counts and severe-category counts, and the thresholds are in `risk_level_thresholds`. It is not a regulatory finding: read `top_articles` before acting on it.

## Questions

### Does Strale run its own sanctions or PEP database?

No. The sanctions and PEP tools call Dilisense's consolidated database. Strale's part is a consistent API, one key and balance across the whole catalogue, and a record of each call.

### Is Strale the cheapest way to screen?

Not on price per call alone. Calling Dilisense directly, or running an open-data service yourself, can cost less. Strale trades a per-call price for not integrating, billing and logging a separate vendor.

### What does a match mean?

The name appeared on a list that was searched. It is a screening signal, not a verdict, and is meant for a person to review before an onboarding or payment decision.

### How is adverse media different from sanctions and PEP checks?

Sanctions and PEP checks search curated lists: a name is on one or it is not. Adverse media searches news coverage and groups it into a risk level, closer to "here is what the press said" than to an official designation.
