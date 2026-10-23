Intent: propose the new website's page set and navigation, and a three-level
messaging framework (benefits / what it does / features), for Petter's review.

# 2026-10-23 — site structure and messaging levels (proposed)

Commissioned by the parent positioning session. Both documents are marked
**proposed**; nothing is adopted, published or approved for copy.

- `docs/programs/brand-website/SITE-STRUCTURE.md` — 17 pages with purpose,
  reader, question, sections, CTA, level and data source for each; machine
  surfaces; old-site → new-site disposition.
- `docs/programs/brand-website/MESSAGING-LEVELS.md` — 4 L1, 7 L2 and 10 L3
  lines, each mapped to page/section, evidence and claims.yaml status, plus
  the proof gaps that block specific lines.

First drafted for the positioning report's recommended option (European company data
leads). Petter then chose a different positioning, **DEC-20261023-B** (recorded in a
separate PR): a broad, global pay-per-call tool library leads, with official-source
company and compliance data, worldwide, as the flagship category, and no
popularity claims. Both files were rewritten around it. An independent
separate-context fact-check ran on the first draft (nine overstatements fixed),
and a second one on the rewrite.

## Findings outside this batch (not fixed here)

1. **Terms block the platform channel.** strale.dev `/terms` forbids using
   the Service to "resell the Service as your own". Marketplaces, the main channel,
   are where buyers find Strale. A `/platforms` page is held until Petter decides on
   a Terms change (legally binding, his call).
2. **Denmark bundles over-claim.** `kyb-essentials-dk` (and siblings) describe
   confirming the company "in the official registry" but contain no registry
   step (Danish registry tool inactive). Steps: vat-validate, sanctions-check,
   lei-lookup.
3. **Machine surfaces carry the retired framing.** The dynamic
   `api.strale.io/llms.txt` opens "Verified data your agent can trust. 298+
   independently tested…"; static `strale.dev/llms.txt` says "All
   capabilities are available via x402" (272/298 today) and "trust layer". The
   dynamic file also names two web3 tools that are not live.
4. **x402 responses carry no transaction ID.** The record-of-each-call line
   can only be claimed for API-key calls, and only after the
   PROOF-QUALIFICATION retrieval step runs.

## Not touched

`docs/programs/brand-website/tracks.yaml`, `PROGRAM.md` and `design/` (owned
by the parallel design-system session). The T4 `next_action` is unchanged; the
next brand step is Petter's review of the page set, the About question and the
Terms question; positioning is settled.
