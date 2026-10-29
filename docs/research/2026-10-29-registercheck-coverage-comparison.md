---
doc_type: research
type: vendor
topic: registercheck-coverage-comparison
question: Is registercheck.de usable as a German commercial-register source under the data-access rule, and how would its coverage be compared with OpenRegister once that is settled?
date: "2026-10-29"
status: current
sources:
  - https://docs.registercheck.de/docs
  - https://docs.registercheck.de/docs/concepts/data-coverage
  - https://www.anchorterminal.com/tools/registercheck
  - https://www.registercheck.de/rechtliches/impressum
  - docs/strategy/2026-10-23-data-access-risk-rule-proposal.md
  - docs/research/2026-05-06-bundesapi-civic-tech-audit.md
  - apps/api/src/capabilities/german-company-data.ts
  - config/vendors.yaml
  - apps/api/src/lib/vendor-terms.data.json
  - docs/company/OUTBOX.yaml
---

# registercheck.de: vendor check and coverage-comparison plan

This is a plan and a vendor check. It is evidence, not a decision. Times are
Swedish local time. Nothing here was obtained from an account: **no account,
no API key and no calls to registercheck's API exist, and none will until the
gate below is met.**

## What we know

The facts below come from public pages. Each is cited. The orchestrator
supplied the starting facts; the ones not confirmed this session are marked.

- **Operator.** Openlaw GmbH, Munich, HRB 292661 (Amtsgericht München), per
  the registercheck.de imprint as indexed by search. The imprint page itself
  answered this session with HTTP 429. The beglaubigt.de imprint for the same
  register number says "Openlaw UG". The legal form is therefore to confirm.
  Contact: info@registercheck.de.
- **Product.** REST at `https://api.registercheck.de/v1` (bearer key,
  `rc_live_…`; 53 operations in the OpenAPI 3.1 document) and a remote MCP
  server at `https://mcp.registercheck.de/mcp` (12 tools, OAuth 2.1). The
  60 requests a minute limit comes from the orchestrator and was not
  confirmed this session.
- **Age.** `/v1` first released 17 September 2026; paths renamed in place in
  October 2026 (anchorterminal.com). Openlaw acquired registercheck.de from
  Deepsearch GmbH in September 2026 (same source).
- **Coverage.** 5,796,418 records on 15 September 2026, 50.6% of them
  terminated companies (docs data-coverage page).
- **Pricing.** Prepaid credits: search 1, most reads 10, structured filter
  and computed beneficial owners 25, KYB report 50; plans with 1,000, 10,000
  and 100,000 credits a month and overage at 7.5, 2.25 and 0.75 cents a
  credit; currency not stated (anchorterminal.com). No x402.
- **Licence.** Proprietary, `LicenseRef-Registercheck-Terms`. The terms were
  not readable (bot check, per anchorterminal.com; HTTP 429 this session).
- **Third-party grade.** D, 52.4/100, "not agent-ready", on anchorterminal.com:
  no status page or SLA, full-permission keys only, the breaking October
  renames.
- **Competitor.** It sells register data to AI agents directly, through MCP.

## The core question: provenance

The data-coverage page says: register entries "are re-read on a cycle rather
than pushed to us by the courts", with fields extracted from filed documents.
That describes a maintained full copy refreshed by periodic reads. The page
does not say through which channel.

Under DEC-20261023-A, vendor data is allowed only when the vendor's terms
permit resale (verified and recorded), the data is not in the never lane, and
the vendor's method involves no login or account use and no getting around
blocks. The Handelsregister's own use rules cap automated access (60 requests
an hour, per the 2026-05-06 bundesAPI audit) and, per the orchestrator,
forbid systematic retrieval to build a parallel register. The terms text
itself is not on record in this repository; that claim is to confirm. If
registercheck's copy was built by crawling handelsregister.de against those
rules, buying it would be consuming a circumvention product, and the vendor
lane would not cover it. If Openlaw holds the copy under an official data
channel or bought the documents, it may.

**The strongest counter-argument to treating this as disqualifying:**
OpenRegister, which `german-company-data` already uses, is also a private
copy of the same register. Its own code comment says its data is
"refreshed every ≤4 weeks", and `config/vendors.yaml` records its terms,
licensing and redistribution as `unknown`. Whatever standard is applied to
registercheck must be applied to OpenRegister too. Holding registercheck to a
provenance bar the live vendor has never been held to would be inconsistent.
The same questions should go to OpenRegister. That is a separate row, not
part of this change.

## Gate before any comparison run

The comparison runs **only** when all of these hold:

1. Openlaw's written terms permit resale of per-call results inside another
   API product, with attribution, recorded in
   `apps/api/src/lib/vendor-terms.data.json` with `resale: permitted`.
2. Openlaw's provenance answer is not a parallel-register crawl of
   handelsregister.de.
