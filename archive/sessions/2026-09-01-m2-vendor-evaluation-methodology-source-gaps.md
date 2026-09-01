---
doc_type: migration-evidence
authority_scope: none
status: evidence
complete: true
phase: M2
authority_active: false
created_at: 2026-09-01
source_verified_at: 2026-09-01
---

# M2 vendor-evaluation methodology source and enforcement gaps

> [!CAUTION]
> **M2 EVIDENCE — NOT AN ACTIVE PROTOCOL.**
> This report preserves the current Notion methodology and reconciles later
> authority. It does not authorize production calls, vendor contact, accounts,
> terms, licensing, commitments, routing changes, or M4 cutover.

## Source relationship

`DEC-20260511-D` and Vendor Evaluation Methodology v1.0 are deliberately
different artifacts:

- the [Decision](https://app.notion.com/p/35d67c87082c81299957e2884a40d69e)
  establishes Rule H's durable pointer relationship;
- the [methodology](https://app.notion.com/p/35d67c87082c819f9cecd689c6fa5d10)
  owns the evolving operational content;
- [Working Rules](https://app.notion.com/p/33c67c87082c81ca91c7f5bfdccea5a2)
  contains the implemented Rule H wording and its claimed enforcement; and
- the [workstream-close Journal](https://app.notion.com/p/35d67c87082c810da042f2d768702b55)
  records the empirical origin.

The exact Decisions-data-source query returned one active, global, unsuperseded
row for the ID, dated 2026-05-11 with medium confidence. Neither the ID nor the
methodology page collides with another formal row.

## Dated methodology snapshot

This section is a faithful evidence snapshot of v1.0 as last edited on
2026-05-11. It is intentionally outside the immutable Decision record so a
future versioned protocol can evolve without rewriting history.

### Rule 1 — sandbox limits

Sandbox APIs establish authentication behavior and response wire shape. They
do not establish production coverage or depth because responses may be fixtures
keyed to endpoints rather than the supplied entity. Test plans that infer
coverage from sandbox data remain unverified until bounded production calls
measure real entities.

### Rule 2 — cross-source identifier verification

Before an entity-specific production call, verify the intended legal entity's
identifier with at least two independent sources and record both. The source
shape in v1.0 is the entity's own legal/imprint page plus an independent
registry or regulator, not two search results repeating the same claim.

The failure being controlled is subtle: a plausible, correctly formatted
identifier may resolve to an operating subsidiary, a defunct registration, or
another branded legal entity. A vendor can return a valid `200` for the wrong
entity, producing a false passing evaluation.

### Rule 2 extension — vendor claims require retesting

Vendor-representative assertions about identifier or endpoint coverage count as
one input, not ground truth. Independently verify the identifier and reproduce
the claimed result. The source records a claim that failed two production
retests, demonstrating that support answers can inherit the same lookup errors
as agent research.

### Rule 3 — cross-source domiciliation verification

Confirm that the tested legal entity is legally domiciled in the jurisdiction
being evaluated, not merely branded, operating, or holding assets there. Use
the relevant national register or the entity's legal/imprint source. An office
or commercial presence is insufficient.

### Phased evaluation shape

1. **Discovery and sandbox:** enumerate endpoints, tiers, identifier formats,
   authentication, and JSON/wire envelopes. Draw no production-coverage
   conclusion.
2. **Production coverage:** predefine the required-field set, use verified
   fixtures, measure roughly one or two entities per jurisdiction where that is
   the agreed scope, and record HTTP outcomes, returned fields, wire deltas,
   identifier quirks, latency, and spend.
3. **Targeted retests:** investigate empty or surprising results with alternate
   verified identifiers and tiers. Independently retest specific vendor claims.
4. **Gap/fallback verification:** measure unverified countries, deeper tiers,
   and fallback products rather than extrapolating advertised breadth.
5. **Closeout:** consolidate the phases into one durable evidence change that
   updates the relevant vendor state, audit evidence, and capability/routing
   surfaces. A chat-only report is not a persistent closeout artifact.

### Historical application checklist

The v1.0 page requires an evaluation to:

- load the current methodology by reference;
- define Phase 1 endpoint and sandbox scope;
- define the Phase 2 required-field set;
- estimate production-call cost before spending;
- identify the two independent identifier sources for every fixture;
- run phases sequentially and expose weaknesses in the method;
- consolidate the closeout into durable surfaces; and
- version the methodology when a new rule or better example emerges.

### Historical budget heuristics

The source describes approximately EUR 5 including VAT, 50–60 production
calls, and one focused working day as the empirical full-vendor-evaluation
shape. It tells each historical Claude Code prompt to print the estimate and ask
`Proceed? (yes/no)` before paid calls.

These numbers and that approval interaction are dated methodology evidence, not
standing authority. Fresh pricing, task-specific caps, stop conditions, and the
current weekly budget must govern any future run.

## Worked examples and source inconsistency

The methodology's final numbered archive preserves six lessons:

1. an Openapi IT endpoint returned a sandbox fixture for a different entity
   than production returned for the same request;
2. an OMV VAT found through search pointed to the wrong entity and reversed the
   initial Austrian coverage conclusion after correction;
3. a plausible voestalpine identifier resolved to an operating subsidiary,
   not the intended parent;
4. a claimed OTP Bank identifier resolved to OTP Faktoring;
5. an ArcelorMittal Luxembourg coverage claim from a vendor representative
   returned no data in two production runs; and
6. Bank of Cyprus Holdings was Irish-domiciled despite Cypriot branding, so a
   different Cypriot legal entity was required for the CY test.

The workstream-close Journal and one sentence in the methodology say five
examples. The final numbered archive, methodology version note, Decision, and
Rule H say six. This report preserves the six enumerated examples and treats
the two references to five as stale count wording. All names, identifiers,
prices, and endpoint behavior remain May 2026 evidence and must be rechecked
before use.

## Later-authority reconciliation

### Technical calls no longer default to a founder question

The operating charter now delegates technical evaluation design and external
spend inside the existing EUR 50/week envelope. A future protocol should record
the preflight and have the agent make the technical go/no-go decision within
that authority; it should not make Petter arbitrate call counts, fixtures, or
endpoint choice.

The authority boundary remains strict. If execution requires creating an
account, accepting terms, contacting a vendor, negotiating or signing a
licence, a recurring commitment, or representing Moonlighter AB, the run stops
as `AUTHORIZATION_UNAVAILABLE`. The agent prepares the settled recommendation
and exact authority request but does not perform the reserved act.

### Evidence quality is not legal or commercial approval

A technically successful evaluation does not establish redistribution rights,
scraping permission, lawful personal-data processing, acceptable licensing, or
commercial viability. Active sourcing doctrine, customer-data policy, the six
fee probes in `DEC-20260518-G`, and the Charter remain independent gates.

### Notion/direct-update wording is pre-cutover

The source says routine methodology updates land directly on the Notion page
and describes Notion or the filesystem as persistent authority. That remains
historical pre-cutover behavior during M2. M4 must replace it atomically with a
versioned repo protocol and repo review/history. The durable lesson is narrower:
an ephemeral chat or session-sandbox artifact is never authority.

## Current repository evidence

Commit
[`e04601e2`](https://github.com/strale-io/strale/commit/e04601e2f143c4efbb08a84282b6543b7ff46944)
landed the previously stranded Openapi reports at:

- `docs/research/2026-05-06-openapi-com-sandbox-test.md`; and
- `docs/research/2026-05-06-openapi-com-phase-b-production.md`.

They preserve partial underlying sandbox/production observations, including
wrong-entity and empty-response risk, but they predate the final methodology
and do not contain its complete corrected corpus.

The current `vendor-switch` skill governs replacement of an already selected
upstream and closing drift across vendor-named surfaces. It is not a new-vendor
evaluation protocol and contains pre-cutover Notion instructions of its own.
No current entrypoint routes Rule H.

## Enforcement gaps

Working Rules describes two mechanisms: tick the methodology checklist in the
evaluation prompt and cite the methodology in the closeout Journal. Neither is
currently fail-closed:

- the checklist lives on the same Notion page and is not loaded by an entrypoint
  or merge-blocking prompt template;
- a missing Journal citation causes no repository failure;
- `PROTOCOL-ROUTER.md` remains an inactive M1 skeleton;
- there is no full body under `docs/governance/protocols/`;
- there is no coverage-manifest entry connecting trigger, Decision, body,
  execution surface, and read-back;
- no accepted preflight schema validates fixture sources, legal domicile,
  required fields, cost/call limits, stop logic, or authority state;
- no controlled launcher, credential-release boundary, or call ledger makes all
  production vendor-evaluation calls observable; and
- the standalone methodology page lacks the governance header required by its
  own Working Rule B.

## M3/M4 acceptance shape

M3 should first inventory every way a vendor-evaluation production call can be
issued. It must create or designate a launcher/credential gate that requires an
accepted preflight before releasing credentials or making calls. Only paths
behind that boundary may be described as fail-closed; external or manual paths
remain explicitly partial.

After that boundary exists, M3 can add:

- a versioned full protocol body containing the then-current methodology;
- a router and coverage-manifest entry for the exact production-evaluation
  trigger;
- a durable preflight/closeout artifact contract;
- tests that prove credentials/calls are refused without accepted preflight;
  and
- a read-back reconciling approved scope, observed calls/spend, and durable
  closeout evidence.

M4 may activate the repo route and retire the Notion dependency only after the
coverage is measured, remaining partial paths are explicit, cross-provider
review is complete, and the cutover anti-regression gates pass.
