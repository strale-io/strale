Intent: DEC-20261023-A adoption, work item 6. Update every code and doc
citation of the superseded decisions (DEC-20260428-A, DEC-20260518-F,
DEC-20260813-A and the two qualified Notion-keyed ids) to cite
DEC-20261023-A.

## How

- A historical statement ("deactivated per DEC-20260428-A Tier 1") keeps its
  id, because it was true when written, and gains the new decision plus the
  status under it. Examples:
  - `australian-company-data` stays off as redundant.
  - `eu-court-case-search` can be reopened under the per-call lane once
    CURIA's and HUDOC's terms are recorded.
  - Direct Google access is never lane item 4.
- A forward-looking statement ("acquisition_method: direct_api per
  DEC-20260428-A Tier 2", "the doctrine stands") now cites DEC-20261023-A
  and its lane.
- Customer-visible limitation text in `belgian-`, `brazilian-` and
  `danish-company-data` now reads "vendor lane of Strale's data-access rule,
  DEC-20261023-A".
- `claims.yaml`: the three scraping claims stay forbidden, now
  `decided_by: DEC-20261023-A`, with notes rewritten to the new rule's terms.
- The coverage-matrix `doctrine_reference` fields name the lane under the
  new rule, with the old tier kept in brackets.
- Covered as well: the CHARTER, GOALS and IDEAS lines, manifests
  `CLASSIFICATION.md`, the `strale-mcp` tool description (source only, no
  publish), and three test comments.

## Deliberately left

- Decision records under `docs/decisions/records/`, `archive/` and older
  handoffs are history.
- The dated lifecycle reason in `config/vendors.yaml`, and
  `apps/api/coverage-matrix/.migration-snapshot.json`, are generated
  history.
- `CLAUDE.md` and `AGENTS.md` already mark the supersession; a governance
  session owns them.
- No project memory file exists in this repository or session, so there was
  no memory note to replace.

## After independent review

The review found no blocking defects. These fixes went in on the same PR:

- Customer-visible `source_note` text for danish, belgian and brazilian
  company data no longer claims the "vendor lane": the rule needs the
  vendor's resale terms recorded, and cvrapi.dk's, CBEAPI's and ReceitaWS's
  are not. Coverage-matrix rows for belgian, cobalt and cypriot are fixed to
  match.
- `provenance-builder.ts` and the `strale-mcp` description no longer
  credit DEC-20261023-A with the per-fact primary-source requirement it
  dropped.
- The three DPIAs whose re-review triggers named DEC-20260428-A carry a
  dated engineering re-review note. The company-enrich DPIA's robots.txt
  statement was not enforced by code before PR #723; now it is.
- Also fixed: `auto-register.ts` and `email-finder.ts` wording,
  `check-pii.mjs`, `populate-rug-bytecodes.ts`, `railway-config.md`'s bare
  DEC-20260421-C, `platform-facts.ts`, the portfolio plan pointer, and the
  SITE-STRUCTURE methodology line.

Open for whoever owns decision records: `docs/project/DECISIONS.md` and
`docs/decisions/records/DEC-20260428-A.md` still show DEC-20260428-A as
active, and no DEC-20261023-A record exists yet. The vendor resale terms of
cvrapi.dk, CBEAPI, ReceitaWS, Cobalt and Dilisense are not in
`VENDOR_TERMS_RECORDS` yet.
