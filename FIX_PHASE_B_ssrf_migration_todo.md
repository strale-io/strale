# SSRF migration TODO (F-0-006, Phase C)

Inventory of capabilities that accept user-supplied URL-ish input (`url`,
`link`, `domain`, `hostname`, `website`) but do **not** currently call
`validateUrl` or `safeFetch`. Phase C's job is to walk this list, triage
each capability (does it fetch? does it forward to a third party? is the
input actually constrained?), and migrate.

Inventory produced by:
```
grep -L "validateUrl\|safeFetch" \
  $(grep -l "input\.url\|input\.link\|input\.domain\|input\.hostname\|input\.website" \
      apps/api/src/capabilities/*.ts)
```
on the commit that contains Fix 3. Re-run before starting Phase C — the
list drifts as new capabilities land.

## Triage buckets

**Bucket A — Direct `fetch(user_url)` → migrate to `safeFetch`**
These pass the URL straight to `fetch()`. Swap `fetch` for `safeFetch` and
drop any local `new URL(url)` + scheme check (safeFetch does it).

- [api-health-check.ts](apps/api/src/capabilities/api-health-check.ts) — already uses `validateUrl`, but `redirect: "follow"` bypasses it; migrate to `safeFetch`.
- [url-health-check.ts](apps/api/src/capabilities/url-health-check.ts) — same as above.
- [url-to-markdown.ts](apps/api/src/capabilities/url-to-markdown.ts) — `tryPlainFetch` has `redirect: "follow"`; migrate.
- [accessibility-audit.ts](apps/api/src/capabilities/accessibility-audit.ts)
- [cookie-scan.ts](apps/api/src/capabilities/cookie-scan.ts)
- [gdpr-website-check.ts](apps/api/src/capabilities/gdpr-website-check.ts)
- [header-security-check.ts](apps/api/src/capabilities/header-security-check.ts)
- [html-to-pdf.ts](apps/api/src/capabilities/html-to-pdf.ts)
- [image-resize.ts](apps/api/src/capabilities/image-resize.ts) — if input is a URL, SSRF to private network + image-decode DoS surface.
- [link-extract.ts](apps/api/src/capabilities/link-extract.ts)
- [meta-extract.ts](apps/api/src/capabilities/meta-extract.ts)
- [og-image-check.ts](apps/api/src/capabilities/og-image-check.ts)
- [page-speed-test.ts](apps/api/src/capabilities/page-speed-test.ts)
- [pdf-extract.ts](apps/api/src/capabilities/pdf-extract.ts) — if URL input, SSRF + parser DoS.
- [phishing-site-check.ts](apps/api/src/capabilities/phishing-site-check.ts)
- [redirect-trace.ts](apps/api/src/capabilities/redirect-trace.ts) — **special**: purpose is to follow redirects. Must still re-validate each hop. Do NOT use safeFetch's auto-follow; call safeFetch with `maxRedirects: 0` and follow manually, re-validating each Location. Document this.
- [robots-txt-parse.ts](apps/api/src/capabilities/robots-txt-parse.ts)
- [seo-audit.ts](apps/api/src/capabilities/seo-audit.ts)
- [sitemap-parse.ts](apps/api/src/capabilities/sitemap-parse.ts)
- [tech-stack-detect.ts](apps/api/src/capabilities/tech-stack-detect.ts)
- [trustpilot-score.ts](apps/api/src/capabilities/trustpilot-score.ts) — if URL input, migrate.
- [uptime-check.ts](apps/api/src/capabilities/uptime-check.ts)
- [website-carbon-estimate.ts](apps/api/src/capabilities/website-carbon-estimate.ts)
- [website-to-company.ts](apps/api/src/capabilities/website-to-company.ts)

**Bucket B — Forward URL to a third party (Browserless, Jina, Anthropic)**
`safeFetch` cannot protect the third party's outbound call. These MUST call
`validateUrl` upfront and refuse before forwarding. `web-extract.ts` is
now migrated; pattern:

```ts
await validateUrl(url);  // refuse on our end before Browserless is hit
// ...existing Browserless call with the original URL...
```

