Intent: Close the "not done" item of `2026-09-04-free-public-api-agent-capabilities.md` — the eight
capabilities from PR #518 are now rows in production — and fix the onboarding script bug that blocked
it under `--strict`.

## What happened

- Petter granted the production write credential in session (`DATABASE_URL_WRITE` in the root
  `.env`, same value as `DATABASE_URL`). Onboarding ran from this machine, one capability at a
  time, with `--strict`: academic-paper-search, paper-details, arxiv-search, pubmed-search,
  hacker-news-search, sec-edgar-filings, cve-details, usgs-earthquake-search. Every run reported
  `lifecycle_state=validating, visible=false`, `hook_failed=false`; each row carries its five test
  suites and two limitations. The grant line was removed again afterwards, restoring the
  "no write credential for autonomous sessions" default in `config/env-manifest.yaml`.
- The first strict pass aborted all eight on `type "array"` fixture assertions. The harness
  (`test-runner.ts`) has always resolved arrays as `"array"`, and 123 manifests assert it, but
  `scripts/onboard.ts`'s own verifier used a bare `typeof`, so every array-valued guaranteed field
  read as `object`. One-line fix in this PR; the same strict runs then passed.

## What happens next without anyone's involvement

Rows are dark (invisible, off the x402 rail). The hourly free-only harness starts exercising the
five suites; `capability-promotion` (enforcement is on in Railway) lifts each one to visible and
x402-enabled after a green week, at most three per day.
