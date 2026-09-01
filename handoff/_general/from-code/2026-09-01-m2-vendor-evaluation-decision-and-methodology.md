Intent: Preserve `DEC-20260511-D` as an inactive M2 pointer candidate and
retain its separate evolving Vendor Evaluation Methodology without activating
new authority or changing product behavior.

Outcome:
- PR #471 merged as `01eb86113e96c8f2e40d8a56d4d055e6e2f4e036`.
- Added the candidate record for `DEC-20260511-D` with no invented relation to
  `DEC-20260518-E` or `DEC-20260518-G`.
- Kept the immutable record to the pointer/evolution relationship; preserved
  the four empirical rules, phased evaluation, checklist, historical budget
  heuristics, and six worked examples in a separate M2 evidence/gap report.
- Recorded the source's stale five-versus-six example wording and qualified
  commit `e04601e2` plus its reports as partial underlying evidence.
- Reconciled the historical `Proceed?` prompt with the current Charter: agents
  own technical preflight and spend inside existing authority; accounts, terms,
  vendor contact, licensing, commitments, and representation remain
  founder-reserved.
- Documented that no controlled launcher, credential-release boundary, or call
  ledger currently covers all production vendor-evaluation calls. M3 must build
  or designate that boundary before claiming fail-closed enforcement; uncovered
  manual/external paths remain partial.
- Context generation was reproducible; tests passed 54/54; context check had
  zero findings; GitHub `check` and `integration-db` passed.
- Claude Opus/Sonnet plan and exact reviews timed out. Fresh xhigh Codex plan
  and exact-commit reviewers passed and completed; the Claude review remains on
  the M4-blocking backlog.
- Journal:
  https://app.notion.com/p/3ce67c87082c8127bcf4fe305029d828?pvs=204

Authority:
- The record remains `authority_scope: none`, `authority_active: false`, and
  `migration_status: candidate`.
- No entrypoint, protocol, skill, vendor route, credential, production state, or
  source Notion page changed.
- `AGENTS.md`, `CLAUDE.md`, and Notion remain authoritative until M4.

Next:
- Continue M2 with the next collision-free active/load-bearing decision batch.
- In M3, inventory production vendor-evaluation call paths before designing the
  launcher/credential gate, then create the versioned protocol body, router and
  coverage entries, preflight/closeout contract, and call/evidence read-back.
- Keep the `vendor-switch` skill distinct: it governs replacement of an already
  selected upstream, not evaluation of a new vendor.
- When Claude returns, review exact commit `2102891c` (or the then-current
  equivalent) before M4 activation.
