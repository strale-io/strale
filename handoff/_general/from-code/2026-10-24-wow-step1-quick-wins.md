Intent: Apply step 1 of the way-of-working review (DEC-20261024-A): fewer paperwork failures in CI, same product checks.

# Way-of-working step 1: quick wins

Source: `docs/strategy/2026-10-23-way-of-working-review.md` §4 step 1, approved
under DEC-20261024-A item 3 (Codex check) and the review's step-1 list.

What changed:

- **Codex check retired.** The `codex:check` and `codex:test` CI steps, npm
  scripts and the three scripts behind them are gone. The waived register
  `docs/programs/codex-review-backlog.yaml` stays as history; git keeps it
  immutable. The protocol-coverage row for Review routing now says no
  mechanical check enforces it.
- **Archive and handoff index regenerate on commit.** `.githooks/pre-commit`
  runs `scripts/handoff/regenerate-indexes.mjs` before the gate. It rebuilds
  `archive/README.md` and `handoff/README.md` from the staged tree and stages
  them, and regenerates the legacy-authority inventory when an inventory
  target is staged (otherwise the regenerated `handoff/README.md` would trip
  the inventory rule). `.githooks/pre-merge-commit` does the same for a clean
  merge, then stops it so `git commit --no-edit` lands the fresh index (git
  2.43 ignores index changes made in that hook). CI's `--check` is now a
  warning.
- **`/go` skill**: the deleted `sqs.ts` rule is replaced with the root-cause
  rule, and the scraping-doctrine pointer names DEC-20261023-A.
- **CEO-brief lint** runs on a PR only when a brief, the linter or `ci.yml`
  changed (`classify` output `briefs_changed`); always on main.

Next: step 4 (`REVIEW.md`, `/onboard-capability`), then the draft step-2/3 PR
that waits for Petter's confirmation of DEC-20261024-A items 2 and 5.
