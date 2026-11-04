Intent: orchestrator checkpoint at the end of the 2026-11-04 afternoon run on account 1fg, so the next Strale orchestrator resumes from main alone.

# Orchestrator checkpoint, 2026-11-04 afternoon close (cloud, account 1fg)

**Supersedes `2026-11-04-orchestrator-checkpoint-1fg.md`.** Its lease section
still holds: the `fleet-lease` names account `1fg`, Strale entry
`session_01RFNL6TLV5jtWpGMEzuea6W`.

## Done (all merged)

- **#893** website switch-over readiness list and the takeover checkpoint.
- **#894** WP12 batch 2 (cto-readiness T18, audit CR-11): raw sockets in
  port-check, ssl-check and ssl-certificate-chain connect only to the address
  vetted at connect time. Also closed two holes live on `main` before it: an
  empty host (`https://`) reached localhost, and an invalid port could crash
  the API process 10 s later. Independent review GO, 2 rounds plus a
  confirmation read. **Deployed:** `/health` showed `27281d58` at 14:10 Swedish
  time. The behaviour itself is not checked in production: all three tools are
  paid and a cloud session has no key or wallet. PC check: one paid
  `ssl-check` with `{"domain":"https://"}` must answer "A host is required".
- **#895** website switch-over items 1 and 2: `/signup`, `/topup`, `/audit`,
  `/terms`, `/privacy` in `apps/web`. Fixes over the old pages: signup shows
  the real opening balance; audit forwards `expires_at` (every audit link on
  the old site has answered 410 since 2026-10-17). Independent review GO, 2
  rounds. Not published.
- #726, #727 and #736 closed as superseded by #892.

## Next action

Website switch-over items 3 onward, in the order of
`docs/programs/brand-website/SWITCH-OVER-READINESS.md` (brand-website T6).
Then WP12 batch 3: byte and pixel caps through `apps/api/src/lib/resource-limits.ts` (T18).

## Codex

The fleet Codex dispatcher is live on account 1fg
(`session_01RFNL6WdKhJMbiDfbTG7YhV`), and Petter wants coding on Codex. Strale
has no Codex Cloud environment yet; the wow-core master is asking Petter to
create one (no secrets, no production network, DEC-20261101-A). When its id
exists, add `codexEnv` to `.claude/cloud.json` and dispatch build batches
through the dispatcher; Claude reviews.

## Follow-ups noted, not started

- Wire `npm run test:browser` into the CI web job (readiness item 10, a workflow PR).
- `ssl-certificate-chain` drops a `:port` in `host` and checks 443, while the
  ssl-check manifest's limitation text recommends that form.
- Route the WHOIS sockets (domain-age-check, whois-lookup) through vetted-connect.

## Waiting on Petter

Unchanged from `2026-11-04-orchestrator-checkpoint.md`, plus: the stale legal
text in the Terms and Privacy (listed in SWITCH-OVER-READINESS "Petter's part"),
the Cloudflare Pages project, and the Codex environment. DQ-44 Serper renew or
lapse is due **2026-11-06**.
