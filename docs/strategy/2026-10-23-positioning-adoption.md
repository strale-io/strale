---
doc_type: decision-summary
authority_scope: derivative
decision: DEC-20261023-B
date: 2026-10-23
status: active
---

# Positioning: the global tool library agents pay for per call, with official-source data as the flagship

Petter (founder) adopted this in session on 2026-10-23, after reviewing a
first-principles positioning and market analysis and discussing it. The
proposal he approved ("I think that version feels right") was as follows:
- **Story:** the broad, global library agents use and pay for per call, with
  no accounts.
- **Flagship:** official-source company and compliance data, worldwide, as
  the premium category with outcome pricing, the margin anchor if commodity
  prices fall.

He then set the sequencing:

> "we don't have any demand and we're not advertising ourselves right now. We need to build attractive portfolio capabilities and market it, and then we can start making decisions on what sells and what doesn't."

Global decision; Petter owns it.

## The decision

**Story.** Strale is the broad, global library of tools that AI agents can
use and pay for per call:
- one connection;
- no account with each provider;
- payment with an API key and prepaid wallet, or with a wallet over x402
  (no signup).

The library's usefulness to agent builders is the lead, not any single
vertical. Petter's reasoning on growth is that Strale can keep adding tools:
"if there are APIs that we can connect to very easily and we can maintain
those connections with agents, there's just nothing really stopping us from
growing our catalog from our current number to a much, much larger number."

**Flagship category.** Official-source company and compliance data,
worldwide, with outcome pricing for bundled checks. It is the premium part of
the library and its margin anchor if commodity prices fall. It is not the
headline, and it is not limited to Europe.

**Portfolio first, then market, then judge.**
1. Build an attractive portfolio of capabilities.
2. Market it.
3. Only then decide tool by tool on what sells.

Strale is not currently marketed, so its own demand signal is too thin to
steer by.

## What it changes

- **Affirms DEC-20260812-A:** library-as-product, with x402 as the primary
  rail.
  - DEC-20260812-A's gate stays in force: compliance as *a separate track
    gated on customer discovery*.
  - Featuring compliance data as the library's flagship category does not
    open that separate track. A compliance-specific product for compliance
    buyers still needs customer discovery first.
- **Amends DEC-20260905-A.**
  - Kept: the audience (developers and technical founders building agents),
    benefit-first ordering and the claim gates.
  - Replaced: the lead message, now per-call access to a broad library with
    no accounts.
  - Added: the flagship category.
  - Out of scope: the visual direction is a separate choice, recorded with
    the design system work.
- **Not adopted from the analysis:** its recommended lead ("official-source
  answers about European companies") and its demand-led sequencing. Petter
  declined both: "I'm not sure that I want to limit our business to Europe
  only", and "I'm not sure that adding tools (show some from our demand)
  really works".

## Operating approach (Claude, under the charter; not part of the founder decision)

How the decision will be carried out. These are Claude's operating choices
under [CHARTER.md](../company/CHARTER.md) and can be changed without a new
founder decision.

- **Choosing the portfolio.** Pick capabilities from market signals outside
  Strale's own traffic: what agent marketplaces and catalogues list and
  charge for, what agents are being built to do, and competitor gap
  analyses.
- **The website's job.** Proof and conversion:
  - the story and an honest, searchable catalogue;
  - a first working call in under a minute;
  - machine-readable surfaces that agree with the human site;
  - the flagship category shown with its coverage and evidence.

## Evidence

The positioning analysis, the production usage findings discussed in
session, and the four research-note strands are kept in the private context
archive (`archive/sessions/2026-10-23-positioning/`). They hold aggregate
revenue and usage data and competitive reasoning, which stay out of this
public repository.

## Follow-on work

- **Messaging:** the three-level messaging and site structure (PR #706) are
  rewritten around this decision.
- **Portfolio plan:** a portfolio-building plan, under the operating approach
  above.
- **Positioning brief:** `docs/programs/brand-website/POSITIONING-BRIEF.md`
  is historical for its lead message. Its audience, benefit-first ordering
  and claim boundaries still apply.
