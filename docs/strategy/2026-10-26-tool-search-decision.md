# DEC-20261026-A — Tool search rebuilt with BM25F and full-catalogue model ranking

- Status: active, technical, decided 2026-10-26 by the orchestrator under DEC-20260815-A (technical choices are Claude's); Petter asked for the world-class version and Haiku 5.5 the same day.
- Supersedes: the Voyage-embeddings retrieval part of DEC-20260303-E.
- Evidence: `archive/sessions/2026-10-26-search-rebuild/report.md`, `archive/receipts/2026-10-26-check-search-evaluation.json`, `archive/receipts/2026-10-26-test-run-search-rebuild.json`.

## Decision

Tool search: keyword engine rebuilt (BM25F, country understanding, typo
tolerance) and `POST /v1/suggest` ranked by Claude Haiku 5.5 over the full
catalogue; supersedes the Voyage-embeddings retrieval part of DEC-20260303-E.
This supersession is limited to retrieval, not unrelated requirements of
the earlier decision. DEC-20260303-E is recorded in CLAUDE.md but has no
standalone migrated record, so no unresolved graph relation is added here.

The orchestrator took this technical decision under DEC-20260815-A, which
delegates technical choices to Claude/Codex. Petter asked for the world-class
version and Haiku 5.5 on 2026-10-26. This file records that instruction; it
does not activate the candidate project-document migration or authorize a
production change by the build agent.

## Context

Production had no Voyage key, so the intended embedding/re-ranking pipeline
silently used a weak keyword fallback. The typeahead endpoint is also the
MCP tool-discovery endpoint. Stop words, unrestricted prefixes, unweighted
fields, country vocabulary and typos all damaged retrieval.

The frozen public fixture contains 392 items and the orchestrator supplied
90 golden queries. Three are coverage gaps and are excluded from typeahead
metrics. The faithful legacy fixture adapter scores 26/87 top-1 and 46/87
top-3; the rebuilt keyword engine scores 81/87 and 86/87. Production baselines
are 29/87 and 48/87 for typeahead, and 39/90 and 55/90 for smart search.
On a separate held-out set of 40 queries that the orchestrator wrote after
the build and never showed the builder, the rebuilt engine scores 29/38 top-1
and 34/38 top-3 against 12/38 and 21/38 for the legacy engine; the gap to the
golden-set score shows some tuning to the golden set, and the held-out number
is the better estimate of real quality. Full per-kind results and baseline
limitations are in the report.

## Rationale

BM25F gives catalogue identity and curated tags more weight than incidental
prose. Safe stemming, restricted prefixes, edit-distance matching and country
scope improve retrieval without paid calls. The loaded catalogue supplies
IDF and a precomputed index. A relative score cutoff makes the reported total
count relevant matches rather than every incidental word overlap.

Smart search sends the whole compact, deterministically ordered catalogue to
the search-specific model role. Structured outputs and validation constrain
its answers to actual catalogue slugs. The cached system prefix is independent
of the user query and requested result count.

## Consequences

The typeahead and smart-search response contracts are preserved. Solutions
win only on merit or ties, and country variants are grouped for typeahead.
The model has a six-second timeout, no retries, an in-process per-IP model
limit and a process-wide daily cap. All model failures fall back to keywords.
The daily cap resets on restart and is per replica, not a durable account
spend limit. Successful model results retain the normalized-query cache;
transient failures and budget fallbacks do not poison it.

Voyage's unused module, registry role and environment variable are removed.
The vendor register records retirement and the canonical vendor fact retains
its legacy `embeddings` field while explicitly describing search ranking
without embeddings. No capability-default model, capability executor,
manifest, website or MCP package is changed.

Live evaluation of the new smart search is deferred to the orchestrator after
deploy: the build environment has no Anthropic key. Deployment and production
configuration remain outside the build agent's authorization.

## Reversal conditions

Revisit the ranking approach if representative queries regress beyond the
measured quality gate, latency exceeds the request budget, cached-prefix cost
is unacceptable, or the selected model is unavailable. Preserve keyword
fallback and measure a replacement against the unchanged golden expectations.
