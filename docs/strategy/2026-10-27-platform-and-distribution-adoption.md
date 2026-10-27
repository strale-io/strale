---
doc_type: decision-adoption
authority_scope: global
decision: DEC-20261027-B
date: 2026-10-27
status: active
---

# DEC-20261027-B — platform hardening and distribution plan adopted

## Decision and authority

On 2026-10-27 Petter confirmed in session, **"all as recommended, go ahead"**,
in answer to the nine yes/no items in the [distribution strategy](../research/2026-10-27-distribution-strategy.md)
§9 and the combined implementation plan. This is a confirmed global decision.
The nine items below quote that section; its questions and recommendations are
preserved as source wording, and the recommendations are now adopted.

1. **May a session ask Coinbase, by support email, to consider Strale for the
   Bazaar featured tier?** Recommendation: yes, once D2's metadata is live.
   The charter text called vendor contact yours; DEC-20261027-A later
   delegated emails "about access, terms, permission or credentials". A
   placement request is close to that line, so it is put to you once.
2. **Submit Strale to the Claude connector directory once it is eligible?**
   Recommendation: yes. It involves accepting Anthropic's directory terms for
   Moonlighter AB and a "financial transactions" acknowledgement, which go
   beyond a free account's click-through, and needs a paid Claude plan.
3. **May a session publish integrations under Strale's name on Zapier and
   n8n?** Recommendation: yes, with each listing text checked against
   `claims.yaml`. The developer accounts are free, but a listing is a public
   act, so the class is put to you once.
4. **Apply to Clay's partner programme, Stripe's Directory (which for a
   non-US business also needs Stripe's stablecoin approval) and router supply
   (Delegate, StableEnrich, Apify Actors)?** Recommendation: not in the first
   60 days. Revisit with D5 and D9 results. These involve agreements or payout
   identity checks.
5. **Free allowance.** Today 11 tools are free at 10 calls a day per IP.
   Recommendation: state it as a monthly number on the same zero-cost tools
   (about 300 a month, roughly today's daily limit restated). Free is outside
   the €0.02–€1.00 band, so this is yours (charter "What still needs Petter"
   item 4).
6. **No OEM or partner agreements for 90 days.** Recommendation: agree. The
   missing SOC 2 makes regulated buyers unlikely; integration evidence comes
   first.
7. **One-way package and registry publishes.** The charter reserves
   "publishing a package version that cannot be unpublished, submitting to a
   directory that does not accept removal". This plan needs several: a new
   npm package (AI SDK), official MCP registry entries (they cannot be
   deleted), an n8n major release, a `langchain-strale` refresh, and package
   releases that add the client header. Recommendation: approve the class for
   this plan, on the condition that each publish passes the Distribution PR
   Integrity Protocol and the production smoke test, and is reported after.
8. **Integration listings and the compliance gate (DEC-20260812-A).**
   Recommendation: list the Zapier and n8n integrations as general business
   tools (company lookup, VAT, invoice checks, with name screening as one
   action of five), and hold the "monthly sanctions re-screening" template and
   any finance- or compliance-team targeting until you say the gate is not
   triggered, or until customer discovery has run.
9. **Delete the three merged branches this session could not remove**
   (`chore/nta-env-set-in-railway`, `docs/email-phone-validation-copy`,
   `docs/ops-delegation`; PRs #763–#765). Not a strategy question: the git
   proxy refused the delete, and the "Delete branch" button on each PR clears
   the handoff gate.

For item 1 the CDP support email is logged in OUTBOX, with the inbox duty under
DEC-20261027-A. For item 2, directory submission is approved once eligible;
accepting the directory terms for Moonlighter AB and the paid Claude plan stay
with Petter at submission time. For item 3, each integration also passes the
Distribution PR Integrity Protocol (DEC-20260422-A). For item 7, the approved
class covers the plan's new npm packages and versions and the named registry
and package releases; each passes that protocol and the production contract
smoke test and is reported afterwards. Item 9 is Petter's action in the GitHub
UI; no branch deletion is claimed here.

## Implementation plan

Adopt the combined implementation plan from the [architecture review](../research/2026-10-27-codebase-architecture-review.md)
§10 ranked actions and the distribution strategy §8 (D0–D10, including its
housekeeping). Execution is registered in [platform-hardening](../programs/platform-hardening/PROGRAM.md)
and [distribution](../programs/distribution/PROGRAM.md). The programs record
execution, not additional authority. D0 and D1 are already in progress together
on the unmerged branch `chore/distribution-hygiene`; this record does not claim
their completion. Architecture item 19 overlaps D1's metadata and README repair.

## Scoped amendments and retained gates

This amends CHARTER.md's **What still needs Petter** item 3 for the publish class
in §9 item 7, and item 4 for the pricing decision in §9 item 5. Both are scoped
grants for this plan. The monthly free allowance stays on the same zero-cost
free-tier tools. The charter's wider reservations remain in force.

Item 8 preserves DEC-20260812-A's compliance gate: the held template and targeting
are not released by this record. No new regulatory claim is approved. The
architecture review's compliance/methodology publication gates also remain.
DEC-20261027-A continues to govern no-spend accounts and email.

**Not decided by this record:** turning on an external log sink (architecture
§10 item 10), and a Railway API token for auto-redeploy (item 3). Both stay with
Petter. H1 can implement observation and alerts without the token; H8 remains
founder-gated. DQ-41 remains open because the onboarding key is still not set.

## Rationale and reversal

Petter adopted the two reports' implementation plan and the recommended answers
to resolve the explicit authority boundaries before execution. Preserve the
reports as dated evidence; this record supplies the adoption rather than
rewriting research as authority. A later founder decision can amend or reverse
these grants; it must name the affected scope and update the execution pointers.
