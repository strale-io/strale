# Reference-data update protocol (in-repo mirror)

> **Source-of-truth note:** This file is the in-repo mirror of the chat-side reference-data update protocol. The canonical version lives in Notion Working Rules (page `33c67c87082c81ca91c7f5bfdccea5a2`) and in project knowledge (`matrix-update-protocol.md`). This repo file exists so the protocol is readable from CC's environment. If they diverge, the project-knowledge / Notion version wins; this file is updated to match.

Canonical template for any chat-side change to Strale's canonical reference data.

**Governing rule:** Working Rule J in Notion Working Rules (page `33c67c87082c81ca91c7f5bfdccea5a2`).
**Locked decision:** DEC-20260517-B (page `36367c87-082c-8104-8009-eedcd0dbcd17`).
**Related decision:** DEC-20260517-A (page `36367c87-082c-81b9-9376-c4225d38374c`) — moves Provider-Coverage matrix from Notion to repo.

---

## When this protocol applies

Apply whenever a chat session decides to change canonical reference data:

- **Provider-Coverage matrix entries** in `apps/api/coverage-matrix/*.yaml` (status, provider, price, tier coverage, ToS notes, doctrine reference, notes, evidence grade, last_verified)
- **Capability manifests** in `apps/api/src/capabilities/*.ts` (price_cents, slug, jurisdiction, schema declarations, anything else)
- **Schema file**: `apps/api/coverage-matrix/schema.json`

This protocol does **not** apply to:

- Doctrine prose pages in Notion (AVS, Coverage Matrix doctrine, Brand & voice, Working Rules) — direct chat-side edits are appropriate
- Decisions DB / Journal DB entries — direct chat-side creates are appropriate
- To-do entries
- Brand or marketing content drafts
- Code changes outside reference data

The dividing line: reference data tied to code state where drift between Notion-style stores and code produces silent failures. Notion is canonical for prose, decisions, and journal logs; the repo is canonical for reference data.

---

## Primary key

Each YAML row in `apps/api/coverage-matrix/` is keyed on `(capability_slug, country, evidence_type)`. Filenames follow the pattern `{slug}__{country_lc}__{evidence_type_slug}.yaml` (double underscore separator). Some capabilities (e.g. `uk-company-data`) appear in multiple rows because they produce multiple evidence types — this is correct and intended.

---

## Required response template

When chat decides a reference-data change, the chat response MUST follow this template:

```
## Analysis

<what changes, where, why, and a reference to the relevant DEC or capability slug>

## CC prompt

<full .md content, either inline or attached as a downloadable file>

## Reference-data delta this turn

- Changes proposed: N
- CC prompts emitted: M
- Status: complete | incomplete
```

If chat writes about a change but does not emit a CC prompt, the protocol is visibly violated in chat's own output. `M < N` self-flags incomplete.

---

## What the CC prompt must include

Every CC prompt for a reference-data change includes:

1. **Audit-first phase per Rule C** — files to read, files to modify, cross-worktree write-conflict check, current state, proposed change, upstream/downstream implications, worse-than-proposed honest check
2. **Schema validation step**: `npm run validate:coverage-matrix`
3. **Summary regeneration**: `npm run coverage-matrix:summary`
4. **CI verification**: `npm run coverage-matrix:check` (validation + stale-summary diff)
5. **Commit and closing-steps** per the cc-prompts skill (16 rules in `closing-steps-checklist.md`)
6. **Verification summary** at the end naming what was actually changed and verified

Halt conditions explicit. Per Rule C, CC halts on cross-worktree conflicts with files modified < 1h ago in another worktree.

---

## What this protocol prevents

The five failure modes named 2026-05-17:

1. Records updated incorrectly (silent translation in target store)
2. Records not updated at all (writes returned success but stored representation differed)
3. Updates stop mid-path (partial state at session termination or compaction)
4. Facts drift across sessions (no automated reconciliation between code and other surfaces)
5. Chat claims update made; next session reveals it wasn't

Each becomes a visible artifact in chat's output: the CC prompt either exists or it does not; the delta count is either reconciled or it is not. The session itself self-flags incomplete state.

---

## What this protocol does NOT prevent

Chat failing to recognize that a discussion implies a reference-data change. Example: a vendor migration is discussed; chat assumes the matrix already reflects it; the change is never surfaced as needing a CC prompt at all.

**Complement:** scheduled CC reconciliation — weekly diff of manifest state vs `apps/api/coverage-matrix/*.yaml`, posted to Journal. Drift gets caught regardless of whether anyone in any session realized a change was needed. Tracked as separate work, not part of this protocol.

---

## Canonical references

- **Working Rule J**: Notion `33c67c87082c81ca91c7f5bfdccea5a2`
- **DEC-20260517-A** (canonical surface for reference data): `36367c87-082c-81b9-9376-c4225d38374c`
- **DEC-20260517-B** (this protocol): `36367c87-082c-8104-8009-eedcd0dbcd17`
- **Reference data directory**: `apps/api/coverage-matrix/` in the strale repo
- **Schema**: `apps/api/coverage-matrix/schema.json`
- **Validation script**: `apps/api/scripts/validate-coverage-matrix.mjs`
- **Summary generator**: `apps/api/scripts/regenerate-coverage-matrix-summary.mjs`
- **CI gate**: `.github/workflows/coverage-matrix-validation.yml`
- **Migration snapshot** (pre-migration Notion state, audit trail): `apps/api/coverage-matrix/.migration-snapshot.json`
- **Browsable summary**: `apps/api/coverage-matrix/COVERAGE.md`

---

This file is the in-repo mirror. Update by editing the canonical chat-side version first (Notion Working Rules / project knowledge), then sync this file to match.
