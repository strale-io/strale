Intent: take wow-core main at ea479bd (mail guard, moonlighter-ab/wow-core PR 362) into Strale's comms copy, as the week-47 sync.

- Ran `scripts/sync-to-project.ps1 -Profile comms` from wow-core ea479bd. Changed: `.claude/scripts/wow-hook.mjs`, `.claude/scripts/bus.mjs`, `.claude/settings.json` (PreToolUse hook now `onFailure: block`), the comms stamp and manifest, `docs/COMMS_CORE.md`, `docs/FOUNDER_PROFILE.md`.
- Smoke check: `node --check` on both scripts passes; a benign Bash call is allowed; a call naming BWS_PROD_TOKEN is refused (fail closed).
- Slot: last sync was 2026-11-14 (week 46); this is week 47's. The next sync opens on Monday 2026-11-23.

Next authorised action: merge through merge-gate, then reply to the wow-core takeover session with the merged commit and stamp ea479bd | Owner: Strale master | Blocker: merge-gate
