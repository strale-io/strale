Intent: implement T13 (design tokens as data, candidates, promotion) per
`archive/sessions/2026-09-02-t13-design-tokens-plan.md`, in the isolated
worktree `strale-wt-t13` on `feat/design-tokens`.

## What was built

`design/` (new directory), structure exactly as the plan specifies:

- `design/README.md` — what is active, what is a candidate, how to propose
  and promote, what the checker enforces.
- `design/tokens/schema.json` — JSON Schema 2020-12, `oneOf` between the
  `active.json` shape (`surfaces` map) and a candidate shape (one surface
  plus `name`/`status`/`supersedes`/`superseded_by`).
- `design/tokens/active.json` — two surfaces:
  - `internal-reports`: palette/type/spacing/radii/shadows/motion captured
    from `apps/api/scripts/lib/design-system.ts` (TOKENS + DESIGN_SYSTEM_CSS)
    as of this PR. `adopted_by: "DEC-20260815-A"`, `adopted_at: "2026-08-15"`.
    Spacing scale `[1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,18,20,22,24,53,56]`
    and radii scale `[2,3,4,5,6,7,8,10,12,"50%","full"]` were derived
    programmatically by extracting every px value used in
    margin/padding/gap and border-radius declarations across
    `DESIGN_SYSTEM_CSS` — this is a judgment call: the plan says each
    surface carries a spacing/radii "scale" but the source CSS is a
    hand-tuned stylesheet, not an authored scale, so the scale here is
    literally "every value the stylesheet already uses," not a designed
    4pt/8pt grid. It happens to be dense enough (1–24, plus 53/56) that
    every actual value in the three lint targets fell on it.
  - `website`: captured from `strale-frontend` `main` at commit
    `04c9fca970d82b2c98145973816d52086b3b91d` (`git rev-parse origin/main`
    in that repo) — `src/index.css` (HSL custom properties, dark theme),
    `tailwind.config.ts` (Inter + JetBrains Mono, radius scale), `index.html`
    (title/meta). `adopted_by: "unrecorded"` with a `note` explaining no
    decision record ever adopted it — per the task's explicit instruction.
    Palette values are stored as raw `"H S% L%"` triples (the source's own
    format), not converted to hex — judgment call, to keep the capture
    byte-faithful to the source rather than introduce a lossy conversion.
- `design/tokens/candidates/quiet-material-v0.7.json` (`status: proposed`)
  and `codex-handoff-round-23.json` (`status: exploring`), each with
  `provenance` pointing at the preserved material in `strale-frontend`
  (`design/candidates/quiet-material-v0.7/.../design-tokens.css`; the
  `05_DESIGN_SYSTEM_DELTA.md` / `06_TYPOGRAPHY_SPEC.md` handoff docs,
  respectively). Both are flat-palette subsets of larger source files —
  quiet-material-v0.7's source also defines gradient/image-backed tokens
  the flat JSON schema here doesn't represent; documented in the file's own
  `notes`.
- `design/explorations/README.md` (convention) and
  `design/explorations/2026-09-01-quiet-material-v0.7/README.md` (the one
  exploration that needed preserving as a folder — the codex-handoff-round-23
  candidate was extracted straight from its self-contained spec doc, so no
  exploration folder was created for it; noted in `PROVENANCE.md`).
