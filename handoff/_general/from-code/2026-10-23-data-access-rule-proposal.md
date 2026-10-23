Intent: Draft a risk-based replacement for the scraping doctrine for Petter's decision.

# Data-access rule proposal (DQ-35)

Petter asked on 2026-10-23 whether Strale's scraping rules are too strict
compared with other players. The answer, drafted as proposed decision
DEC-20261023-A in
[the proposal](../../../docs/strategy/2026-10-23-data-access-risk-rule-proposal.md),
is that the written doctrine is stricter than recent court rulings suggest on
public, non-personal facts and is not followed by the catalogue as written. The proposal replaces
it with three lanes:

- **Never:** logins, getting around blocks, harvesting people data for resale
  (AML/KYB screening excepted), litigating platforms, commercial aggregators,
  resale against vendor terms, media.
- **Allowed with checks:** customer-directed and per-call public reads, and
  vendor data with resale rights.
- **Preferred:** official and licensed sources.

The queue entry is DQ-35 in `docs/company/DECISION-QUEUE.md`, `your_call`.

**Not in force.** Nothing changes in code, CLAUDE.md, the blocklist or the
DEACTIVATED map until Petter decides. The M2 decision register is closed:
adding a formal record trips `CLOSING_REVIEW_STALE` and the count checks.
So the proposal lives in `docs/strategy/`, and on adoption it is recorded in
CLAUDE.md Active Decisions, as DEC-20260910-A was.

**On adoption, the next session** follows the proposal's "On adoption" list:
1. Record the decision in CLAUDE.md, and update AGENTS.md.
2. Stop the fetch path routing around blocks in `web-provider.ts` (no
   Jina/Browserless fallthrough after 401/403/429 or a challenge page), and add
   a robots.txt check.
3. Add `acquisition_method` and the lane to provenance and to manifests.
4. Record Serper's and Jina's terms.
5. Decide `social-profile-check`, then blocklist Reddit.
6. Update the DEACTIVATED notes and the memory note.

**Independent review:** a fresh same-provider agent in a separate context
returned FAIL on the first draft with 19 findings. Among them: never item 3
would have banned the live sanctions, PEP and adverse-media tools;
`social-profile-check` was not mentioned; the claim that the fetch tools
already honour blocks was false; Tier 2 conditions and the terms check were
dropped without saying so. A re-review returned PASS WITH FIXES with 13 further
text fixes, which were applied. They cover qualified record keys for collided
ids, a court-published personal data carve-out, behaviour-defined lanes
covering every fetch tool, the honest user agent, and the TikTok/YouTube
rulings.

Checks run in the worktree: `docs:check` passes, and `context:check` reports
no warnings after `context:generate`.
