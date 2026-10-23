Intent: compare Strale's rules and processes with Petter's newer way of
working (WoW-Core, Tilja, Cinver) and propose what to adopt, simplify and
retire. This is a proposal only: nothing was applied.

# 2026-10-23 — way-of-working review

Deliverable: `docs/strategy/2026-10-23-way-of-working-review.md`. It sits with
the dated strategy papers because it proposes direction. It is not a program
execution record (`docs/programs/README.md`), and its type does not fit the
research schema's `type` enum.

## What it contains

1. What WoW-Core, Tilja and Cinver do that Strale doesn't, with file paths.
2. Twelve ranked changes with effort and risk.
3. A rule-by-rule table (keep / simplify / merge / retire), with friction and
   an incident flag on every rule that guards against a real outage or a loss.
4. A migration order, starting with Petter's decisions.

## Reconciliation with T7 (M4 cutover)

The review does not duplicate T7. It proposes re-scoping it: ship the
production readers from `m4/cutover` (#679, #680, #681) plus the batch-7
rescue, cut the entrypoints to the WoW-Core shape in the same change, and drop
the parity, coverage and closure proofs. T7's `next_action` in
`docs/programs/cto-readiness/tracks.yaml` is unchanged, because whether to
re-scope is Petter's call.

## Not done, deliberately

- No change to `CLAUDE.md`, `AGENTS.md`, hooks, gates or registers.
- Nothing under `docs/programs/brand-website/` or `design/` was touched.
- The sibling repos were read only. Nothing in them was fetched or changed.

## Next action

Petter reads the summary and the step-0 decisions in the review. If he says
yes to any of them, a new session starts at step 1 of the migration order.
