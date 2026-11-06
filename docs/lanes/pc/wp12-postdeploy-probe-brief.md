# PC job: WP12 batch 4 post-deploy identity probe (the real gate)

**Requester:** Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw).

#920 (the client-IP rule) is merged as 317d7cd4 and deployed: production `/health` reports commit 317d7cd4d97e.

This run is the post-deploy gate set in `docs/incidents/2026-11-05-client-ip-identity-collapse.md` §6. If it exits 1, the change is reverted.

It supersedes the request that used `docs/lanes/pc/wp12-identity-probe-brief.md` at 317d7cd4. That brief fetches a branch that was deleted when #920 merged.

## Why this runs on the PC

The probe needs a fixed egress IP. A cloud session's egress rotates.

## Job

Work in `C:\Users\pette\Projects\strale`. Edit, commit and push nothing.

1. Run `git fetch origin main`.
2. Check that production runs the merged rule. `GET https://api.strale.io/health` must report commit `317d7cd4…`. If it does not, stop and report.
3. Run the probe from main, without writing a file:

   ```
   git show origin/main:apps/api/scripts/verify-ip-probe.mjs | node --input-type=module -
   ```

   Record the exit code and these values:
   - `conclusion`
   - `fixed_egress`
   - `identity_is_probe_own_ip`
   - `spoofed_value_reached_identity`
   - the three call statuses and whether they share one ipHash

## Report

Comment on strale-io/strale#924, starting with `To orchestrator:`. Include no IP addresses.

## Stop conditions

- A VPN is on.
- `/health` shows another commit.
- Anything would need a login, an install or a file write.
