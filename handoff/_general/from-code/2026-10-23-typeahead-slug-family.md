Intent: make GET /v1/suggest/typeahead find slug-shaped queries such as
"invoice-verify" and "company-data", which website visitors typed in the week
to 2026-10-23 and got zero results for.

# 2026-10-23 — typeahead slug-family matching

Found during the 2026-10-23 activity review (suggest_log, 2026-10-16 →
2026-10-23): seven zero-result typeahead queries, four of them slug-shaped.

## Cause

`typeahead()` split the query on whitespace only, while `tokenize()` (the item
token index) splits on hyphens. A hyphenated word matched no token and no
name/description prefix, and earned the +2 slug bonus only when it was one
slug exactly ("swedish-company-data" worked; "company-data" did not).

## Change (`apps/api/src/lib/suggest.ts`)

A hyphenated query word is matched as one unit. It counts for an item when:

1. it names the item's slug or slug family (`isSlugFamilyMatch`: a run of
   whole slug segments) — +2, then its parts score as ordinary words;
2. its joined form is one of the item's tokens ("e-mail" → `email`); or
3. every one of its parts matches that same item (token or name/description
   prefix).

Otherwise it contributes nothing. A word with a 1-letter segment gets no
per-part matching; doubled and dangling hyphens are normalized so a half-typed
slug still names its family. The per-item scorer is extracted as
`scoreTypeaheadItem()` so it can be tested without the DB-backed catalog. The
keyword fallback (`scoreKeywordMatch`) gets the same family bonus, not stacked
on its identity bonus.

The first version scored the parts independently. An independent reviewer
(fresh Sonnet agent, separate context) probed it against all 350 capability
manifests: "web3-assurance" matched 17 items, "eu-company-due-diligence" 91,
"e-mail" 174, and exact slugs lost their precision. The AND rule fixes all
three. Re-probed after the fix: those queries return 0, 0 and 12 email items
respectively; "vat-validate" returns vat-validate first plus two items that
contain both words; "company-data" returns the *-company-data family on top.

Not changed: "web3-assurance" and "eu-company-due-diligence" name no slug in
production. Those are coverage gaps; per `search-aliases.ts` they are not
aliased to adjacent items.

## Evidence

- `apps/api/src/lib/suggest-ranking.test.ts` → "slug-family matching".
  Mutation-checked: dropping the AND rule, the family bonus, the joined form,
  the short-segment rule or the hyphen normalization each fails at least one
  test.
- Production check after deploy: see the PR description.

## Next

Nothing pending from this batch.