- [accessibility-audit.ts](apps/api/src/capabilities/accessibility-audit.ts) — uses Browserless.
- [amazon-price.ts](apps/api/src/capabilities/amazon-price.ts)
- [backlink-check.ts](apps/api/src/capabilities/backlink-check.ts)
- [company-enrich.ts](apps/api/src/capabilities/company-enrich.ts)
- [company-tech-stack.ts](apps/api/src/capabilities/company-tech-stack.ts)
- [contract-extract.ts](apps/api/src/capabilities/contract-extract.ts)
- [cookie-scan.ts](apps/api/src/capabilities/cookie-scan.ts)
- [html-to-pdf.ts](apps/api/src/capabilities/html-to-pdf.ts)
- [invoice-extract.ts](apps/api/src/capabilities/invoice-extract.ts)
- [job-posting-analyze.ts](apps/api/src/capabilities/job-posting-analyze.ts)
- [landing-page-roast.ts](apps/api/src/capabilities/landing-page-roast.ts)
- [pdf-extract.ts](apps/api/src/capabilities/pdf-extract.ts)
- [pricing-page-extract.ts](apps/api/src/capabilities/pricing-page-extract.ts)
- [privacy-policy-analyze.ts](apps/api/src/capabilities/privacy-policy-analyze.ts)
- [product-reviews-extract.ts](apps/api/src/capabilities/product-reviews-extract.ts)
- [return-policy-extract.ts](apps/api/src/capabilities/return-policy-extract.ts)
- [screenshot-url.ts](apps/api/src/capabilities/screenshot-url.ts)
- [social-post-generate.ts](apps/api/src/capabilities/social-post-generate.ts)
- [structured-scrape.ts](apps/api/src/capabilities/structured-scrape.ts)
- [terms-of-service-extract.ts](apps/api/src/capabilities/terms-of-service-extract.ts)
- [youtube-summarize.ts](apps/api/src/capabilities/youtube-summarize.ts)
- [lib/web-provider.ts](apps/api/src/capabilities/lib/web-provider.ts) — shared helper; fix here covers multiple callers.
- [lib/browserless-extract.ts](apps/api/src/capabilities/lib/browserless-extract.ts) — same.
- [lib/jina-reader.ts](apps/api/src/capabilities/lib/jina-reader.ts) — same.

**Bucket C — Host/domain input, not URL**
These use domain or hostname, often for DNS/TCP rather than HTTP. Need
`validateHost` (already exists) or equivalent. Already partially done.

- [dns-lookup.ts](apps/api/src/capabilities/dns-lookup.ts) — DNS only, low risk, but should still refuse `.internal` hosts.
- [domain-age-check.ts](apps/api/src/capabilities/domain-age-check.ts)
- [domain-reputation.ts](apps/api/src/capabilities/domain-reputation.ts)
- [email-deliverability-check.ts](apps/api/src/capabilities/email-deliverability-check.ts)
- [email-pattern-discover.ts](apps/api/src/capabilities/email-pattern-discover.ts)
- [ens-resolve.ts](apps/api/src/capabilities/ens-resolve.ts)
- [mx-lookup.ts](apps/api/src/capabilities/mx-lookup.ts)
- [port-check.ts](apps/api/src/capabilities/port-check.ts) — already uses `validateHost`; verify.
- [ssl-certificate-chain.ts](apps/api/src/capabilities/ssl-certificate-chain.ts) — already uses `validateHost`; verify.
- [ssl-check.ts](apps/api/src/capabilities/ssl-check.ts) — already uses `validateHost`; verify.
- [whois-lookup.ts](apps/api/src/capabilities/whois-lookup.ts)

**Bucket D — URL argument but passed to a hardcoded external API**
The user's value is a parameter, not the destination. Lower risk, but
should still validate if the input type is a URL. Skim these for whether
the hostname ever ends up in a URL that `fetch` opens.

- [api-mock-response.ts](apps/api/src/capabilities/api-mock-response.ts)
- [competitor-compare.ts](apps/api/src/capabilities/competitor-compare.ts)
- [github-repo-analyze.ts](apps/api/src/capabilities/github-repo-analyze.ts)
- [http-to-curl.ts](apps/api/src/capabilities/http-to-curl.ts) — generates curl, probably fine.
- [image-to-text.ts](apps/api/src/capabilities/image-to-text.ts)
- [linkedin-url-validate.ts](apps/api/src/capabilities/linkedin-url-validate.ts)
- [nginx-config-generate.ts](apps/api/src/capabilities/nginx-config-generate.ts)
- [receipt-categorize.ts](apps/api/src/capabilities/receipt-categorize.ts)
- [resume-parse.ts](apps/api/src/capabilities/resume-parse.ts)
- [vasp-non-compliant-check.ts](apps/api/src/capabilities/vasp-non-compliant-check.ts)
- [vasp-verify.ts](apps/api/src/capabilities/vasp-verify.ts)

## Phase C process

For each file: read it, decide the bucket, apply the fix, add a test case
(or `.test.todo.ts` placeholder if vitest is still absent). Budget
~5 min per capability average → ~4-5 hours for the whole list.

Migrate the shared helpers (`lib/web-provider.ts`, `lib/browserless-extract.ts`,
`lib/jina-reader.ts`) first — they cover multiple callers in one change.

## Sanity check on finish

After migration, re-run the inventory grep. The only capabilities that
should still appear are those that demonstrably do NOT make network
calls with user-controllable hostnames (Bucket D survivors). Every such
case must have a one-line comment stating why no validation is needed.
