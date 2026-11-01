Intent: close the gap where a documentation-only PR goes green while a whole-repository scanner is skipped, so the merge queue rejects the same commit a moment later.

# A green PR was not a green queue (2026-10-31)

## What happened

PR #857 was documentation only — a receipt, a handoff and two register files.
Its `check` job passed. It entered the merge queue and was dropped straight
back out: `guard-production-write-access.mjs` found the receipt naming the
production write credential.

The first explanation I reached for was wrong, and worth recording as the wrong
one: *the queue tests the PR merged into current `main`, so it sees a different
file set.* That is true of the queue and explains nothing here, because the
offending file was added by the PR itself and was present in both runs.

## The actual cause

The guard step was gated:

```yaml
- if: needs.classify.outputs.docs_only == 'false'
  run: node scripts/guard-production-write-access.mjs
```

`classify` sets `docs_only=false` for every event that is not a
`pull_request`, the merge queue included — deliberately, so the queue runs the
full gate. So on the PR the guard did not pass. **It never ran.** The queue ran
it for the first time.

That gate is right for a step that reads built code. It is a trap for this one,
because the step's comment claimed it "scans apps/api/src" while the script
actually runs:

```
git ls-files -- *.ts *.mjs *.js *.md *.yaml *.yml *.json
```

over the whole repository — including `archive/` and `handoff/`, which are
exactly two of the three roots `isDocsPath` treats as documentation. A
docs-only PR can introduce precisely what the guard exists to refuse, in a
directory the guard scans, while the guard is switched off.

## The fix

The guard loses its `if:` and joins the scanners that already run
unconditionally because they read content a docs-only PR can itself change
(`check-no-committed-secrets`, `check-pii`,
`check-manifest-guaranteed-consistency`). The CI header lists it among them and
the step comment now describes the real scan surface.

`scripts/ci/docs-only-scanner-gate.test.mjs` holds the **class**, not the
instance: any step gated on `docs_only` whose script enumerates the whole tree
fails it. Wired into `npm run gates:test`. Verified both directions — it fails
against the un-applied fix with *"the production-write guard must run on every
PR, docs-only included"*.

## Two false positives on the way, and why the final rule is narrow

Worth keeping, because the failed versions explain the shape of the one that
shipped.

1. **Keyed on the script mentioning `*.md` or `*.json`.** Flagged
   `check-cost-class-coherence.mjs`, which reads only `manifests/` — a path
   `isDocsPath` does not match, so it is correctly gated.
2. **Keyed on the script containing `archive/`.** Flagged
   `check-no-external-column-access.mjs` and `check-framework-packages.mjs`,
   which mention it in a comment and in an `apps/api/scripts/archive/`
   allowlist entry respectively. Neither scans it.

A rule that cries wolf gets muted, and a muted rule is the same as no rule. So
the shipped version keys on the git subcommand appearing as an argv string,
which is the property that actually matters. Its blind spot — a scanner reading
`docs/` through `readdirSync` rather than git would not be caught — is written
into the test rather than left for someone to discover. A companion test fails
if `isDocsPath` stops matching the three docs roots the premise rests on.

## For whoever meets this next

Two gates in two days have only bitten in the merge queue (the other was PR
#853's post-merge base). On this repository a green PR page is weaker evidence
than it looks, and the asymmetry is structural: the queue classifies as
not-docs-only, so it runs strictly more than a docs-only PR does. Anything
gated on `docs_only` is a candidate for the same surprise; this test now covers
the whole-tree scanners among them, and nothing covers the rest.
