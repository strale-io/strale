Intent: Make agent hook commands work from subdirectories and reconcile the shared agent entry instructions.

Scope: setup configuration and documentation only. AGENTS.md now points to the complete CLAUDE.md review-routing record instead of an incomplete copy. Historical review obligations are preserved. Both entries accurately distinguish Stop continuation, its six-block escape, and notification receipts.

All five hook commands resolve their tracked script from the current Git worktree root, forward standard streams and preserve child exit status. Codex metadata uses supported `description` instead of rejected `_comment`. No hook script or gate policy changed.

Evidence: archive/receipts/2026-09-06-check-agent-hook-setup.json and archive/sessions/2026-09-06-agent-hook-setup/fixture-verification.json. The fixture ran 13 root/subfolder command checks under PowerShell and Git Bash. Automatic Codex SessionStart/Stop followed normal trust of the fixture and exact hook definitions; Claude used explicit settings. These receipts establish fixture behavior, not activation in every existing task. The shared Stop script writes last-claude.json for either provider; the session-specific lastKey marker is necessary to attribute its execution.

Checkout: isolated outputs/strale-setup-worktree under the machine setup task; branch chore/agent-entry-setup-20260906, integration base ffe81323. Owned changes are hook configuration, agent entry docs, this handoff and its evidence/generated indexes. No unrelated active worktree may be cleaned or removed.

Next action: complete exact-commit independent review and repository checks, merge the setup PR, then confirm current hook definitions are trusted and invoke them in the actual Strale project. Until merged, the live trunk does not contain these fixes. Do not change the historical Codex review backlog or infer current quotas from dated amendments. Global deprecated hook setting and optional connector reauthentication are separate setup follow-ups.
