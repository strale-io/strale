# PC job: WP12 batch 4 identity probe, and one merged-branch cleanup

**Requester:** Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw), for strale-io/strale#920.

## Why this runs on the PC

- `apps/api/scripts/verify-ip-probe.mjs` asserts that the API's `ipHash` is the hash of the caller's own public IP. That check needs a **fixed** egress address. A cloud session's egress rotates on every connection, so there the probe can only exit 2 (inconclusive). See `docs/incidents/2026-11-05-client-ip-identity-collapse.md` §6.
- The cloud session's git access cannot delete a branch it did not create.

## Job (in `C:\Users\pette\Projects\strale`, read-only except step 3)

1. Run `git fetch origin claude/quirky-davinci-gha13h`.
2. Run the probe straight from the fetched blob, so nothing is written to the working tree. It makes 3 free-tier `POST https://api.strale.io/v1/do` calls (email-validate, price 0) plus a few `api.ipify.org` and `api64.ipify.org` lookups:

   ```
   git show origin/claude/quirky-davinci-gha13h:apps/api/scripts/verify-ip-probe.mjs | node --input-type=module -
   ```

   Record the full JSON output and the exit code.
3. Run `git push origin --delete worktree-bridge-cse_01RFNL6Vx2oGTueVVUhYjN7M`. The branch is fully merged into main: its tip ad41a59b, from #901, is an ancestor of main.

## Report

Post one comment on strale-io/strale#920 that starts with `To orchestrator:` and contains:
- the probe's exit code;
- its `conclusion`, `fixed_egress`, `identity_is_probe_own_ip` and `spoofed_value_reached_identity` values;
- the three call statuses;
- the branch-delete result.

Leave out any IP address. The probe prints `own_public_ips` and `egress_ips_sampled`; do not post those.

## Stop conditions

- If a VPN is on, stop and say so in the comment.
- If the probe exits 1, do nothing else, and report it.
- If any step would need a credential prompt, a file edit, a commit or an install, stop and report it.
- Run nothing else from this branch.