- `design/PROVENANCE.md` — six entries: internal reports (adopted,
  2026-08-15), website dark Inter theme (unrecorded), frontend
  `design-system/` draft v1 (superseded, 2026-04-15 — recorded as a lineage
  step only, no file survives), Quiet Material v0.5 (superseded by v0.7 —
  the source folder disagrees with itself about its own canonical version;
  I resolved it in favour of the more specific, more recently touched
  `CURRENT-DESIGN-SYSTEM.md` over the folder's own top-level `README.md`),
  Quiet Material v0.7 (proposed), Codex handoff round 23 (exploring — its
  own document calls itself "decision-complete," which is a spec-authoring
  status, not a promotion status; I did not let that override the token
  file's actual `status`).
- `design/lint-allowlist.json` — seeded with **6 unique off-token literals
  (10 raw occurrences)**, all in `apps/api/src/lib/digest-formatter.ts`: the
  five SQS-grade badge hex colors (`#16a34a #65a30d #d97706 #ea580c
  #dc2626`) and `#ffffff` (badge text). `ceo-dashboard.ts` and
  `interrupt-sender.ts` had zero findings — they use `COLORS.*` property
  references from `email-templates.ts`, not literal hex/rgb/font-family
  text, and every margin/padding/gap/border-radius px value in both files
  happened to land on the internal-reports spacing/radii scale.

## Build pipeline

- `scripts/generate-design-tokens.mjs` — reads
  `design/tokens/active.json`'s `internal-reports.palette`, writes
  `apps/api/scripts/lib/design-tokens.generated.ts` (a flat `TOKENS`
  export), `--check` mode diffs and exits 2 on drift. Only the flat token
  values are generated — `DESIGN_SYSTEM_CSS`'s component classes have no
  representation in the token schema, so `design-system.ts` still authors
  the stylesheet itself, now built from the imported `TOKENS`. This is a
  judgment call reconciling two plan statements that would otherwise
  conflict ("writes design-tokens.generated.ts from active.json" vs. "keep
  TOKENS and DESIGN_SYSTEM_CSS exports... unchanged so consumers don't
  change") — I resolved it as: generate the data, keep authoring the
  presentation.
- `apps/api/scripts/lib/design-system.ts` — now `import { TOKENS } from
  "./design-tokens.generated.js"; export { TOKENS };` followed by the
  unchanged `DESIGN_SYSTEM_CSS` template literal. Every class name, every
  consumer import path, and the `TOKENS`/`DESIGN_SYSTEM_CSS` export names
  are unchanged — `ceo-dashboard.ts`, `digest-formatter.ts`,
  `interrupt-sender.ts` needed zero edits.
  **Bug fix along the way:** `docs/company/DESIGN-SYSTEM.md`'s colour table
  had drifted — it listed `--acc: #5A57D6`, but the actual code
  (`design-system.ts` TOKENS, and every generated page) has used `#2563EB`
  since 2026-08-15. The rewritten doc now reads `#2563EB` (matching
  `active.json` and the real source). Flagging this because it's a content
  correction beyond what the plan asked for, not just a reformat.

## Checker

- `scripts/design-lib.mjs` — schema validation (Ajv 2020, `strict: false`),
  one-active-file check, candidate-status check (mostly subsumed by the
  schema's `status` enum — a bad/missing status fails as `SCHEMA_INVALID`,
  not a separate code), `checkPromotionRequiresDecision` (git-show against
  `origin/main`; absent-there and ref-unavailable both pass, matching the
  plan's exemptions), the off-token literal lint (`checkLint`), and a
  **separate** `checkAllowlistRatchet` that diffs `design/lint-allowlist.json`
  itself against `origin/main`'s copy — any local entry not present there is
  `ALLOWLIST_GROWTH`. I split growth-detection from stale-entry-detection
  into two different comparisons (current-code-vs-allowlist for staleness,
  git-history-vs-allowlist for growth) because they need different
  baselines; the plan's single sentence ("fails if the allowlist grows or
  if an allowlisted entry no longer exists") reads as one ratchet but is
  actually two orthogonal checks once you have to implement it.
- Lint scope, as a judgment call: the plan's "px/rem value not on the
  surface's spacing/radii scale" is implemented narrowly, against
  `margin`/`padding`/`gap` (spacing) and `border-radius` (radii) CSS
  properties specifically — not every bare px number in the file (which
  would also flag font-size and dozens of other things the plan's spacing/
  radii language doesn't cover).
- `scripts/check-design.mjs` — CLI (`npm run design:check`, `--json`),
  mirrors `check-research.mjs`: runs `checkAllDesign` then appends the
  generated-file-staleness finding from `generate({check:true})`.
- `scripts/design.test.mjs` (`npm run design:test`) — 21 tests, node:test,
  each failure mode planted in a throwaway git repo built with a real
  `origin/main` remote-tracking ref (a local bare repo, fetched) so the
  promotion/ratchet checks exercise real git plumbing, not a mock: schema
  violations (missing required field, bad candidate status, invalid JSON),
  multiple active files, missing active.json, promotion without a decision
  (and the fix), absent-on-origin/main and no-origin/main-available passes,
  unchanged-file pass, off-token hex/font-family/off-scale-spacing/
  off-scale-radius (each with a fix), the HTML-entity false-positive guard
  (`&#128202;` is not a hex color), allowlist stale-entry, allowlist growth
  (and shrinkage is not growth), generated-file stale/missing/regenerated.
  All 21 pass.
- **Bug caught and fixed during testing:** the spacing-property regex
  (`margin|padding|gap`) had a capturing group around the property-name
  alternation, so `findPxViolations` was reading the property name instead
  of the value out of match group 1 — the spacing/radii check would never
  have found a real violation. Caught by the "off-scale margin px value…
  fails" test failing against the real implementation; fixed by making the
  alternation non-capturing. Re-scanned the real consumer files after the
  fix — the result (0 spacing/radii violations) was unchanged, so the seed
  allowlist above didn't need updating, but the check itself was dead
  before this fix and is real now.
- Also fixed during testing: the hex-literal regex matched HTML numeric
  character references (`&#128202;` in `digest-formatter.ts`'s emoji
  markup) as false-positive six-digit hex colors, since every digit in
  `128202` is coincidentally a valid hex digit. Excluded via lookbehind/
  lookahead on `&`/`;`.

## CI / docs / cross-references

- `.github/workflows/ci.yml` — `npm run design:check` and `npm run
  design:test` added immediately after `research:test`, inside the `check`
  job (which already has `fetch-depth: 0`, confirmed by reading the
  workflow before wiring — the promotion/ratchet checks need `origin/main`
  to resolve).
- `docs/company/DESIGN-SYSTEM.md` rewritten to one page per the plan: same
  writing rules verbatim, colour table now sourced from (and marked as a
  read-only rendering of) `active.json`, "candidate in progress" and
  "how to propose" sections added, history moved to `design/PROVENANCE.md`.
- `docs/project/ROADMAP.md` section 7 — one sentence added pointing at
  `design/README.md` and `design/PROVENANCE.md`.
- Identical paragraph added to `CLAUDE.md` (under "### Research and ideas",
  before "### Session contract") and `AGENTS.md` (same position, `##`
  level to match that file's heading depth) — confirmed byte-identical
  content, only the heading marker level differs per each file's existing
  convention.
- `docs/project/legacy-authority-inventory.json` regenerated via
  `git add -A && npm run context:generate && git add -A` per the
  inventory-drift rule; `node scripts/check-project-context.mjs --json`
  returns zero findings.

## Verification (all green)

`npm run design:check` · `npm run design:test` (21/21) · `npm run
research:check` (37 files, ok; 5 pre-existing unrelated warnings) · `npm run
research:test` (31/31) · `npm run programs:check` / `programs:test` (30/30)
· `node scripts/check-project-context.mjs --json` (zero findings) ·
`npm run typecheck` (apps/api + typecheck:scripts + sdk-typescript +
langchain + semantic-kernel-strale + mcp-server, all clean).

**Judgment call on typecheck:** `packages/mcp-server` and
`packages/sdk-typescript` had no `dist/` in this worktree, so
`packages/langchain`'s `import from "straleio"` and `apps/api/src/routes/mcp.ts`'s
`import from "strale-mcp/tools"` failed to resolve — unrelated to T13 (pure
worktree provisioning state, matches the documented "Worktree node_modules
Hazard" pattern). Ran `npm --workspace=packages/mcp-server run build` and
`npm --workspace=packages/sdk-typescript run build` to produce their `dist/`
output before typecheck would pass; did not touch their source. Flagging
in case CI's own workspace build order differs from what I assumed locally.

## Not done / explicitly out of scope

Per the plan: no `apps/web`, no change to `strale-frontend`, no fix to its
28 hex literals / 325 arbitrary Tailwind values (they move with the site
per ROADMAP section 7, where the same checker will apply), no visual
redesign, no promotion of either candidate.

Final commit: see `git log -1` on `feat/design-tokens` after this handoff's
own commit — pushed.
