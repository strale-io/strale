---
title: "How We Score 297 Agent Data Capabilities -- and Why It Matters"
description: "A technical look at Strale's dual-profile quality scoring model for AI agent tools: how we separate code quality from operational reliability, and what it means for agent builders."
tags: ai, agents, quality, testing
published: false
---

When your AI agent calls an external tool, how do you know the data coming back is any good?

This is not a theoretical problem. At Strale, we run 297 data capabilities that agents use for everything from VAT validation to company registry lookups to invoice extraction. Each capability calls a different external source, parses a different response format, and fails in a different way.

We needed a scoring system that would tell agents (and the humans building them) what to expect before making a call. So we built SQS, the Strale Quality Score. This article explains how it works, directly from the source code.

## The Problem: No Quality Signal for Agent Tools

Most tool registries give you a name, a description, and maybe an input schema. But they tell you nothing about:

- Does this tool actually return correct data right now?
- Is the response schema stable, or did it change last week?
- If the upstream API goes down, will you get a useful error or a raw HTML page?
- What is the p95 latency, and is that normal for this type of tool?

Without these signals, agent builders are flying blind. They discover quality issues at runtime, in production, from their users.

## Why Two Profiles Instead of One

Early on, we used a single weighted score: 5 factors multiplied by fixed weights, producing a number from 0 to 100. It worked, but it conflated two fundamentally different things.

When a company registry API returns HTTP 503, that is not a code quality problem. Our parser, our schema validation, our error handling are all fine. The upstream service is just down. Penalizing code quality for upstream outages gave misleading signals.

Conversely, when our extraction logic returns the wrong field name, that is not a reliability problem. The service is up, responding fast, and available. Our code is just wrong.

So we split the score into two independent profiles.

## Quality Profile (QP): Is the Code Right?

The Quality Profile measures whether our capability code does its job correctly, with upstream failures excluded entirely. If an external API times out, that failure does not count as a pass or a fail in QP. It is simply removed from the dataset.

QP has four factors with fixed weights:

| Factor | Weight | What It Measures |
|---|---|---|
| Correctness | 50% | Do known-answer tests return the expected values? |
| Schema stability | 31% | Does the output match the declared schema? |
| Error handling | 13% | Does the capability return structured errors for bad input? |
| Edge cases | 6% | Does it handle boundary conditions gracefully? |

These weights reflect a simple priority: getting the right answer matters most. Schema stability is second because agents parse structured output programmatically. Error handling and edge cases matter, but less so for the headline score.

Each factor uses a rolling window of the 10 most recent test runs, with linear decay weights from 1.00 (most recent) down to 0.30 (oldest). This means recent test results count more than older ones, and a capability that recovers from a bug sees its score improve within runs, not weeks.

A capability needs at least 5 test runs with data in at least 2 factors before QP produces a score. Before that, it shows "pending."

## Reliability Profile (RP): Is the Service Dependable?

The Reliability Profile measures operational dependability, including upstream failures. If an API goes down, RP reflects that because it affects the agent's actual experience.

RP has four factors, but unlike QP, the weights vary by capability type:

| Factor | Deterministic | Stable API | Scraping | AI-Assisted |
|---|---|---|---|---|
| Current availability | 10% | 30% | 35% | 25% |
| Rolling success | 30% | 30% | 30% | 30% |
| Upstream health | 10% | 25% | 25% | 25% |
| Latency | 50% | 15% | 10% | 20% |

The logic behind the type-specific weights: a deterministic capability (like IBAN validation) has no external dependencies, so latency dominates -- either it is fast or something is wrong with the code. A scraping capability (like extracting data from a company registry website) depends heavily on whether the target site is up, so current availability and upstream health get more weight.

Latency scoring uses type-specific thresholds. For a deterministic capability, p95 over 2,000ms is unacceptable. For a scraping capability, p95 under 5,000ms is excellent. Same number, different verdict.

RP also carries the circuit breaker penalties:
- 3 consecutive execution failures: score drops by 30 points (floor at 20)
- 5 consecutive test failures: score drops by 20 points (floor at 30)
- Recovery: 3 consecutive passes clear all penalties immediately

## The 5x5 Matrix: Combining QP and RP

