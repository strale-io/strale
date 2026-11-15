Intent: Codex builder brief: four paid capabilities stop charging for an answer that is wrong: a GB customs number called invalid, a broken holiday list kept for a day, a README missed on its spelling, and a registered domain called available.

# Brief: eori-validate, holiday-calendar, github-repo-analyze and startup-domain-check stop billing a wrong answer

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-15. Founder go-ahead in session the same day.
  - Source: promise-audit T1 in `docs/programs/promise-audit/tracks.yaml`, the lists of defects "found in the wave 2a review" and "found in wave 2b, not fixed there". The master re-checked each against `origin/main` at 842ca71a.
  - A sibling brief, `security-audit-severity`, covers dependency-audit and package-security-audit. Do not touch those two files.
- **Branch:** push only `codex/billed-wrong-answers-4`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets and no production data. All tests are offline vitest unit tests with `fetch` and `node:dns/promises` stubbed, like the existing ones.
- **Read first:**
  - the four executors: `apps/api/src/capabilities/eori-validate.ts`, `holiday-calendar.ts`, `github-repo-analyze.ts`, `startup-domain-check.ts`, and their existing tests (`rg -l "eori-validate|holiday-calendar|getHolidays|github-repo-analyze|startup-domain-check" apps/api/src --glob '*.test.ts'`);
  - `apps/api/src/lib/upstream-result.ts` and `apps/api/src/lib/capability-refusal.ts` (`inputRefusal`): an upstream that did not answer, versus a caller mistake;
  - `apps/api/src/lib/rdap/domain.ts` (`getRdapBase`, `lookupRdapDomain`) and `apps/api/src/capabilities/domain-age-check.ts`, which already uses them;
  - the four manifests under `manifests/`.

## 1. eori-validate: a GB number is refused, not called invalid

**Why.** Since 2021 the EU EORI service (`ec.europa.eu/.../eos/validation`) no longer holds Great Britain numbers; HMRC does. A real GB EORI sent to the EU service comes back "Not valid", and we bill `valid: false`. That tells a customer a genuine British trader is fake. Northern Ireland numbers (`XI`) are still in the EU service and are unaffected.

**Change:**
- After the format check passes and before `validateEori` is called, a number whose prefix is `GB` throws `inputRefusal`, with:
  - field `eori`;
  - a message saying GB EORI numbers are held by HMRC, not the EU service, so this capability cannot verify them;
  - a fix line pointing to HMRC's "Check an EORI number" service.

  No request is sent to the EU service.
- `XI` and every EU prefix are unchanged.
- Add a manifest limitation: "Great Britain (GB) EORI numbers are not in the EU EORI service and are refused, not checked. Northern Ireland (XI) numbers are checked."

Do not add an HMRC integration. That is a separate decision.

## 2. holiday-calendar: only a holiday list is cached

**Why.** `getHolidays` caches whatever `JSON.parse` returns for 24 hours. A 200 whose body is an object, `null` or a string (an upstream error page served as 200, say) is cached as the country's holidays, and every caller reads it for a day.
- `getHolidays` is exported and also used by `business-day-check.ts` and `public-holiday-lookup.ts`, so the wrong answer spreads.
- Those callers map over it, so a non-list body either throws in the middle of the handler or is read as "no holidays". The second case bills every day as a working day.

**Change:**
- After parsing, require `Array.isArray(data)`, and that every element is an object with a string `date`.
- Otherwise throw `UpstreamUnavailableError` for "Nager.Date", with code `unparseable`, and **do not cache it**. The next call retries.
- An empty list `[]` is a real answer: the country has no holidays listed for that year. It is still cached, as today.

## 3. github-repo-analyze: a README is found whatever its name

**Why.** The executor fetches only `raw.githubusercontent.com/<owner>/<repo>/HEAD/README.md`. A repository whose README is `readme.md`, `README.rst`, `README` or `docs/README.md` reads as "No README". That value goes into the model prompt and the billed analysis.

**Change:**
- Replace the raw `README.md` fetch with GitHub's README endpoint, `GET {apiBase}/repos/{owner}/{repo}/readme`, sending `Accept: application/vnd.github.raw`. It returns the repository's preferred README whatever its name or folder.
- Send it with the same headers as the other API calls (the token when present).
- Handle status codes the same way the raw fetch does today:
  - 404 reads as no README;
  - a 403 is read through the existing `ghDeclined` path;
  - other failures go through `httpUnavailable`.
