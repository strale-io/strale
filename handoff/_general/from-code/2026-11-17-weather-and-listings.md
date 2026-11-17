Intent: Fix the paid weather calls that failed in production, and correct outdated public package listings.

[BACKFILL] Two PRs merged on 2026-11-17 through the merge queue:

- strale-io/strale#1085, weather-lookup place resolution, built by Codex in three runs (`docs/lanes/codex/weather-place-qualifiers*`). It resolves qualifiers written without a comma ("Lagos Nigeria"), a trailing "City", two-letter US state codes and the `place` input alias. An ambiguous code refuses rather than returning a namesake ("Richmond CA"). Independent Claude review: GO at 8919d9dd, rounds: 2.
- strale-io/strale#1086, README: removes the deprecated `strale-semantic-kernel` row and labels `crewai-strale` and `composio-strale` maintenance only. This is a narrowing-only change under DEC-20260822-A. Independent review: GO at e2993371.

Open LOW weather follow-ups, all fail-safe (they refuse rather than return the wrong place):
1. Comma-path loose-name ambiguity: run the check on exact-name hits when there are any.
2. Accept "Washington, D.C." as well as "District of Columbia".
3. Prefer populated-place feature codes.

Listings still open: Smithery retry; mcp.so needs Petter's login.

Branch cleanup: this session cannot delete remote branches (the proxy refuses both the REST call and `git push --delete`). `codex/weather-place-qualifiers-2` and `-3` remain on origin, both merged through #1085; the stale-branch workflow or a session with delete rights removes them.

Health 2026-11-17 01:52 CET: `ingest-ee-directors` shows ok=false with no recorded success. Not yet checked whether this is new.

Journal filing is left for the next session with Notion access.

Next authorised action: weather LOW follow-ups 1–2 as a Codex brief | Owner: Strale master | Blocker: none
