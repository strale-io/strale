# docs/ — index

One line per top-level subtree: what it holds and its authority status.
Checked in CI by `npm run docs:check` (`scripts/check-docs-index.mjs`),
which fails when a subtree below no longer exists or when a real `docs/`
subtree has no line here.

**Authority status** (four values; each subtree's own front matter or
README is where the classification comes from — this file only restates
it):

- **authoritative today** — living reference, correct now, no M2/M4 gate.
- **candidate (M2)** — repo-native replacement under construction; carries
  `authority_active: false` in its own front matter; Notion (or another
  legacy source) remains authoritative for the same question until the
  founder-confirmed M4 cutover (`docs/project/STRUCTURE.md`,
  `docs/strategy/2026-08-31-repo-native-operating-model-migration.md`).
- **evidence** — a record of what was found, decided, or done; never a
  source of current product truth by itself.
- **historical** — describes the repo, or an incident, as it was on a past
  date; not updated when things later change.

Start here, then `docs/project/START-HERE.md` for where product/company
truth currently lives (Notion, pre-cutover), and
`docs/programs/README.md` for what work is in flight.

| subtree | authority | what it holds |
| --- | --- | --- |
| [`audits/`](audits/) | historical | Dated audit reports and traffic/registry investigations. |
| [`company/`](company/) | authoritative today | The operating charter, budget, measurement rules, lessons log, daily-run spec, decision queue, claims register, and CEO morning briefs (`company/briefs/`) — live per DEC-20260815-A / DEC-20260822-A. |
| [`decisions/`](decisions/) | candidate (M2) | Repo-native decision records (`records/DEC-*.md`) and the historical-ID collision registry. Notion's Decisions DB remains authoritative until M4. |
| [`design/`](design/) | evidence | `execution-receipt/` — the closed (all phases ACCEPTED, 2026-08-24) design and rollout record for the `strale.execution.v1` receipt system. Not to be confused with the repo-root `design/` directory (T13 design tokens, currently authoritative for on-token color/type values). |
| [`diligence/`](diligence/) | evidence | Source-diligence research for the Payee Assurance product line (registry and scraping-migration options considered). |
| [`dpia/`](dpia/) | authoritative today | Data Protection Impact Assessments for capabilities that trigger GDPR Art. 35(3) (AI synthesis, large-scale special-category processing). Referenced by manifest `gdpr_art_22_classification`. |
| [`governance/`](governance/) | candidate (M1) navigation skeleton; `protocols/` live | `governance/README.md` is an inert M1 skeleton. `governance/protocols/` holds the review-finding template and the distribution-PR pre-flight checklist — both are live, referenced directly from `CLAUDE.md`. |
| [`ide-rules/`](ide-rules/) | authoritative today | Cursor/Windsurf/Claude Code trust-sensitive-data rules, shipped to users and linked directly from the root `README.md`. |
| [`incidents/`](incidents/) | historical | Post-mortem records of production incidents, frozen at time of writing. |
| [`operations/`](operations/) | authoritative today | Live operational runbooks (HMAC rotation, x402 facilitator switch) and `operator-actions.yaml`, the machine-checked operator-action log. |
| [`programs/`](programs/) | authoritative today | The multi-batch work register (`README.md` + one `PROGRAM.md`/`tracks.yaml` pair per program). Execution record, never project truth — see its own README. |
| [`project/`](project/) | candidate (M1 skeleton + M2 candidate mix) | The repo-native product/state/roadmap/decisions candidate set, plus this track's `STRUCTURE.md` deviation record. `authority_active: false` throughout; Notion remains authoritative until M4. |
| [`release/`](release/) | authoritative today | The npm-publishing procedure, referenced from `CLAUDE.md`'s Distribution PR Integrity Protocol. |
| [`remediation/`](remediation/) | evidence | The legacy remediation program's per-package YAML ledger and status docs. Closure is tracked by CTO-readiness track T4, not restarted here. |
| [`research/`](research/) | evidence | The T12 research contract: one current answer per topic with front matter, superseded history, and a generated `README.md` index. "Evidence, never authority" by its own contract — a finding that changes direction produces a decision record, not a rewrite here. |
| [`security/`](security/) | authoritative today | Live credential-architecture and provenance runbooks, companion to `incidents/`. |
| [`smoke-tests/`](smoke-tests/) | evidence | Manual smoke-test procedures for endpoints without an automated integration lane yet. |
| [`strategy/`](strategy/) | evidence, one exception | Dated strategy documents (direction plan, program designs, build-queue analyses) — read as evidence of what was decided when. Exception: `2026-08-31-repo-native-operating-model-migration.md` carries the **Current continuation checkpoint** actively read by sessions continuing the M1–M7 migration, until M4 cutover retires it. |

## Loose files at the top of `docs/`

Four files sit directly under `docs/` rather than in a subtree, each linked
from somewhere that expects that exact path: `api-quickstart.md` and
`claude-md-snippet.md` (both linked from the root `README.md`),
`onboarding-improvements.md` (a dated post-mortem), and `x402-listing.md`.
`npm run docs:check` does not track loose files individually — only
subtrees — so a new loose file at this level is a judgement call for the
session that adds it: subtree it, or note it here.
