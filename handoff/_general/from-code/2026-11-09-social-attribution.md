Intent: fix social campaign attribution and require tracked links on future Strale X and LinkedIn schedules without changing confirmed publishing times.

Mode: Full. User explicitly authorised the tracking fix and scheduled-post link updates on 2026-11-09. Work is isolated on fix/social-attribution from origin/main 0bd12f03; shared main and other worktrees are untouched.

Website: initialise Umami only after installing a URL sanitiser. Keep raw queries and fragments excluded; rebuild only bounded social campaign labels. Carry those labels on public navigation without browser storage. Pass the source into the existing signup-source API contract. Track tool starts/outcomes, signup CTA clicks and successful signup responses without emails, keys, inputs or outputs.

Scheduling: scripts/social/typefully_tracking.py is the reusable write boundary. It adds tags, rejects inert planning, preserves confirmed timestamps and platform/media/thread content, detects concurrent edits and rereads the result. No vendor-wide policy is claimed: manual Typefully writes remain outside this client.

Verification and deployment evidence will be recorded in the linked PR and local campaign output receipts. Independent technical and product reviews are required before merge. No backend schema, auth, payment or activation-identity change is included.

Next action: finish independent reviews and production browser verification, then update the 21 confirmed Typefully entries through the guarded client and save the final queue comparison. Install the same reviewed client in the local campaign helper for subsequent sessions.