3. Petter has said go on a filled sign-up form and clicked the final button
   himself (DEC-20261027-C). The session prepares the form; it does not sign
   up.

Until then: no account, no API key, no calls. The questions are drafted in
`docs/company/OUTBOX.yaml`, row `registercheck-terms-provenance`, and only the
Strale inbox routine sends it.

## The 20-company set

Register numbers below are candidates from public company imprints as
recalled; **none was verified against the register this session.** Each is
"to confirm" against the official register index before the run. Where no
candidate is given, one is chosen at run time.

| # | Company | Legal form | Court | Register no. | Why it is in the set |
|---|---|---|---|---|---|
| 1 | Siemens AG | AG | München (and Berlin-Charlottenburg) | HRB 6684 (to confirm) | Large court; two seats |
| 2 | Bayerische Motoren Werke AG | AG | München | HRB 42243 (to confirm) | Large court |
| 3 | Wirecard AG | AG, insolvent | München | HRB 169227 (to confirm) | Insolvency status |
| 4 | Deutsche Bank AG | AG | Frankfurt am Main | HRB 30000 (to confirm) | Large court |
| 5 | Zalando SE | SE | Berlin-Charlottenburg | HRB 158855 B (to confirm) | Large court; SE form |
| 6 | Hapag-Lloyd AG | AG | Hamburg | HRB 97937 (to confirm) | Large court |
| 7 | Otto GmbH & Co KG | GmbH & Co. KG | Hamburg | to confirm | GmbH & Co. KG |
| 8 | Deutsche Lufthansa AG | AG | Köln | HRB 2168 (to confirm) | Large court |
| 9 | Henkel AG & Co. KGaA | KGaA | Düsseldorf | HRB 4724 (to confirm) | Large court; KGaA |
| 10 | Robert Bosch GmbH | GmbH | Stuttgart | HRB 14000 (to confirm) | GmbH; owner is a foundation |
| 11 | Volkswagen AG | AG | Braunschweig | HRB 100484 (to confirm) | Mid-size court |
| 12 | SAP SE | SE | Mannheim | HRB 719915 (to confirm) | Mid-size court |
| 13 | United Internet AG | AG | Montabaur | to confirm | Small court |
| 14 | Openlaw GmbH | GmbH or UG | München | HRB 292661 (to confirm form) | Recent small company; form conflict to resolve |
| 15 | A UG (haftungsbeschränkt) chosen at run time | UG | small court | to confirm | UG form |
| 16 | A partnership KG (not GmbH & Co.) chosen at run time | KG | to confirm | HRA, to confirm | Plain KG, HRA |
| 17 | DATEV eG | eG | Nürnberg | GnR, to confirm | Genossenschaft register |
| 18 | ADAC e.V. | e.V. | München | VR, to confirm | Vereinsregister |
| 19 | Amazon EU S.à r.l., Niederlassung Deutschland | branch of a foreign company | München | to confirm | Foreign branch |
| 20 | A company first registered in the last 6 months, chosen at run time | GmbH | to confirm | to confirm | New registration |

Also needed at run time: one company deleted (gelöscht) after liquidation in
the last two years, replacing row 3 or row 16 if the set needs both. Rows 15,
16 and 20 are picked from the register's own announcements on the day.

## Fields compared

For each company, from OpenRegister (via `german-company-data`) and from
registercheck:

| Field | Match rule |
|---|---|
| Name | Exact after Unicode NFC, case-fold and whitespace collapse |
| Legal form | Same form after mapping both vendors' labels to one list |
| Status (active, in liquidation, insolvent, deleted) | Same state after mapping |
| Registered address | Street, postcode and city equal after normalising "Str." and "Straße" |
| Officers (managing directors, board) | Same set of full names; record extra and missing names |
| Register number and court | Exact register type, number and court |
| Last change date | Same date; a later date on one side counts as fresher, not a mismatch |
| Shareholders (where filed) | Same names and shares; record which side has the newer list date |

Each field is scored `match`, `mismatch`, `only A`, `only B` or `both empty`.
A mismatch is checked by hand against the register record before it counts
against either side.

## Latency and cost

- Latency: the median and worst of three calls per company per vendor,
  measured from the same host, spaced to stay inside each vendor's limit.
- Cost per call: credits used per lookup on each side, converted at the
  plan's credit price once the currency is known. OpenRegister: 10 credits
  for a canonical-id lookup, 11 for a name lookup (executor comment).
- Spend: 20 companies × 3 calls × about 10 credits is about 600 credits.
  Even one call per company (about 200 credits) exceeds registercheck's
  50-credit trial, so the run needs a paid plan, which is a spend decision
  for Petter.

## What would change the plan

- Openlaw declines resale or will not say how the copy is obtained: drop the
  vendor and record it `rejected`.
- Openlaw names a licensed channel: run the comparison.
- The same provenance questions land against OpenRegister: the answer may
  affect the live capability, not just this evaluation.