- Keep the existing `MAX_REPO_FILE_BYTES` truncation.
- `package.json` stays on the raw fetch.
- The header comment and the source label name the API endpoint, not the raw host, for the README.

Note in a code comment that this adds one API request per call, counted against the GitHub rate limit, where the raw fetch was not. Do not add caching.

## 4. startup-domain-check: NXDOMAIN is confirmed by the registry before "available"

**Why.** A domain reads `available: true` on an NXDOMAIN from `dns.resolve4`. A registered domain with no nameservers also answers NXDOMAIN: a newly bought domain, one on client hold, one in redemption. So does a domain whose DNS is simply not set up. The file's own header says a wrong "available" is the worst answer this tool can give.

**Change:**
- Where `isDomainAvailable` gets `ENOTFOUND`, confirm through RDAP before answering `true`. Use `getRdapBase(tld)` and `lookupRdapDomain(base, domain)` from `lib/rdap/domain.ts`:
  - RDAP `not_found` → available (`true`);
  - `found` or `no_registration_event` → taken (`false`), and `current_owner` reads `"Registered (no DNS)"`, without the website HEAD probe;
  - no RDAP base for the TLD, or the RDAP lookup throws → `available: null`, with `RDAP for <domain>` named in `unavailable_sources`. This is exactly how an unanswered DNS lookup is treated today, and the call still answers when another extension did.
- A DNS answer (records, or `ENODATA`) stays "taken" without an RDAP call, so RDAP runs only for names DNS says do not exist.
- Keep the rule that an error message names the extension, never the caller's name. Read the comment on `isDomainAvailable` about the breaker before writing any new message.
- Update the header comment and add a manifest limitation: "A domain is reported available only when DNS has no such name and the registry's RDAP service confirms it is not registered; when RDAP cannot answer, the domain reads unchecked (null)."

## Leave the rest alone

- No change to prices, categories, test fixture inputs, routing, billing, the circuit breaker or the database.
- No migration and no new environment variable.
- No change to dependency-audit or package-security-audit.

## Tests

Every new test must fail against `origin/main`:

1. eori-validate with `GB123456789000`: `inputRefusal` on field `eori`, and the fetch stub is never called. `XI123456789000` still reaches the EU service.
2. getHolidays with a 200 body of `{"message":"error"}`: throws `UpstreamUnavailableError`. A second call fetches again (assert two fetches), proving nothing was cached. A 200 of `[]` is returned and cached (one fetch for two calls).
3. business-day-check (or public-holiday-lookup) on a non-list 200: the call throws, rather than answering with no holidays.
4. github-repo-analyze where the README endpoint answers 200 with content: the content is used, and the request URL is `/repos/<o>/<r>/readme` with the raw Accept header. Where it answers 404: "No README", as today.
5. startup-domain-check:
   - NXDOMAIN plus RDAP `found` → `available: false` with `current_owner: "Registered (no DNS)"`;
   - NXDOMAIN plus RDAP `not_found` → `true`;
   - NXDOMAIN plus an RDAP throw → `null`, with `RDAP for <domain>` in `unavailable_sources`;
   - a DNS answer → `false`, with no RDAP call (assert on the stub).

   Stub the RDAP helpers through the module boundary, or `fetch`, whichever the existing domain-age-check tests use.

An existing test whose expectation encodes the old wrong answer (for example, NXDOMAIN alone reading `available: true`) may change. Each change gets a one-line comment naming this brief. Any other existing test that fails is a defect in the implementation: stop and say so in the report.

## Verification to run

- `npm --workspace=apps/api exec vitest run` on the touched test files (name them in the report)
- `npm run typecheck`
- `npm run claims:check`

Not yours to run: `validate-capability.ts`, the readiness check and the smoke test. They need the database, and the review session runs them.

## Report

Write `docs/lanes/codex/billed-wrong-answers-4-report.md` with: files changed, tests added (names), the verification commands and their results, every existing test you changed and why, and anything not done and why.
