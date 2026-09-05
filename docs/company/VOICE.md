# Voice — writing rules

Moved out of `DESIGN-SYSTEM.md` (T14, 2026-09-02) so the writing rules and
the claims register that enforces the fact-based half of them sit next to
each other. `DESIGN-SYSTEM.md` covers colour/type/components for internal
reports; this covers how anything Strale writes — internal reports,
customer-facing copy, PR descriptions, session summaries — should read.

## Writing rules — as binding as the colours

Plain English is part of the system, not a preference:

- **Use audience-appropriate terms (DEC-20260905-A).** Use *tools* as the primary marketing catalogue noun; use *data services* when explaining the underlying service. Keep exact technical identifiers such as `capabilities` where developers need the API contract. Not "circuit
  breaker open" but *switched off*. Not "x402 payers" but *paying customers*.
  Not "quarantined" but *paused*.
- **Say what it means for the business.** Finished work is described by what
  changed for you or the customer, not by what the code does. Commit messages
  are rewritten before they reach the page.
- **Decisions are written as questions you can answer.** One sentence, in your
  words, with my recommendation underneath.
- **Never dress up a number.** If a measurement can't be trusted yet, the page
  says so and shows a dash rather than a figure that reads as a fact.
- **Say the uncomfortable thing first.** If revenue fell, that is the headline.

## The claims half of voice

The rules above are about tone. A second, narrower set of rules is about
**fact** — which specific claims Strale is allowed to make in public,
customer-facing copy, and which are forbidden outright regardless of how
they're phrased. That set lives as data, not prose, for the same reason
design tokens do: a rule written only in a document gets followed until
someone forgets to re-read the document.

`docs/company/claims.yaml` (schema: `claims.schema.json`) is that register —
one row per claim, ruled `allowed` (may ship, evidence on file),
`needs_evidence` (may ship only alongside working evidence), `forbidden`
(must never appear), or `retired`. `npm run claims:check` scans README.md,
every package's README, every manifest's `description` field,
`apps/api/src/lib/platform-facts.ts`, and (read-only, when the sibling
checkout is present) `../strale-frontend/public/llms.txt` for forbidden
phrases and fails the build on a match; `needs_evidence` claims whose
evidence doesn't resolve produce a warning. Wired into CI alongside
`env:check` and `models:check`.

Case study the register exists because of: the 2026-04-30 cert audit found
the methodology page still said "OpenSanctions" three days after the
platform moved to Dilisense (DEC-20260429-A). That specific failure mode —
a stale VENDOR NAME — is `check-platform-facts-drift.ts`'s job, not this
register's; `claims.yaml` is deliberately scoped to claim PHRASING
(certifications, superlatives, scope-widening framing) so the two checkers
never carry the same list compared two different ways.

Before writing customer-facing copy that makes a factual or comparative
claim, check `claims.yaml` for an existing ruling. If none exists and the
claim is more than a plain description of what a capability does, propose a
row (status `needs_evidence` unless it's obviously fine) rather than
shipping the copy and hoping.
