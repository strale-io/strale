Intent: companion prompt for the To-do "Refactor auto-register: glob-discovery → manifest-driven registration" (P2, Effort M, created 2026-05-02). Run this verbatim in a fresh Claude Code session when the trigger conditions land (PA v1 shipped, OR a real capability silently fails to register).

---

# Prompt for fresh Claude Code session

````
Read CLAUDE.md before doing anything else, then continue.

# Background — what you are fixing

`apps/api/src/capabilities/auto-register.ts` discovers capability executors at
startup via filesystem glob (every `*.ts` in `src/capabilities/`). This is the
only major component in Strale's capability pipeline that does NOT use the
manifest as the source of truth — `validate-capability.ts`, `onboard.ts`,
and `smoke-test.ts` all treat `manifests/<slug>.yaml` as authoritative.

The glob contract creates several problems:

1. **Test files get imported.** `ssrf-bucket-{a,b,c}.test.ts` files in
   `src/capabilities/` are picked up by the glob. Vitest crashes hard when
   imported outside the test runner. Result: 3 spurious `auto-register-import-failed`
   logs at every startup, baking `errors > 0` into the baseline.

2. **Real capability-import failures are indistinguishable from noise.** A
   syntax error or broken cyclic import in a real capability file produces
   the same `auto-register-import-failed` log as the test files. The day a
   real capability silently fails to register, no one will notice.

3. **The inverse error is not caught.** A manifest exists in `manifests/`
   but no executor file exists in `src/capabilities/` — current auto-register
   does not catch this because it iterates filesystem, not manifests.

4. **Latent risks.** Backup files (`.ts.bak`), private helper modules
   (`_lib.ts`), accidentally-named files all become import candidates today.

# What you are building

Switch auto-register from glob-discovery to manifest-driven registration.
For each manifest in `manifests/<slug>.yaml`:

  1. Read the slug from the manifest
  2. Check the DEACTIVATED list — if present, skip with reason logged
  3. Dynamic-import `apps/api/src/capabilities/<slug>.ts`
  4. Verify the import called `registerCapability(slug, handler)` —
     fail loudly if it didn't
  5. Log success or failure with a clear distinction between
     "executor not registered for manifest", "executor file missing",
     "executor import threw", and "deactivated"

# Constraints — do NOT break these

- All 296 existing capabilities must continue to work after the refactor.
  This is a critical-path change that runs at every API startup; a
  regression breaks the entire API.
- The `registerCapability(slug, handler)` contract stays unchanged.
  Capability files keep self-registering via side effect on import. The
  ONLY change is what triggers the import.
- The DEACTIVATED list semantics stay intact. Same skip-with-reason logging.
- The auto-register-deactivated-sync-to-DB logic at the end of
  autoRegisterCapabilities() stays as-is.
- The bridge-config-risk evaluator and other Web3 Assurance evaluators
  in `src/web3-assurance/evaluators/` are NOT capabilities — they live in
  a different directory and have their own registration via
  `registerEvaluator()`. Do not touch that pipeline. (This refactor is
  only the `src/capabilities/` auto-register.)
- The MCP server, A2A endpoint, REST API, x402 wildcard handler all read
  from the registered capability table at runtime. Their contract is
  unchanged.

# Suggested approach

1. **Read `apps/api/src/capabilities/auto-register.ts` end-to-end.** Note the
   current glob mechanism, the DEACTIVATED list shape, the
   auto-register-skip-deactivated logging, the auto-register-import-failed
   logging, the auto-register-deactivated-sync-to-DB logic, and the final
   summary log shape (`auto-register-done` with executors_registered,
   providers_registered, skipped_deactivated, errors counts).

2. **Read 3-4 representative manifests** to confirm the shape: `manifests/iban-validate.yaml`,
   `manifests/sanctions-check.yaml`, `manifests/uk-cop-check.yaml`,
   `manifests/us-ein-match.yaml`. Confirm every manifest has a `slug` field
   at the top level and that the executor filename matches the slug.

3. **Run the current auto-register baseline** to capture pre-refactor
   behavior:
   ```
   cd apps/api && npx tsx --env-file=../../.env --eval \
     "import('./src/capabilities/auto-register.js').then(m => m.autoRegisterCapabilities()).then(r => console.log(JSON.stringify(r, null, 2)))"
   ```
   Note: executors_registered count, skipped_deactivated count, errors count.
   The post-refactor counts must match (within ±0 for executors_registered
   and skipped_deactivated; errors should drop to 0).

4. **Implement the refactor.** Read manifests via `fs.readdir('manifests')` +
   YAML parse. For each manifest:
     - Extract slug
     - If slug is in DEACTIVATED, skip with the same `auto-register-skip-deactivated`
       log shape currently used
     - Otherwise, attempt dynamic import of `./src/capabilities/<slug>.js`
       (note `.js` extension because of bundler resolution; check current code
       for the right pattern)
     - After import, verify `getExecutor(slug)` returns a registered handler
     - If yes: increment executors_registered counter
     - If no: log `auto-register-no-executor-after-import` (NEW log label)
       at warn level — manifest exists, file imported, but no
       `registerCapability(slug, ...)` was called. This is a real bug.
     - If the file is missing: log `auto-register-executor-file-missing`
       (NEW log label) at error level — manifest references a slug with
       no executor file
     - If the import throws: log `auto-register-import-failed` (existing
       label, preserve it) at error level

