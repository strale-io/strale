# M1 Foundation extraction boundary

Date: 2026-08-31
Base: `origin/main@1f222c6a`
Source staging checkpoint: `codex/repo-native-operating-model@b2951094`
Target branch: `codex/repo-native-foundation-m1-clean`

## Purpose

Land the already-reviewed M1 foundation as one bounded, additive, inert change.
The source staging branch combines M0 preservation, M1, and unrelated fixes; it
must not be merged wholesale.

## Included

- M1 project/decision/governance skeletons and schemas;
- warning-only checker, deterministic generator, and focused tests;
- bare legacy-authority inventory;
- migration decision, plan, consumer inventory, and public private-archive
  status pointer;
- M1/plan review evidence and M1 handoff;
- LF attributes and package scripts required by the deterministic tooling.

## Explicitly excluded

- `archive/imports/**`, including raw Notion, design, and context-pack evidence;
- M0/public-containment session reports;
- `apps/api/railway-config.md`;
- `scripts/guard-production-write-access.mjs` and its test changes;
- every root entrypoint, CI workflow, hook, skill, command, or runtime activation.

## Excluded-change disposition

1. The Railway `NOTION_TOKEN` → `NOTION_API_KEY` documentation correction is a
   real but unrelated fix: daily-digest runtime code reads `NOTION_API_KEY`. It
   will be proposed as a separate docs-only follow-up after this PR.
2. The production-write allowlist/test changes exist only to admit three
   excluded context-pack files. They are intentionally discarded from M1. If a
   later preservation PR proposes those files for `main`, the exact-path
   allowlist repair and its regression test must travel with that PR.

## Inventory expectation recorded before regeneration

The copied staging inventory has SHA-256
`d521da832b97c1d5e8c8eb8735013eb67aef0fc3b7f417e237c6a2d4c37aca6e`,
15 entries, `mode: bare-enumeration`, and `complete: false`.

On the clean branch, regeneration is expected to preserve the same 15 target
paths and owner areas. Thirteen target-content hashes should remain identical.
`docs/strategy` is expected to change because this extraction deliberately adds
the M0 completion update to the migration plan; `handoff` is expected to change
because the M1 handoff is included while the excluded M0 pagination handoff is
not. `detected_references` may shrink because excluded reports/imports are
absent. Any other target/hash change or any new dependency on an excluded path
is a finding, not an automatic overwrite.

## Regeneration result

- target path changes: 0;
- owner-area changes: 0;
- target hash changes: exactly `docs/strategy` and `handoff`, for the documented
  reasons above;
- targets with reference-list changes: 8;
- resulting inventory: 15 entries, `mode: bare-enumeration`, `complete: false`.

## Activation boundary

The checker remains warning-only and unreferenced by entrypoints or CI in M1. It
becomes blocking only in the atomic M4 cutover after replacement workflows pass
clean-session acceptance and the exact cutover diff receives independent review.

## Negative dependency scan

Every copied/generated file was scanned for the excluded archive, application,
entrypoint, CI, hook, skill, and command paths.

- `archive/imports/**` appears only in the exclusion record, the private-archive
  pointer, and preservation-plan prose; no M1 script reads a raw import.
- Railway and production-write-guard paths appear only in this boundary record
  or in generated detected-reference evidence; they are not imported or called.
- CI, hook, skill, and command paths appear only as bare inventory targets,
  current-consumer evidence, or future-cutover prose.
- `START-HERE.md` and `PROTOCOL-ROUTER.md` appear in the generator plus the
  checker's negative activation assertion; no root entrypoint links to them.

No undeclared executable dependency on an excluded file was found.
