Intent: orchestrator checkpoint, 2026-11-05 evening, after the account takeover (account `hotmail-ra`), so the next Strale orchestrator can resume from main alone.

# Orchestrator checkpoint, 2026-11-05 evening

**Supersedes `2026-11-05-orchestrator-checkpoint-afternoon.md`.**

**Lease.** The wow-core takeover (session_01CR5YPqnZbBgzVCcPuKagSt) took the lease for account `hotmail-ra` at 16:35 Swedish time. The Strale master on this account is session_01CR5YPsTtEwE3tRQtvTzerw. At 16:40 the lease had no Strale entry. Checking with `--parent session_01CR5YPqnZbBgzVCcPuKagSt` gave "active". The bus repository has to be attached with `add_repo` (moonlighter-ab/agent-bus) before `bus.mjs` can reach it.

## Since the afternoon checkpoint

- **#914, #915 and #916 merged.** #919 wrote `archive/receipts/2026-11-05-audit-xff-shape-production.json` and removed the temporary measurement. The receipt shows production X-Forwarded-For is exactly `<client>, <railway-edge>`, and that the edge replaces a client-supplied header.
- **#920 (draft): WP12 batch 4 redo.** The client is the public entry one hop left of the edge. The tests fail against both #910's rule and the old left-most rule. The PR body has the evidence and the independent review result.
  - **Merge gate 1:** `node apps/api/scripts/verify-ip-probe.mjs` exits 0 from a fixed-egress machine (the PC). From a cloud session it exits 2 (inconclusive), because egress rotates.
  - **Merge gate 2:** #917 merges first, because the two PRs share route files.
- **Production identity is per-client today.** Checked from this cloud session through the agent proxy: 5 of the 6 distinct `ipHash` values are the exact hash of an address in the session's own egress /24.

## Switch-over (DEC-20261105-A): in progress, waiting on Petter

#917 says switch-over is today. The strale.dev → strale.io redirect runs as a 302 for the first 24 hours, then becomes the 301. At 16:41 Swedish time:

- strale.io and www.strale.io still 302 to strale.dev;
- strale.dev serves the old site;
- so Petter's step 1 is not done yet: Pages → strale-web → Custom domains → add `strale.io`, then wait for Active.

#917 is clean against `main` (head 91204e64). The full step order is in the #917 body. The orchestrator merges #917 after Petter's Cloudflare steps 1–4.

## Open items, in priority order

1. **Switch-over:** as above.
2. **#920:** the PC probe, then merge after #917, then the post-deploy probe and a production check of per-client `ipHash`.
3. **Old S mark: no live email uses it.** No API email template has an image (`apps/api/src/lib/email-templates.ts`, `lib/daily-digest/render-email.ts`). Nothing outside `design/brand-kit/quiet-material/` references those exports. What remains is profile avatars on external accounts (GitHub org, social), which are Petter's to change.
4. **domain-reputation manifest claim.** `manifests/domain-reputation.yaml` has `data_source: Threat intelligence feeds (multi-source scoring)`, but the executor does only DNS lookups (A, MX, SPF, DMARC) and one HTTPS request for security headers.
   - **Fix:** narrow the text to what it does, e.g. "DNS records and the domain's HTTPS security headers (no threat-intelligence feeds)". This is a narrowing correction, delegated under DEC-20260822-A.
   - It syncs to the DB through `manifest-sync-fields.ts`.
   - It needs the Capability Onboarding Protocol checks (validate-capability, readiness), which need a DB, so it goes in its own small PR.
5. **Carried over:** stale public copy from the guides lane.

## Gate finding this session could not clear

The handoff gate reports the remote branch `worktree-bridge-cse_01RFNL6Vx2oGTueVVUhYjN7M` as merged. It belongs to the previous orchestrator session and its tip, `ad41a59b` (#901), is an ancestor of `main`, so deleting it loses nothing. This session's git access refuses the delete: the proxy disconnects, because only the session's own branch can be pushed. Petter, or a session with branch-delete access, should run `git push origin --delete worktree-bridge-cse_01RFNL6Vx2oGTueVVUhYjN7M`.

## Codex for Strale: on hold

- **Decision:** at about 17:10 Swedish time Petter decided, relayed by the wow-core master, that Strale uses Codex like the other projects. This replaces "Strale builds on Claude for now".
- **Hold:** the wow-core master then put the environment form on hold. Petter wants the shared setup (wow-core's `.claude/scripts/cloud-setup.sh` reading `.claude/cloud.json`), not a Strale-specific setup command, and the comms profile does not ship it to Strale yet.
- **Next step:** when the shared kit reaches Strale, give Petter the Legacy Codex Cloud form values and record the environment ID as `codexEnv` in `.claude/cloud.json` by PR. Until then, Strale builds on Claude.
- **Network allowlist, from `package-lock.json` and the install scripts:**
  - `registry.npmjs.org`;
  - `github.com`, `objects.githubusercontent.com` and `raw.githubusercontent.com`, needed only for c2pa-node's prebuilt binary and test certificates.
- **Test variables:** the dummy `AUDIT_HMAC_SECRET` and `FRONTEND_URL` that `ci.yml` already publishes.