Both profiles produce a letter grade (A through F) based on their numeric score:
- A: 90+
- B: 75-89
- C: 50-74
- D: 25-49
- F: below 25

These two grades combine via a 5x5 lookup matrix:

```
         RP:A   RP:B   RP:C   RP:D   RP:F
QP:A      95     82     65     45     30
QP:B      85     75     58     40     25
QP:C      70     62     50     35     20
QP:D      55     48     38     28     15
QP:F      35     30     22     15     10
```

The matrix is intentionally asymmetric in its penalties. A capability with perfect code quality (QP:A) but degraded reliability (RP:C) scores 65. A capability with degraded code quality (QP:C) but perfect reliability (RP:A) scores 70. Reliability failures cap the score more aggressively because they directly affect the agent's ability to get any result at all.

Within each cell, the actual QP and RP numeric scores interpolate the final result by up to 3 points in either direction, giving more granularity than just 25 discrete scores.

## What the Public Endpoint Returns

Every SQS score is available via a free, unauthenticated endpoint:

```
GET /v1/quality/{slug}
```

No API key, no signup. The response includes:

```json
{
  "capability": "vat-validate",
  "sqs": {
    "score": 95,
    "label": "Excellent",
    "trend": "stable",
    "freshness_level": "fresh"
  },
  "quality_profile": {
    "grade": "A",
    "score": 98.2,
    "label": "Code quality: A",
    "factors": [
      { "name": "correctness", "rate": 100, "weight": 0.5, "has_data": true },
      { "name": "schema", "rate": 100, "weight": 0.31, "has_data": true },
      { "name": "error_handling", "rate": 90.5, "weight": 0.13, "has_data": true },
      { "name": "edge_cases", "rate": 100, "weight": 0.06, "has_data": true }
    ]
  },
  "reliability_profile": {
    "grade": "A",
    "score": 96.5,
    "label": "Excellent",
    "capability_type": "stable_api",
    "factors": [
      { "name": "current_availability", "score": 100, "weight": 0.3 },
      { "name": "rolling_success", "score": 98, "weight": 0.3 },
      { "name": "upstream_health", "score": 100, "weight": 0.25 },
      { "name": "latency", "score": 85, "weight": 0.15 }
    ]
  },
  "runs_analyzed": 10,
  "pending": false,
  "freshness": {
    "category": "live-fetch",
    "label": "Live data"
  }
}
```

Responses are cached for 5 minutes (Cache-Control: public, max-age=300). If a capability has not yet accumulated enough test runs, the response includes a `qualification_estimate` field (e.g., "~18h") telling you when to check back.

When failures have occurred, the response includes a `failure_classification` breakdown separating Strale bugs from upstream issues, so you can tell whether a low score is something we need to fix or something outside our control.

## Distribution Today

Across 281 scored capabilities (out of 297 total, with 16 still pending), 242 hold an A grade. That is 86% of the scored catalog. These scores are backed by 1,805 active test suites running on tiered schedules: every 6 hours for pure-computation capabilities, every 24 hours for stable API integrations, and every 72 hours for web scraping capabilities.

## What This Means for Agent Builders

If you are building agents that call external tools, here is why this matters:

**Before calling a capability**, check `/v1/quality/{slug}`. It is free. If SQS is below 50, the capability might be having issues. The `trend` field tells you if things are getting better or worse.

**Use the capability type** in the reliability profile to set appropriate timeout expectations. A scraping capability with p95 of 12 seconds is behaving normally. A deterministic capability with the same latency has a problem.

**Check the failure classification** when something goes wrong. If failures are classified as `upstream_service`, retrying later is reasonable. If they are classified as `capability_bug`, we already know about it and it will show in the QP score.

The SQS is not a marketing number. It is computed from real test runs, with real weights, published in real code. If you want to verify any of this, the scoring logic lives in our open-source MCP server, and the quality endpoint is one HTTP call away.

## Try It

Pick any capability from our catalog and check its quality score:

```bash
curl https://strale-production.up.railway.app/v1/quality/email-validate
```

No signup needed. If you are building agents and care about data quality, we would like to hear how you think about scoring the tools your agents depend on.

---

## Self-reply comment (post after publishing, then remove this section):

