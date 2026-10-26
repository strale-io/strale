Intent: Apply step 4 of the way-of-working review (DEC-20261024-A): one reviewer brief and a capability-onboarding skill.

# Way-of-working step 4: REVIEW.md and /onboard-capability

- Root `REVIEW.md`: review tiers (0 docs, 1 code, 2 high-risk surfaces), at
  most two review rounds recorded as `GO at <sha>, rounds: <n>`, the
  incidents behind the rules, an always-check list that routes to every
  incident protocol (DEC-20260504-A/B/C, DEC-20260422-A, DEC-20260320-B, test
  cost principles, migration ledger, DEC-20261023-A data access, wire shapes,
  drift surfaces, shared checkout), a per-surface table for the tier-2
  surfaces (wallet and settlement, x402, auth and API keys, migrations on live
  data, screening outputs, public claims, published packages, gates and
  doctrine), and what to skip. CLAUDE.md stays canon; REVIEW.md routes to it.
- `.claude/skills/onboard-capability/` (and the `.agents/` copy): the
  pipeline as steps, including that `onboard.ts` writes production under
  `autonomousAuthority("capability_onboarding", …)` and stops as
  AUTHORIZATION_UNAVAILABLE without the credential, plus readiness via the
  internal route.
- CLAUDE.md's root-contents list now names `REVIEW.md`; the pipeline section
  (and its byte-identical mirror) points at the skill; AGENTS.md points at
  both.

Not done here, from the review's step 4: the WoW-Core `/review` and
`/fresh-eyes` skills (WoW-Core adoption is out of scope), and running the
readiness check in CI on changed manifests (rank 9).
