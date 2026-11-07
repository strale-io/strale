# Domain age RDAP implementation report

## Files changed

- `apps/api/src/lib/rdap/domain.ts` — IANA DNS bootstrap discovery/cache, bounded RDAP reads, and RDAP domain parsing.
- `apps/api/src/capabilities/domain-age-check.ts` — RDAP-first execution, WHOIS fallback, source/upstream provenance, not-registered handling, and caller-safe combined transport failures.
- `apps/api/src/capabilities/domain-age-check.test.ts` — offline RDAP/fallback/cache/size/failure coverage.
- `apps/api/src/capabilities/whois-response-cap.test.ts` — an offline IANA-bootstrap mock so the existing WHOIS cap test continues to exercise WHOIS without network access.
- `manifests/domain-age-check.yaml` — RDAP-first source and registration-date limitation.
- `config/reference-data.yaml` — identifies `TLD_SERVERS` as a WHOIS fallback map.
- `docs/lanes/codex/domain-age-rdap-report.md` — this report.

## Precedence and fallback rules

1. Read the IANA RDAP DNS bootstrap (cached in memory for 24 hours, with a five-second timeout).
2. When it names a base for the domain's TLD, query that registry's `domain/{domain}` endpoint with an eight-second timeout and a 256 KiB response cap.
3. An RDAP registration event answers the call. RDAP 404 answers with the existing unknown/not-registered shape and does not invoke WHOIS.
4. A missing bootstrap entry, bootstrap failure, RDAP transport/HTTP failure, oversized response, or missing registration event falls back once to the existing hard-coded WHOIS registry path.
5. The answering path sets `provenance.source` to `rdap` or `whois` and `provenance.upstream` to the public registry hostname.
6. If both attempted paths fail, the error names each path, its public registry host, and a caller-safe failure class without raw network error tokens.

## Tests and pinned behavior

1. RDAP registration event: fixes the clock and pins RDAP provenance, age calculation, expiry, registrar vCard parsing, and no WHOIS connection.
2. RDAP 404: pins a successful unknown/not-registered result rather than an error or fallback.
3. RDAP 503 and timeout: pin WHOIS fallback and WHOIS provenance.
4. TLD absent from bootstrap: pins direct WHOIS execution with no RDAP domain request.
5. Bootstrap fetch failure: pins successful WHOIS degradation.
6. RDAP HTTP failure plus reset WHOIS socket: pins both public hosts, the `connection reset` wording, absence of raw `ECONN*`/`ETIMEDOUT` tokens, and non-masking by `sanitizeFailureReason`.
7. Bootstrap cache: pins one bootstrap fetch across two calls inside 24 hours.
8. Oversized RDAP body: pins bounded refusal and clean WHOIS failure reporting.
9. Unread RDAP 404/503 bodies: pin explicit cancellation before returning or falling back, so keep-alive connections are released.
10. Bootstrap failure for a TLD without WHOIS fallback: pins the pre-existing unknown/error output rather than turning the bootstrap outage into a call failure.
11. Existing WHOIS response-cap suite: remains offline and pins early socket closure plus parsed leading fields.

## Anything not done

- `whois-lookup.ts` was not changed, as required.
- No vendor, paid API, retry loop, or hard-coded RDAP base was added.
- The database-backed onboarding validation/readiness and live smoke test were not run: this keyless brief requires all tests to stay offline and the environment has no `DATABASE_URL`. The manifest/static checks, focused offline tests, typecheck, and reference-data check were run instead.
