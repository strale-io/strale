Intent: answer Petter's question — why did the paying customer get four
different answers from four identical competitor-compare calls — with a
measured decomposition, and ship the narrow fix.

## The answer

Not a malfunction. No LLM call on the platform set a temperature, so every AI
capability sampled at the API default (1.0). Decomposed 2026-08-25:

- scrape leg: two renders of the same page → byte-identical text; the
  customer's own four outputs corroborate (names/taglines constant, only
  free-prose fields wobbled);
- sampling leg: three calls on IDENTICAL input at the prod default → three
  different outputs, trust-signal counts 4/3/4, positioning 106/85/107 chars —
  exactly the customer's pattern (theirs: 11/13/10/9 and 180–294 chars);
- temperature 0, three calls → byte-identical.

## Shipped

PR #397, merged `cc63428`, deploy verified by served commit.
`extractJsonWithLlm` gains optional `temperature` (forwarded only when set —
unset callers' request bodies stay byte-identical); `competitor-compare`
passes 0. Both mutation tests CAUGHT via `mutation-test.mjs`. Honest limit in
the docstring: near-deterministic within a model version, never "identical
forever" — a model update can still change the answer.

## Queued follow-ups (both approved in direction, neither started)

1. **Same-input caching for competitor-compare** — Petter's explicit ask,
   "but separately". A repeat of an identical question should not cost a
   second €1.00. Design note: cache key = normalized (domain1, domain2) pair +
   short TTL; with temperature 0 the cache also cannot serve a stale-varied
   answer.
2. **Per-category temperature pass across the ~70 extractJsonWithLlm callers
   plus the direct `messages.create` callers.** Extraction-shaped → 0;
   generative (fake-data-generate, blog-post-outline, social-post-generate,
   email-draft, …) → deliberately unset. This is a judgement pass per
   capability, its own PR, not a blanket helper default — identical fake data
   on every call would be a regression.

## For whoever reads this next

The customer spent €4.00 of €5.09 on those four sampled variants. If they run
the same comparison again after this deploy, they get the same answer twice —
that, plus follow-up 1, is the customer-visible repair.
