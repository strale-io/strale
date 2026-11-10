---
slug: http-security-headers-api
title: "HTTP security headers API: read a grade and plan fixes"
description: "Check a public URL’s response headers, understand Strale’s presence-based grade and review CSP, HSTS and other findings before changing configuration."
group: web
framework: "REST API"
language: "cURL"
tools: [header-security-check, ssl-check, dns-lookup, page-speed-test]
---
Use `header-security-check` to retrieve present and missing HTTP security headers as JSON. A successful API-key call costs {{price:header-security-check}}. Its grade measures header presence; it is not a vulnerability scan or a certificate that a website is secure.

## Check a public page

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "header-security-check",
    "inputs": { "url": "https://web.dev/" },
    "max_price_cents": 5
  }'
```

Replace the example URL with the public page you maintain. The illustration on the tool page is not a live assessment of web.dev. A real call fetches the target’s response at that time. The tool does not change its configuration or start scheduled monitoring.

## Read the response status before the grade

Headers come from the fetched response after permitted redirects. Inspect `response_status`: a 404 or other error page can still return headers and receive a grade. The output `url` echoes the requested URL; it is not a report of the final redirect destination. Network failures and blocked private destinations return errors rather than a grade.

`present` lists non-empty observed header values, truncated to 200 characters. `missing` lists absent scored headers with generic suggestions. CORS headers may be returned separately; their presence does not change the grade.

## Understand the scoring

The score starts at 100. Missing `Strict-Transport-Security` or `Content-Security-Policy` subtracts 25 points each. Missing `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy` subtracts 10 each. Deprecated `X-XSS-Protection` does not affect the score.

Grades are A for 90–100, B for 80–89, C for 60–79, D for 40–59 and F below 40. Missing only CSP produces 75, grade C, as in the illustration.

A non-empty header earns credit even if its value is ineffective. The check does not parse CSP directives, assess HSTS duration or test browser enforcement. It also counts a missing `X-Frame-Options` even when a CSP `frame-ancestors` policy supplies framing protection. Review the policy values rather than trying to maximise the grade alone.

## Review changes before applying them

Treat recommendations as starting points. A [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy) must fit the scripts, styles and other resources your application uses. Test it against real user flows before enforcement. Do not add a generic restrictive policy just to remove a finding.

For [HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security), verify HTTPS support before extending the policy to subdomains. A header being present does not prove it is suitable for your deployment.

After a reviewed configuration change, call the tool again using the same URL and compare status, values and missing headers. Use [SSL Certificate Check](/tools/ssl-check), [DNS Lookup](/tools/dns-lookup) and [Page Speed Test](/tools/page-speed-test) for separate checks. None turns this header grade into a complete security assessment.

See [Security Header Check](/tools/header-security-check) for the example and API fields.
