Intent: make strale-mcp match the sign-up URL on both strale.dev and strale.io (DEC-20261105-A).

Done: `mentionsSignupUrl` in packages/mcp-server/src/tools.ts, tests, version 0.2.10 (package.json, both server.json, lockfile). Not yet published.
Next: review, merge, tag `strale-mcp@0.2.10` (dry run first), run the production smoke test; only then change the API sign-up text (SWITCH-OVER-READINESS item 11).
