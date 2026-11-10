---
slug: page-speed-test-api
title: "Page speed test API: read Lighthouse performance results"
description: "Run mobile or desktop Lighthouse tests through Strale’s API. Read scores, milliseconds and layout shifts, and distinguish lab measurements from real-user data."
group: web
framework: "REST API"
language: "cURL"
tools: [page-speed-test, header-security-check]
---
Use `page-speed-test` to run a public URL through Google PageSpeed Insights and return selected Lighthouse results as JSON. A successful API-key call costs {{price:page-speed-test}}. The result contains lab measurements and suggestions, not a real-user Core Web Vitals assessment.

## Run a mobile test

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "page-speed-test",
    "inputs": { "url": "https://web.dev/", "strategy": "mobile" },
    "max_price_cents": 5
  }'
```

Use a public URL that Lighthouse can load without signing in. `strategy` accepts `mobile` or `desktop` and defaults to `mobile`. Keep it the same when comparing results before and after a change. If the page cannot be loaded, handle the error separately from a low performance score.

## Read the measurements

In `output`, `performance_score` runs from 0 to 100. Strale assigns `grade` from that score: A at 90 or above, B at 70–89, C at 50–69, D at 30–49 and F below 30. The letter is Strale’s grouping, not a separate measurement.

- `lcp_ms`: Largest Contentful Paint, in milliseconds.
- `fcp_ms`: First Contentful Paint, in milliseconds.
- `tbt_ms`: Total Blocking Time during the lab test, in milliseconds.
- `ttfb_ms`: server response time, in milliseconds.
- `speed_index`: Speed Index, also in milliseconds despite the field name.
- `cls_score`: Cumulative Layout Shift, a score with no time unit.

For example, `lcp_ms: 2400` means 2.4 seconds. Individual values can be null when Lighthouse does not supply a measurement. Read null as unavailable, not zero.

## Keep lab and field data separate

[Google distinguishes lab tests from field data](https://developers.google.com/speed/docs/insights/v5/about). This Strale tool returns Lighthouse lab results; it does not return CrUX real-user data, INP or a Core Web Vitals pass/fail assessment. TBT is not an INP measurement. Avoid presenting a lab result as proof of every visitor’s experience.

## Choose the next improvement

Read `opportunities` for suggested changes and estimated savings, and `diagnostics` for supporting findings. Estimates can overlap, so do not sum them or promise the stated saving. Make one change, repeat tests with the same strategy and compare the trend. Scheduling those tests is your application’s responsibility.

See [Page Speed Test](/tools/page-speed-test) for the complete inputs and limitations. [Header Security Check](/tools/header-security-check) is a separate check for HTTP security headers; it does not measure page speed.
