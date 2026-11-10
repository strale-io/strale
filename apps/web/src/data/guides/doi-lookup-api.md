---
slug: doi-lookup-api
title: "DOI lookup API: retrieve publication metadata as JSON"
description: "Resolve a DOI through Crossref and DataCite, read publication metadata and handle missing abstracts, partial dates and source-specific citation counts."
group: web
framework: "REST API"
language: "cURL"
tools: [doi-resolve, academic-paper-search]
---
Use `doi-resolve` to turn a DOI into structured publication or dataset metadata. A successful API-key call costs {{price:doi-resolve}}. The result can help an app or research agent check a reference; it does not retrieve the full paper or verify the paper’s conclusions.

## Request metadata for a DOI

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "doi-resolve",
    "inputs": { "doi": "10.1038/nature12373" },
    "max_price_cents": 2
  }'
```

The input also accepts a `doi:` prefix or a DOI resolver URL. For example, replace `inputs` with `{"doi":"https://doi.org/10.1038/nature12373"}`. Use [Academic Paper Search](/tools/academic-paper-search) when you have a title or topic rather than a DOI.

## Check the source and identity

The tool queries Crossref first. Only a Crossref not-found response triggers the DataCite fallback; timeouts, rate limits and other service errors are returned as errors. A record missing from these sources is not proof that the DOI is invalid everywhere.

Keep `doi`, `title` and `registration_agency` together when storing a result. Compare the returned title with the reference you intended to use. [Crossref’s metadata API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) exposes deposited bibliographic metadata; it is not a review of the underlying research.

## Preserve missing fields and date precision

An unavailable scalar field is `null`; an unavailable author list is `[]`. `published` can be a year, year-month or full date. Preserve that precision instead of filling in January 1 for a year-only value.

On the DataCite path, the tool returns available title, creators, publisher, type and publication year. Journal fields, abstract, language, licence URL and reference count are null; `issn` is an empty array. An available Crossref abstract has its XML tags stripped. A null abstract does not mean that the publication has no abstract.

Metadata and licence links do not grant access to full text or permission to reuse it. Check the publisher’s terms for the material you want to use.

## Interpret citation counts

`reference_count` counts references listed by the work. `referenced_by_count` is the source’s count of citations to the work: Crossref’s count on that path, or DataCite’s `citationCount` if supplied. Keep missing counts as null rather than zero. A supplied zero is preserved.

Counts depend on source coverage and the time of the lookup. Do not treat them as a universal citation total or a list of citing papers. The tool does not return a citation graph.

See [DOI Resolver](/tools/doi-resolve) for the paired example, field types and selected-tool signup.
