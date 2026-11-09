Intent: fix social campaign attribution and require tracked links on future Strale X and LinkedIn schedules without changing confirmed publishing times.

Mode: Full. User explicitly authorised the tracking fix and scheduled-post link updates on 2026-11-09. Work is isolated on fix/social-attribution from origin/main 0bd12f03; shared main and other worktrees are untouched.

Website: initialise Umami only after installing a URL sanitiser. Keep raw queries and fragments excluded; rebuild only bounded social campaign labels. Carry those labels on public navigation without browser storage. Pass the source into the existing signup-source API contract. Track tool starts/outcomes, signup CTA clicks and successful signup responses without emails, keys, inputs or outputs.

Scheduling: scripts/social/typefully_tracking.py is the reusable write boundary. It adds tags, rejects inert planning, preserves confirmed timestamps and platform/media/thread content, detects concurrent edits and rereads the result. No vendor-wide policy is claimed: manual Typefully writes remain outside this client.

Verification and deployment evidence will be recorded in the linked PR and local campaign output receipts. Independent technical and product reviews are required before merge. No backend schema, auth, payment or activation-identity change is included.

PR #985 merged as ba4a1d4c. All 21 Typefully posts (11 X, 10 LinkedIn) have tagged links, confirmed status and their original publishing times; all 18 media assets are ready. The reviewed client is installed in the existing local helper and the campaign workspace AGENTS.md requires it for future scheduling.

Production verification confirmed accepted Umami campaign and signup events, but exposed a demo-status envelope mismatch: POST /v1/do returns result.status. Focused followup branch fix/free-tool-tracking, code 4fba43ae, corrects that field. Browser success and failure cases pass, as do API typecheck and Astro check. Evidence: [test receipt](../../../archive/receipts/2026-11-09-test-run-free-tool-tracking.json). Technical and product reviews both GO, round 1; no unresolved findings. Simplification pass found no extra abstraction needed.

Next action: merge the reviewed followup after CI, redeploy the website, verify accepted live tool-completion and signup events, then record final evidence in the PR and local outputs/tracking-fix-nov09 receipts. Signup verification intercepts the register response and creates no real account. Remove only this session's worktree/branches after merge; shared main and other agents' work remain untouched.
