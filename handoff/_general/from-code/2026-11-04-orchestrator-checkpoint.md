Intent: orchestrator checkpoint before an expected account takeover (hotmail-ra at 95% weekly use, 2026-11-04), so the next Strale orchestrator resumes from the repo alone.

# Orchestrator checkpoint, 2026-11-04 (cloud, account hotmail-ra)

**Supersedes `2026-11-02-orchestrator-checkpoint.md`.** Its lease, cloud-session
notes and "Waiting on Petter" list still hold, except as listed here. This file
lives on branch `design/hero-centred` (PR #892) until that PR merges.

## Lease

Session `session_01CR5YPravsp8tMjnTFyVYoK` on account `hotmail-ra`. The new
account takes the lease per PACE_CORE §2a before acting.

## Done since the last checkpoint (all merged, production `/health` checked)

- #891 WP12 batch 1, CIDR outbound guard: deployed and checked with a free call.
- #890 the Serper `/resolve` outcome record (the previous checkpoint's next
  action): merged and deployed.
- #855 robots.txt rollout measurement and the paid blind-spot guard: deployed
  (`68aea1b6` on `/health`); its worktree is removed.
- Fixed the dead email-footer link and repointed the image-resize suite fixture;
  LESSONS incident 14 added (the #786 class).

## In flight: the website (brand-website T6)

Stacked draft PRs #725 <- #726 <- #727 <- #736 <- #892, CI green, nothing merged or published. Petter
approved the home page on 2026-11-03 and was shown all eight main pages in a
private preview (https://claude.ai/artifact/Cbduab7jNroiqXwYrTJkvj). Detail:
`2026-11-02-website-centred-hero.md`; register: `docs/programs/brand-website/tracks.yaml` T6.

**Next authorised action:** when Petter is happy with the inner pages, step 2,
which he approved on 2026-11-03: an independent read-only review of the whole
website stack #725 <- #726 <- #727 <- #736 <- #892 (#736's base is #727's
branch, not `main`) in a separate context, fix findings, then merge bottom-up
through the merge queue (`enable_pr_auto_merge`). Merging does not publish the site.
Step 3: a short switch-over readiness list for Petter.

## Waiting on Petter (additions)

- Run the "Onboard capability" workflow: slug `image-resize`, mode backfill,
  discover on (bus ask 6579234956).
- From the PC: one paid `google-search` call with a knowledge panel, to confirm
  no `/goto` in the output (#877), and the DB check in
  `2026-11-02-serper-resolve-outcome-record.md` (#890).
- DQ-44 Serper renew or lapse is due **2026-11-06**.

## Later

Check the DEC-20261101-A wording against wow-core#227 (fleet Codex dispatcher).
