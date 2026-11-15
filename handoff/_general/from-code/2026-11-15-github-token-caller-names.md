Intent: close follow-up 1 of 2026-11-15-strale-master-codex-corrections.md (GITHUB_TOKEN sent for caller-supplied names).

## Finding
- github-repo-compare sent GITHUB_TOKEN with the caller's text in the path unencoded. `../user` resolved to
  `/user` (the token owner's record), and any private repository the token can read was answered as if public.
- github-user-profile sent the token too; its path was encoded, so the exposure was the token's scope only.
- social-profile-check keeps the token: the name is a checked login on a fixed `/orgs/` path, organisations
  are public, and only the status is read. A comment there says why.

## Change
- New `apps/api/src/capabilities/lib/github-public.ts`: login and owner/repo checks, an unauthenticated GET,
  and rate-limit errors without "403" in the message, as github-repo-analyze already does.
- Both tools refuse a malformed name before any request (`'<field>' must be ...`, a caller refusal), and
  send no Authorization header. Their manifests already promised public data only.
- `config/env-manifest.yaml` GITHUB_TOKEN purpose updated.
- Tests: `apps/api/src/capabilities/github-public-reads.test.ts`; its 14 "failure:" tests fail against the
  pre-fix executors and pass after.

## Left open
- github-user-profile's repository-list leg still turns a failed fetch into `recent_repos: []` (a baselined
  silent catch; `recent_repos` is guaranteed in the manifest, so a fix changes the output contract).
- Trade-off: both tools now use GitHub's anonymous limit (60 requests an hour per IP, shared with
  github-repo-analyze); a limit is reported as retry-shortly, not a suspended tool.
