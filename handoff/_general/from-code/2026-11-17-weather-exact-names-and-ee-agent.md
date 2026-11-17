Intent: Close weather LOW follow-ups 1–2 and fix the Estonian directors ingest, which had failed every day.

[BACKFILL] Two Codex-built PRs merged on 2026-11-17 through the merge queue:

- strale-io/strale#1088, weather-lookup exact names. "Washington DC", "Sacramento, CA" and "Winston Salem NC" now resolve.
  - Punctuation is ignored and hyphens become spaces when comparing names.
  - On the comma path, exact-name hits are checked first, then all hits. "Bombay, IN" still resolves, and "Richmond, CA" still refuses as ambiguous.
  - Built in two Codex rounds (`docs/lanes/codex/weather-exact-name-qualifiers*`).
  - Independent Claude review: GO at 71738fa4, rounds: 2.
  - Open LOW follow-ups:
    - prefer populated-place feature codes;
    - the dash set lacks the figure dash and the minus sign;
    - the comma-path fallback can return a differently named hit in the right region when exact namesakes exist only elsewhere. This is the behaviour from before round 1.
- strale-io/strale#1089, `ingest-ee-directors`. It now sends `STRALE_USER_AGENT` on the HEAD and GET (DEC-20261023-A) and logs a block status as `ingest-ee-directors-source-blocked`. No proxy and no retry under another identity.
  - Independent review: GO at b6e03f0d, rounds: 1.
  - Open MEDIUM follow-up: the tests cover the helpers but not their wiring in `runIngestOnce`. Fix with a `fetchImpl` seam or a source-shape assertion.
  - Open LOW follow-up: the job-local `EeSourceBlockedError` duplicates `SourceBlockedError` in `site-access.ts`.

Production:
- Build 33ae29fe (#1089) was verified live via `/health`. The weather build is pending verification.
- The EE ingest failed with HEAD 403 on 2026-11-15 and 2026-11-16 at about 10:15 UTC. The next tick is about 2026-11-17 10:15 UTC.
  - If it logs `ok`, the user agent was enough.
  - If it logs `ingest-ee-directors-source-blocked`, draft a RIK open-data access request row in `docs/company/OUTBOX.yaml` for the inbox routine.
  - A scheduled check fires at 10:30 UTC.

Branch cleanup: the proxy refuses remote branch deletes. These branches remain on origin, all merged or superseded:
- `codex/weather-exact-name-qualifiers` and `-2`
- `codex/ee-directors-user-agent`
- `codex/ee-directors-honest-agent`
- `codex/weather-qualifier-followups`
- `codex/weather-place-qualifiers-2` and `-3`
- `docs/readme-package-status`

Journal filing is left for the next session with Notion access.

Next authorised action: check the EE ingest tick at about 10:30 UTC and act on its outcome | Owner: Strale master | Blocker: none
