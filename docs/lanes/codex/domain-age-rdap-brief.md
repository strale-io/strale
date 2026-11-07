Intent: Codex builder brief: domain-age-check reads RDAP first and names its upstream failures.

# Brief: domain-age-check answers through RDAP, with WHOIS as the fallback

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-07, from the daily run's paying-failure sweep (`handoff/_general/from-code/2026-11-07-checkin-morning.md`, item 3 of "Next session").
- **Branch:** push only `codex/domain-age-rdap`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. There are no secrets in it, and none is needed: RDAP and WHOIS are public and keyless. **All tests run offline**, with mocked `fetch` and a mocked socket. Never reach the network from a test.

## Why

`domain-age-check` failed 20 of 289 paid calls in the 7 days to 2026-11-07 (6.9%), every one as "Service temporarily unreachable". It has done so since 2026-11-01.

That text is the mask from `sanitizeFailureReason` in `apps/api/src/lib/sanitize.ts`. It fires on any `ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND` or `EAI_AGAIN` that the raw TCP WHOIS client in `apps/api/src/capabilities/domain-age-check.ts` throws. So we cannot see which registry server failed or why.

**Unverified hypothesis:** ICANN ended the obligation for gTLD registries and registrars to run port-43 WHOIS in January 2025, in favour of RDAP. Several gTLD WHOIS servers in `TLD_SERVERS` may now refuse, reset or rate-limit connections. RDAP (RFC 9082/9083, JSON over HTTPS) is the official successor and is the preferred lane under DEC-20261023-A: an official protocol, read per call, keyless.

The design below must not depend on the hypothesis being right. It improves the result either way.

## What to change

1. **Read first:**
   - `apps/api/src/capabilities/domain-age-check.ts`
   - `apps/api/src/capabilities/whois-response-cap.test.ts` (existing tests that import it)
   - `apps/api/src/lib/safe-fetch.ts` (the outbound HTTP helper; use it, or match how sibling capabilities call public HTTPS APIs with `AbortSignal.timeout`)
   - `apps/api/src/lib/capability-refusal.ts`
   - `config/reference-data.yaml`, row `domain-age-check-tld-servers`
2. **RDAP lookup in a small module**, for example `apps/api/src/lib/rdap/domain.ts`:
   - **Find the RDAP base for a TLD** from the IANA bootstrap file `https://data.iana.org/rdap/dns.json` (RFC 9224).
     - Cache it in memory for 24 hours.
     - Time out at 5 s.
     - If the bootstrap fetch fails, carry on to WHOIS rather than fail the call.
     - Do not hard-code RDAP bases; the bootstrap is the authority.
   - **Query** `GET {base}domain/{domain}` with `Accept: application/rdap+json` and an 8 s timeout. Cap the response size the way `MAX_WHOIS_RESPONSE_BYTES` caps WHOIS; reuse the existing cap helper if it fits.
   - **Parse:**
     - `events[]`, where `eventAction` `registration` gives the creation date and `expiration` gives the expiry;
     - the registrar from the `entities[]` entry with role `registrar`: its `vcardArray` `fn`, else its `handle`.
   - **HTTP 404** means the domain is not registered. Return the existing "not found" shape, which needs to exist or be added: `age_days: null`, `risk_indicator: "unknown"`, a `note`. Never return an error for it.
3. **Order in the executor:**
   - Try RDAP first when the bootstrap names a base for the TLD.
   - Fall back to the existing WHOIS path when there is no RDAP base, or RDAP times out, returns 5xx or 429, or returns no registration event.
   - Keep `TLD_SERVERS` for that fallback, so ccTLDs without RDAP still work.
   - `provenance.source` becomes `"rdap"` or `"whois"`, matching what answered, and `provenance.upstream` names the host that answered: the public registry RDAP or WHOIS host, which is not internal.
4. **Name the failure when both paths fail.** Throw an error that says, in caller-safe words:
   - which path failed;
   - which public registry host;
   - the class of failure: timeout, connection refused, connection reset, or HTTP status.

   **Write it without the raw `ECONN*`/`ETIMEDOUT` tokens.** Those tokens trigger the generic mask in `sanitizeFailureReason`, and the point is that the cause becomes visible. Keep the message free of stack traces and of anything but the public registry hostname. If `sanitize.ts` has a test listing allowed message shapes, add one for this.
5. **Output shape unchanged.** Same fields, same `risk_indicator` thresholds. Update `manifests/domain-age-check.yaml`:
   - `data_source` names RDAP (IANA bootstrap) with WHOIS fallback;
   - add a limitation: "Registration dates come from the registry's RDAP service, or WHOIS where the TLD has no RDAP service; some ccTLD registries publish no creation date."
6. **Reference-data register.** In `config/reference-data.yaml`, edit row `domain-age-check-tld-servers` so `holds` says the map is now the WHOIS fallback only. Run `npm run refdata:check`.
7. **Out of scope:**
   - no change to `whois-lookup.ts`, which is a separate tool with its own brief later;
   - no new vendor;
   - no paid API;
   - no retries beyond the single RDAP-then-WHOIS fallback.

## Tests

Add `apps/api/src/capabilities/domain-age-check.test.ts`, or extend the existing file. Use a mocked `fetch` and a mocked WHOIS socket, offline. Each must fail without the change:

1. RDAP answers with a registration event → `provenance.source === "rdap"` and the right `age_days`, fixing `Date.now`.
2. RDAP 404 → the not-registered result, not an error.
3. RDAP 503 or a timeout → falls back to WHOIS, and `source === "whois"`.
4. The TLD is absent from the bootstrap → WHOIS straight away, with no RDAP query sent.
5. The bootstrap fetch fails → WHOIS, and the call still succeeds.
6. Both fail with a reset socket → the thrown message names the registry host and "connection reset", and `sanitizeFailureReason(message)` does **not** turn it into "Service temporarily unreachable".
7. The bootstrap is fetched once per 24 h across two calls (cache).
8. An oversized RDAP body is capped and refused cleanly.

Keep the existing `whois-response-cap.test.ts` passing.

## Done when

- `cd apps/api && npx vitest run src/capabilities/domain-age-check src/capabilities/whois-response-cap src/lib/sanitize` passes.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first, if typecheck needs them.
- `npm run refdata:check` passes.
- `docs/lanes/codex/domain-age-rdap-report.md` lists:
  - the files changed;
  - the precedence and fallback rules;
  - each test and what it pins;
  - anything not done.