"Curious to hear from others building agent tool ecosystems: how do you approach quality scoring for the tools your agents call? We went with the dual-profile model because conflating code quality with upstream reliability gave us misleading signals. But I wonder if there are other dimensions worth tracking separately -- things like data freshness, response completeness, or coverage breadth. What quality signals do you wish you had before your agent makes a tool call?"

---

## FACT-CHECK LOG (remove before publishing)

| # | Claim | Source | Verified |
|---|---|---|---|
| 1 | 297 capabilities | User-provided, verified Apr 16 | YES |
| 2 | QP weights: correctness 50%, schema 31%, error_handling 13%, edge_cases 6% | `quality-profile.ts` lines 54-59 (`QP_WEIGHTS`) | YES |
| 3 | QP excludes upstream failures entirely | `quality-profile.ts` line 227: `if (!row.passed && isExternalServiceFailure(row.failure_reason)) continue;` | YES |
| 4 | Rolling window of 10 most recent runs | `sqs-constants.ts` line 6: `ROLLING_RUNS = 10` | YES |
| 5 | Recency weights: 1.00 down to 0.30 | `sqs-constants.ts` line 10: `[1.00, 0.95, 0.90, 0.85, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30]` | YES |
| 6 | Minimum 5 test runs to qualify | `sqs-constants.ts` line 4: `MIN_RUNS = 5` | YES |
| 7 | RP weights vary by capability type (4 types) | `reliability-profile.ts` lines 61-86 (`RP_WEIGHTS` for deterministic, stable_api, scraping, ai_assisted) | YES |
| 8 | Deterministic latency weight 50% | `reliability-profile.ts` line 63: `latency: 0.50` | YES |
| 9 | Scraping current_availability weight 35% | `reliability-profile.ts` line 73: `current_availability: 0.35` | YES |
| 10 | RP counts upstream failures (unlike QP) | `reliability-profile.ts` line 224 comment: "Get ALL test results (RP counts upstream failures)" | YES |
| 11 | Circuit breaker: 3 consecutive failures = -30, floor 20 | `reliability-profile.ts` lines 397-399 | YES |
| 12 | Circuit breaker: 5 consecutive test failures = -20, floor 30 | `reliability-profile.ts` lines 408-411 | YES |
| 13 | Recovery: 3 consecutive passes | `reliability-profile.ts` lines 414-424 | YES |
| 14 | 5x5 matrix values (all 25 cells) | `sqs-matrix.ts` lines 40-47 (`MATRIX` constant) | YES |
| 15 | Grade thresholds: A>=90, B>=75, C>=50, D>=25, F<25 | `quality-profile.ts` lines 90-96 and `reliability-profile.ts` lines 109-115 | YES |
| 16 | Matrix interpolates +/-3 points within cell | `sqs-matrix.ts` line 87: `* 3` | YES |
| 17 | Public endpoint: GET /v1/quality/:slug, no auth | `quality.ts` line 4: "PUBLIC ENDPOINT -- intentional, no auth required" | YES |
| 18 | Cache-Control: public, max-age=300 (5 min) | `quality.ts` line 98 | YES |
| 19 | Response includes qualification_estimate when pending | `quality.ts` lines 65-67 | YES |
| 20 | Response includes failure_classification breakdown | `quality.ts` lines 147-149 | YES |
| 21 | 242 A-grade out of 281 scored (86%) | User-provided, verified Apr 16 DB query | YES |
| 22 | 1,805 test suites | User-provided, verified Apr 16 | YES |
| 23 | Tiered scheduling: 6h/24h/72h | CLAUDE.md: "A: 6h = pure-computation, B: 24h = stable APIs, C: 72h = scraping" | YES |
| 24 | Latency thresholds for deterministic: excellent <100ms, good <500ms, acceptable <2000ms | `reliability-profile.ts` line 94 | YES |
| 25 | Latency thresholds for scraping: excellent <5000ms, good <15000ms, acceptable <30000ms | `reliability-profile.ts` line 96 | YES |
| 26 | Upstream health: deterministic always returns 100 | `reliability-profile.ts` lines 321-327 | YES |
| 27 | QP needs correctness + at least 1 other factor with data | `quality-profile.ts` line 251 | YES |
| 28 | QP:A/RP:C = 65, QP:C/RP:A = 70 (asymmetry claim) | `sqs-matrix.ts` lines 42-44: A/C=65, C/A=70 | YES |