5. **Do NOT silently fall back to the old glob behavior.** If the new
   manifest-driven path discovers fewer executors than expected, fail loudly.
   The point of this refactor is to make registration deterministic.

6. **Compare counts before / after.** Run the baseline command from step 3
   again and verify executors_registered matches the pre-refactor number
   exactly. If it doesn't, identify the missing capabilities (likely:
   manifests that don't exist yet for executors that exist, or vice-versa)
   and decide per-case whether to: (a) write the missing manifest, (b) move
   the orphan executor out of `src/capabilities/`, (c) add to DEACTIVATED.

7. **Add a one-shot diagnostic script** at `apps/api/scripts/audit-capability-pairing.ts`
   that reports any mismatches: manifests without executors, executors
   without manifests, slugs in DEACTIVATED but no manifest. This is the
   forward-looking guard that prevents the same drift in the future.

8. **Preserve the auto-register-deactivated-sync-to-DB logic** at the end
   of autoRegisterCapabilities() unchanged.

# Testing requirements

- Type-check passes: `npx tsc --noEmit -p apps/api`
- All existing tests pass: `cd apps/api && npx vitest run` (full suite)
- Specifically the Web3 Assurance composer test: `npx vitest run src/web3-assurance/composer.test.ts`
- Manual verification: hit `GET /v1/capabilities` and confirm same count as pre-refactor
- Manual verification: hit at least one capability via `POST /v1/do` and confirm execution works end-to-end

# Verification before commit

- Run the baseline command from step 3 — `errors: 0`, `executors_registered`
  matches pre-refactor (within ±0)
- Run the new audit script — confirm no orphan executors or orphan manifests
- Diff the auto-register-done log shape — same counts, lower errors
- Confirm the API boots cleanly: `cd apps/api && npx tsx --env-file=../../.env src/index.ts`,
  watch for ~5 seconds, then SIGINT. No error logs at startup.

# What NOT to do

- Do NOT change the `registerCapability(slug, handler)` contract or any
  capability file's registration call. The capability files stay unchanged.
- Do NOT touch the `src/web3-assurance/evaluators/` directory. Different
  pipeline, out of scope.
- Do NOT delete the DEACTIVATED list. Move it to a clearer location if you
  want, but the slugs in it must continue to skip cleanly with the same
  log shape.
- Do NOT add manifest-driven registration as a parallel path alongside the
  glob — replace the glob entirely. Half-migrations cause the worst class of
  silent failures.
- Do NOT skip the audit script (step 7). Forward-looking guards are how this
  drift gets prevented permanently.
- Do NOT commit until type-check + full test suite + manual API boot all
  pass cleanly.

# Commit message shape

```
refactor(capabilities): manifest-driven registration replaces glob discovery

Before: auto-register imported every *.ts in src/capabilities/, including
test files (.test.ts), backup files, and private helpers — producing 3
spurious auto-register-import-failed logs at every startup and masking
real capability-import failures behind noise.

After: auto-register iterates manifests/*.yaml, dynamic-imports the
matching executor, verifies registerCapability() was called. Manifest is
the source of truth (matching validate-capability, onboard, smoke-test).

Behavior preserved:
- registerCapability() contract unchanged — capability files unchanged
- DEACTIVATED list unchanged — same skip-with-reason logs
- auto-register-deactivated-sync-to-DB unchanged
- 296 capabilities continue to register; errors: 0 (was: 3)

New diagnostics:
- auto-register-no-executor-after-import — manifest exists, file imports,
  but no registerCapability() called. Real bug, surfaces cleanly.
- auto-register-executor-file-missing — manifest references slug with no
  executor file. Catches the inverse drift.
- scripts/audit-capability-pairing.ts — forward-looking guard

Companion to To-do "Refactor auto-register: glob-discovery → manifest-
driven registration" (Notion).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

# When you are done

- Update the To-do "Refactor auto-register: glob-discovery → manifest-driven
  registration" status to Done in Notion (Petter to confirm before moving
  to Archive)
- Write a session handoff at `handoff/_general/from-code/<date>-auto-register-refactor.md`
- Create a Journal entry in Notion documenting the refactor
- Note: this commit goes through PR review (not direct to main) because
  it touches critical-path startup infrastructure. Open a PR titled
  "refactor(capabilities): manifest-driven auto-register" and request
  Petter's review before merge.
````

---

# Notes on running this prompt

- Run in a **fresh Claude Code session** so it starts with no anchoring on the strategy/positioning conversations from 2026-05-02
- The prompt is self-contained; the agent should not need to ask for additional context beyond reading the files it lists
- Trigger conditions for actually running it: **either** PA v1 has shipped and bandwidth is available for infrastructure work, **or** a real capability has failed silently and the spurious-error baseline is implicated as the reason it wasn't caught
- Estimated time: ~4-6 hours of focused work with verification, not the "1 day" upper-bound — the refactor itself is small; the testing surface is what takes time
- Review checklist before merging: do the executors_registered counts match exactly? Does the new diagnostic script find any orphans (and have those been resolved)? Has at least one full request gone through `/v1/do` end-to-end successfully?
