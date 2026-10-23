# Way of working: what Strale should change

**Status: proposal, nothing applied.** Written 2026-10-23 for Petter. No rule,
hook, gate or entrypoint was changed. Every "retire" or "simplify" below waits
for his yes, and the ones that remove a safety rule or move authority are his
call alone.

**What was read** (read-only, default branches):

| Source | Ref read |
|---|---|
| WoW-Core | `C:/Users/pette/Projects/wow-core` `origin/main` @ `8c89d09` (the checkout sits on `state/close-infra-window-2026-10-17`) |
| Tilja | `tilja-monorepo` `origin/main` @ `03abcd79` (the current authority); `tilja` (frozen legacy checkout, same remote) glanced; `tilja-frontend` `origin/master` @ `54e2984` |
| Cinver | `cinver` `origin/main` @ `c3019deb`, plus the master's state branch `claude/blissful-gates-pmts7x`; `cinver-site` `origin/main` @ `6c106e42` |
| Global | `C:/Users/pette/.claude/CLAUDE.md`; `C:/Users/pette/.claude/skills/` holds only `strale/` and `synced/` |
| Strale | this repo at `f402d3db` (= `origin/main`), plus the unmerged `origin/m4/cutover` |

Remote refs were not fetched, so a sibling repo may be slightly ahead of what
is cited here.

---

## Summary in plain words

Strale's rules were written one incident at a time, and almost every one of
them was a reasonable answer to something that really went wrong. The trouble
is the total. A Claude Code session starts by loading a 76 KB `CLAUDE.md`
(about 19k tokens; Codex loads a separate 25 KB `AGENTS.md`). Every PR runs
the 61-step CI workflow, and about half of its check steps check the
paperwork, not the product. In the last 60 days, 153 of 289
merged pull requests (53%) were about governance and process. In the last 25
CI runs on pull requests, 11 failed, and every one of the 11 failed on a
paperwork check. None failed on the product.

The newer projects do three things differently:

1. **Their standing instructions are short.** A pointer file loads every time,
   and the detail is read only when a task needs it. Cinver's `CLAUDE.md` is
   18 lines and Tilja's is 73. Strale's is 792.
2. **The ceremony matches the risk.** A docs change, a feature and a
   production money change get three different levels of review and gating.
   Strale applies roughly the same ceremony to all of them.
3. **The machinery is shared.** Session gates, review rules, model routing and
   lessons live once in WoW-Core and are copied into each project. Strale opted
   out in August (`.claude/wow-core.optout`, "parallel house style") and has
   since built its own version of most of these, which it now maintains alone.

The production-safety rules Strale earned the hard way, about deploys,
migrations, money paths, scraping, shared checkouts and published packages, are
better than anything in the newer projects, and they should stay. Most of what
should go is the migration and register machinery built in August and
September to move off Notion. That migration (T7) has been stalled since
2026-09-13.

---

## 1. What the newer way of working does that Strale doesn't

Evidence paths are relative to each repo, at the refs above.

| # | Practice | Where it lives | Strale today |
|---|---|---|---|
| A | **One short contract for both tools.** `AGENTS.md` is canonical. `CLAUDE.md` is `@AGENTS.md` plus a few Claude-only lines, under 80 lines. A "bounded reading map" says which core file to read for which task, and nothing else is read at startup. | wow-core `AGENTS.md` (§Bounded reading map), `core/WAYS_OF_WORKING_CORE.md` §2 (CLAUDE.md under 80 lines) and §8; Cinver `CLAUDE.md` 18 lines and `AGENTS.md` 102; Tilja `CLAUDE.md` 73 and `AGENTS.md` 170 | `CLAUDE.md` 792 lines / 76.5 KB, plus `AGENTS.md` 403 lines / 24.7 KB as a hand-maintained "condensed derivative", plus `.claude/PROTOCOL.md` 1,453 lines. The T7 rewrite on `m4/cutover` still leaves `CLAUDE.md` at 716 lines. |
| B | **Gates sized by reversibility.** Two-way small, two-way wide and one-way doors get different deciders and different process. Review is tiered 0/1/2. | wow-core `core/PACE_CORE.md` §1 and §3 | Ceremony is mostly flat. The charter has good authority tiers (`docs/company/CHARTER.md`), but review and gates do not use them. |
| C | **Conflict-free live state.** One live state file, at most 40 lines, owned by the master session. Every PR adds one lane note (`.claude/lane-notes/<branch>.md`) instead of editing shared state, and the master folds the notes after merges. | wow-core `core/WAYS_OF_WORKING_CORE.md` §2 "Live state" and "Lane note shape"; `scripts/fold-lane-notes.mjs` | The handoff gate makes every code change edit the program register's `next_action` or add a handoff file (`scripts/handoff/handoff-check.mjs` `resume-surface`). The result is 322 files in `handoff/_general/from-code/` and a T7 `next_action` that runs to about 70 lines of prose in `docs/programs/cto-readiness/tracks.yaml`. |
| D | **One merge gate, owned by GitHub.** The required check `merge-gate` runs under a ruleset with no bypass. A PR merges itself when it is labelled `ready-to-merge`. Nothing runs on a plain push, and a later push removes the label. | wow-core `.github/merge-gate/README.md`, `.github/workflows/pr-gate.yml`; Tilja and Cinver run the same | CI runs on every push and every PR. A `classify` job already skips the code steps on docs-only PRs, but every register step still runs. The required check `check` is `strict` (the branch must be up to date with main). Sessions merge their own PRs through auto-merge after CI. CI is fast (about 4 min for a successful run), so cost is not Strale's problem; register steps that fail are. |
| E | **Root `REVIEW.md` plus tiered independent review.** Every reviewer reads one brief: what failure looks like in this repo, what to always check, what to skip. A GO is recorded as `GO at <sha>, rounds: <n>`, and `review-convergence.mjs` measures rounds per PR. There are two rounds, then the orchestrator fixes the rest. | wow-core `REVIEW.md`, `core/MODEL_ROUTING.md` "When independent review is REQUIRED", `core/BUILDER_CORE.md` §4, `scripts/review-convergence.mjs` | No `REVIEW.md`. The `/go` skill still tells reviewers about `src/lib/sqs.ts` (`.claude/skills/go/SKILL.md:39`), a file deleted in May. Review routing in `CLAUDE.md` is a 70-line dated history of Codex quota amendments. |
| F | **Builder briefs with executable acceptance lists.** A brief names the tests and observable outcomes that make it done. Builds push checkpoints, run gates in the foreground and stop at 3 hours. | wow-core `core/BUILDER_CORE.md` §1–§2 | Ad hoc, per session. |
| G | **Lessons are searched and cited at the point of use.** Lessons are split by domain, searched by noun (`rg -i '<nouns>' -g 'LESSONS*.md'`) and cited as "Prior learning applied: LES/GLES-NNN". Generic lessons flow both ways between the projects. | wow-core `core/LESSONS_GENERIC.md` (digest and index), `core/LESSONS_*.md`, README "Change rule" | `docs/company/LESSONS.md` is 1,516 lines of narrative failure families (F1–F12). It is read whole or not at all, and nothing flows to or from the other projects. |
| H | **"Never again" rules, enforced or deleted.** (1) A PR that replaces a mechanism deletes the old one, enforced by `check-retired-names.mjs`. (2) Check what the platform already provides before building a tool. (3) One merge gate. (4) Infrastructure changes only in a window the founder opens. (5) Judge progress by product outcomes, not by a count of infrastructure PRs. | wow-core `AGENTS.md` §Never again; `scripts/check-retired-names.mjs` | Strale has the exact failure these rules prevent: the old system stays (Notion, `.claude/PROTOCOL.md`, the waived Codex register) while a new one is built alongside it. |
| I | **One master session with lanes under it.** The founder talks to one session. Lanes run on their own branches and report through their PRs. Lane sessions are kept short and cheap, and accounts are paced. | wow-core `core/PACE_CORE.md` §2a, `templates/sub-orchestrator/` | Several sessions share one checkout. The "one batch worktree" rule (`WORKTREES.md`) cannot be met with parallel sessions; there are 6 checkouts right now. |
| J | **Machine-wide guards.** `wow-hook.mjs` blocks a `git commit` in the primary checkout while another session is live, halts on the third identical failure, and applies a shell-policy guard. `heavy-slot.mjs` caps heavy local jobs across every repo. | wow-core `scripts/wow-hook.mjs`, `hooks/guard-bash-policy.mjs`, `scripts/heavy-slot.mjs` | `scripts/guard-tree-integrity.mjs` repairs damage after the fact. The Shared-Checkout Rule is prose. |
| K | **Founder time protocols.** Standing delegation by class, one founder queue of at most six items with steps and a recommendation, ask last, and monitor by exception (a green routine is one line). | wow-core `core/PACE_CORE.md` §5 | The charter already delegates more than the fleet default does. But `docs/company/DECISION-QUEUE.md` is 1,108 lines, and the daily run writes a PR, a handoff file and a brief every day. |
| L | **Model routing as a registry.** Each role has a tier. Model and effort are pinned on every agent launch, from one `models.json`. | wow-core `core/MODEL_ROUTING.md`, `core/models.json`, `scripts/models.mjs` | Product model ids are a registry (`apps/api/src/lib/models.ts`), which is good. Agent routing lives only in auto-memory ("always name `model`"). |
| M | **Product canon as the judge.** `PRODUCT.md` is DEC-gated and is the tie-breaker for every review. Known·True·Unknown applies before a design freeze. UX, voice and anti-AI-slop baselines apply to copy. | wow-core `core/WAYS_OF_WORKING_CORE.md` §3, `core/RESEARCH_CORE.md`, `core/UX_CORE.md`, `core/VOICE_CORE.md`, `skills/human-prose/` | `docs/project/PRODUCT.md` exists but is marked "M2 candidate — not active project authority" on main. Positioning and voice are being reworked in other sessions now (`docs/programs/brand-website/`). |

Two caveats keep this honest:

- **The newer projects are not lean everywhere.** Tilja's `DECISIONS.md` is
  6,753 lines and its overlay 1,035. Cinver's `pr-gate.yml` is 1,021 lines and
  its `ci-local` about 4,100 lines of code. Both have stale `STATUS.md` files,
  and the `GO at <sha>` record is built but barely used in Tilja. What Strale
  should take is the mechanisms (short contract, tiers, lane notes, the shared
  gate and guards), not the volume.
- **Some WoW-Core pieces are being retired at the source.** WoW-Core's own
  queue retires `verify-task-target` (the signed task-target receipts; wow-core
  `TASKS.md` "Script retirement (wave 3, rest)"), and Cinver has two examples
  of it. Strale should not adopt task-target receipts.

What Strale has that WoW-Core lacks, and should keep and offer upstream as
generic lessons: deploy-mechanism verification, bulk-operation resumption,
the append-only migration ledger, the bind-parameter shape test, the env
manifest, the claims register, the charter's customer-data boundary, and the
CEO brief's editorial gate.

---

## 2. Ranked changes for Strale

Ranked by how much each speeds up building or improves the product, per unit
of effort. Effort: S under a day, M one to three sessions, L more than that.

| Rank | Adopt or replace | Why it speeds building or improves the product | Effort | Risk |
|---|---|---|---|---|
| 1 | **Cut the entrypoints to the WoW-Core contract shape.** `AGENTS.md` becomes canonical and pointer-only (target ≤150 lines). `CLAUDE.md` becomes `@AGENTS.md` plus Claude-only notes (≤80). The mandatory protocol bodies move to the existing `docs/governance/protocols/` mirrors and are read through a reading map ("touching a deploy-pipeline dependency → read DEPLOY_MECHANISM"). The decision list, the capability prose and the dated routing history leave the entrypoint. | Every Claude Code session and every subagent loads the 76 KB `CLAUDE.md` (about 19k tokens) before doing anything, on top of the global file and memory, and every Codex session loads the 25 KB `AGENTS.md`. The cost is paid again in every context, plus the cost of rules a model skims past because there are too many. It also ends the hand-maintained `AGENTS.md` copy, which drifts. | M | **Medium.** A live rule could be lost in the move. Mitigate with the existing coverage manifest (`docs/project/protocol-coverage.yaml`): every heading gets a destination or an explicit retire before the old text goes. Do the cut once, inside the T7 close (rank 3), not twice. |
| 2 | **Retire the one-off migration and register gates from CI** (list in §3, group G). Keep the product-safety checks. | 11 of the last 25 PR CI runs failed, every one on a register step: 10 on `generate-archive-index.mjs --check` and 1 on `context:test`. In 10 of the 11, the same PR passed on the next run. These are reruns with no product signal; the archive-index failures are a forgotten regeneration, which an automatic regeneration fixes as well as retirement does. The register machinery also produced the 60-day share of 53% governance PRs. | S–M | **Low** for the archive index (regenerate automatically, or retire with T5's index exit). **Low** for the Codex check, but it needs a decision superseding DEC-20260910-A, which keeps it. **Medium** for `context:*` and `protocols:*` until rank 1 lands, because those checks guard the entrypoints during the cut, and `context:test` also carries the only decision-record validation (§3 G). |
| 3 | **Re-scope and close T7 (Notion off).** Ship the production pieces of `m4/cutover`: repo-native digest readers (#680), the vendor-roster drift retarget (#681) and the end-session and vendor-switch flows (#679). Combine them with rank 1's contract cut in one small, reviewed change. Drop the parity, coverage and closure machinery that only exists to make the cutover provable (`entrypoint-parity-lib.mjs` 1,441 lines, its 1,861-line test, `m2-closure-register-*`). | T7 has been stalled since 2026-09-13. Its branch is 24 commits behind main, PR #682 has been open for six weeks, and a rescue branch holds unmerged follow-up work. While it waits, every session still carries both the Notion rules and the repo-native rules. Of the branch's 9,473 added lines, 5,476 are code, mostly cutover proofs. | M | **Medium.** On 2026-09-11 Petter delegated the cutover merge to Claude, on the condition that every batch in the inventory merges after its own review and a whole-PR review passes (auto-memory; `tracks.yaml` still says founder-gated). Re-scoping changes those conditions, so it needs his yes. Abandoning the parity proofs means trusting one independent review instead of a mechanical parity check; once `CLAUDE.md` imports `AGENTS.md`, parity is structural. T7's exits ("pass entrypoint parity", "all guards blocking") and batch 8 (schema change, authority-marker flip) must be rewritten in the same change (§4 table). Keep the batch-1 keep/obsolete decisions (`archive/sessions/2026-09-11-m4-b1-starter-kit-rules.md` on the branch) as the input list. #679–#681 touch the `Dockerfile` and the production digest, so DEC-20260504-C deploy verification applies. |
| 4 | **Replace the "update the register on every code change" rule with lane notes plus a ≤40-line live state file.** Use `docs/project/STATE.md` (now 193 lines) or a new root `STATUS.md`. Programs stay for multi-week work, but `next_action` becomes one line. | Parallel PRs stop colliding on `tracks.yaml`, sessions stop writing handoff prose nobody reads, and orientation is one short file. The fleet measured the same problem: one repo's state file was edited by 24 of 64 merges, another's `TASKS.md` by 62 of 237 (wow-core WoW §2 evidence). | S–M | **Low** for the state itself (history stays in git and PRs). It depends on rank 5's gate change: today both Strale's gate and WoW-Core's shared one require every code change to rewrite the status doc. |
| 5 | **Adopt WoW-Core's shared handoff gate and `wow-hook.mjs` guards in place of Strale's fork.** Keep "clean, pushed, no merged branches, never commit on main". Replace "at most one batch worktree" with the shared gate's `worktree` check (canonical, own, peer-pushed, session copy or baselined). Add the primary-checkout commit guard and the 3× identical-failure halt. **Caveat:** the shared gate's `status-doc` check is the same rule as Strale's `resume-surface`, and it cannot be switched off (wow-core `scripts/handoff/README.md`, the `checks` toggles in `handoff-check.mjs`). Making it accept a lane note is an open WoW-Core item (wow-core `TASKS.md`, "Tilja gate wiring"). That change has to land upstream first, or rank 4 cannot work. | Strale maintains 1,354 lines of handoff gate and tests alone. The one-batch rule fails whenever two sessions run, which is the normal case now. The commit guard turns part of the Shared-Checkout Rule from prose into a mechanism. That rule exists because of five incidents, including the deletion of the whole repository on 2026-09-02. | M | **Medium.** It touches the guards around the worst incident family (F12). Run both gates side by side for a week before removing Strale's. Keep `guard-tree-integrity.mjs`. |
| 6 | **Tiered review with a root `REVIEW.md`.** Tier 2 for Strale covers wallet and settlement, x402, auth and API keys, migrations on live data, screening outputs (sanctions, PEP, adverse media), public claims and published packages. Everything else gets one clean-context review or none. Record `GO at <sha>, rounds: <n>`. Replace `/go` with the WoW-Core `/review` and `/fresh-eyes` flow plus a Strale overlay. | Reviewers get one page of what actually breaks Strale, instead of a CLAUDE.md read. Ordinary docs work stops paying for review; gate, hook and doctrine edits stay tier 2 even in markdown (wow-core `MODEL_ROUTING.md` required subset, `PACE_CORE.md` rationalizations), and the founder's 2026-09-07 policy keeps the independent-review requirement itself. Money paths get two lenses, which is better than today's one generic reviewer. The two-round cap stops review loops: the M2 closing review ran 16 rounds (`42f17d83`). | M | **Low.** Review gets stronger where it matters. The incident protocols (DEC-20260504-A/B/C, DEC-20260422-A) become `REVIEW.md` "always check" lines, so they are kept. |
| 7 | **Join the WoW-Core lessons exchange.** Take the `lessons` profile now (it ships GLES, `BUILDER_CORE` and the handoff gate, and never touches house doctrine), and convert `LESSONS.md` families into searchable LES entries. | Strale gets the fleet's generic lessons (GLES-001 to GLES-166) for free, and the fleet gets Strale's best ones (hollow tests, a comment is not evidence, refusals are not faults, the shared object store). Search-and-cite is cheaper than reading 1,516 lines. | S (profile) + M (conversion) | **Low.** The lessons profile never touches house doctrine (wow-core `README.md` "Consumption model"), but it also ships the handoff gate files to `.claude/scripts/handoff/` (inert until wired), and a sync is infrastructure, so it waits for a window. |
| 8 | **Founder queue and monitor-by-exception for the daily run.** `DECISION-QUEUE.md` becomes at most six live items in the state file, each with steps, cost and a recommendation. History is archived. A green daily run is one line. The brief is written only when something changed or a decision is waiting, and the brief lint runs only on PRs that touch `docs/company/briefs/`. | Petter's attention is the scarcest resource. Today he gets a dated brief and a check-in PR whether or not anything happened (9 of the 11 product fixes in the last 30 days are named after a check-in). | S | **Low**, but the brief format is Petter's own design (DEC-20260822-A), so changing its cadence is his call. |
| 9 | **Turn the capability pipeline into a skill.** Add `/onboard-capability` (manifest, `onboard.ts --discover`, validate, readiness, smoke) and run the readiness check in CI on changed manifests. | Building capabilities is the product. Today the how-to is about 100 lines in `CLAUDE.md` that every unrelated session loads. A skill loads only when needed and can carry a "Common rationalizations" table. | S | **Low.** It protects DEC-20260320-B better than prose does. |
| 10 | **GitHub-owned merge gate.** Label-triggered `merge-gate`, a ruleset with no bypass, non-strict required check. Adopt it with full WoW-Core adoption. | Removes the "strict: branch must be up to date" rerun chain when PRs run in parallel, and gives one merge path for Claude and Codex. Lower priority here than elsewhere, because Strale CI already costs about 3 minutes. | M | **Medium.** Every merge to main deploys to Railway, so every merge is a one-way door unless a DEC names the class. The charter already says shipping is not Petter's decision (DEC-20260815-A). Record that as the class delegation, as Tilja did with DEC-190. |
| 11 | **Agent model routing as a registry.** Sync `models.json` and `models.mjs`, and pin model and effort on every `Agent` call. | Cheaper subagents by default (auto-memory already wants this). One place to update when models change. | S | **Low.** |
| 12 | **Activate the product canon.** Make `docs/project/PRODUCT.md` the authoritative judge (it is still marked M1 skeleton). Use Known·True·Unknown before a new vertical or vendor. Coordinate with the brand-website program; do not touch it from here. | Reviews and design choices get one tie-breaker on direction, instead of `GOALS.md` (1,328 lines) and dated strategy papers. | S–M | **Low.** Product decisions stay Petter's. |

**What not to adopt:** signed task-target receipts (being retired at the
source), Cinver's merge trains and 1,000-line gate (Strale's volume does not
need them), large lane fleets (Cinver measured its master session at about 60%
of spend in the first hour of a 15-lane wave), one giant `DECISIONS.md`
(Strale's one-file-per-decision records in `docs/decisions/records/` are
better), and `reports/` evidence trees (Tilja reached 1.5 GB).

---

## 3. Rule-by-rule review

**Verdicts:** **keep** as is; **simplify** (keep the protection, cut the
text or the ceremony); **merge** into another rule or a WoW-Core mechanism;
**retire**.

**Friction scale:** *none*; *low* (seconds per session); *med* (minutes per
session or per PR); *high* (it blocks PRs or costs a session).

**Incident flag:** **⚠** means the rule exists because of a real outage, a data
loss, a public embarrassment or a near-miss. Do not remove a ⚠ rule without
moving its protection somewhere stronger first.

### A. Session ceremony and entrypoints

| Rule | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| Swedish local time for Petter | `CLAUDE.md` top | keep | Cheap and new. Move to `AGENTS.md`. | none | |
| Session start: declare intent, Quick/Full mode, escalation triggers | `CLAUDE.md` §Session Start, `.claude/PROTOCOL.md` | retire | A starter-kit ritual that the bounded reading map (wow-core `AGENTS.md`) replaces. No decision depends on the mode label. | low, every session | |
| Quick and Full session checklists (connectivity check, Notion To-do archive, Journal entry, handoff file) | `CLAUDE.md` | retire | Notion steps end with T7. "Commit, push, one next-action line" replaces the rest (wow-core WoW §8). | med, every session | |
| Code-review gate before `/end-session` (`/go`) | `CLAUDE.md` checklist step 5 | merge | Review belongs at merge, by tier (rank 6), not at session end. | med | |
| `.claude/PROTOCOL.md`, `WORKFLOW.md`, `RUNBOOK.md`, `BUILD.md`, `DISPATCH.yaml`, `NOTION.md` (about 5,300 lines; mentions Linear, which Strale does not use) | `.claude/` | retire | T7 batch 1 already extracted the live rules and archived these on `m4/cutover`. Bring that over to main. Update the links at `CLAUDE.md:11` and `AGENTS.md:21`, and regenerate `docs/project/legacy-authority-inventory.json`, which lists all six; `BUILD.md`, `DISPATCH.yaml` and `WORKFLOW.md` also reference each other. | low, but they mislead any session that opens them | |
| `AGENTS.md` as a hand-condensed copy of `CLAUDE.md` | `AGENTS.md` §About | merge | Invert it: `AGENTS.md` canonical, `CLAUDE.md` imports it (rank 1). Ends drift. | med (every rule change edits two files) | |
| Dated founder routing record (Codex override, three amendments, DEC-20260910-A narrative) | `CLAUDE.md` §Review routing | simplify | Collapse to one line: "Independent review in a separate context, same provider allowed (founder 2026-09-07); tiers per `REVIEW.md`." Move the history to `archive/`. | low per session, but it is about 70 lines read every time | |
| Batch loop: stored plan, independent review per batch, record on the branch, Journal step | `docs/programs/cto-readiness/PROGRAM.md` §The batch loop | simplify | Keep "fail-before tests" and "review before merge". The plan file becomes the PR body plus a builder brief (wow-core `BUILDER_CORE.md` §1), review follows the tiers (rank 6), the record becomes a lane note, and the Journal step retires with Notion. | med per batch | |
| Repo-native migration continuation pointer | `CLAUDE.md` | retire | Retires with T7. | none | |
| Program register (`PROGRAM.md` Resume here, `tracks.yaml`, `programs:check`) | `docs/programs/`, `CLAUDE.md` | simplify | Keep programs for multi-week work. Make `next_action` one line, and move session-to-session state to lane notes (rank 4). | med (merge conflicts, long prose) | |
| Session contract: orient first | `CLAUDE.md`, SessionStart hook | simplify | Keep the hook. The output should be the WoW-Core startup block (at most 15 lines). | low | |
| Session contract: gate before stopping (`handoff:check`, six-block Stop escape) | `scripts/handoff/`, `.claude/hooks/handoff-stop.mjs` | merge | Replace with the shared WoW-Core gate (rank 5). Keep clean, pushed and no merged branches. Replace `resume-surface` with a lane-note check (needs the upstream `status-doc` change) and the one-batch-worktree check with the shared `worktree` check. | high when parallel sessions run (the gate cannot pass, so it blocks up to six times; it did so to this session) | ⚠ (the checkout incidents) |
| At most one batch worktree | `WORKTREES.md`, handoff gate | merge | Incompatible with parallel sessions, and auto-memory already records it as unsatisfiable. While this review was being finished, it blocked this session's stop six times over two sibling sessions' worktrees. Its protection is real, though: LESSONS F12 names "refuse to end a session with an unregistered worktree" as a discriminating guard. Move it to the shared gate's `worktree` check, which accepts canonical, own, peer-pushed and baselined trees and fails the rest, plus `prune-worktrees.ps1` for merged, clean, old trees. | high (unsatisfiable) | ⚠ (F12) |
| Worktrees and branches in `baseline.json` wait for a founder decision | `scripts/handoff/baseline.json` | keep | It prevents deleting someone else's work. WoW-Core has the same baseline. | none | ⚠ |
| Git hooks: refuse commit on main, refuse push to main | `.githooks/` | keep | Cheap. Later also enforce it with a GitHub ruleset (rank 10). | none | ⚠ |
| Pre-commit: inventory target edited without `context:generate` | `.githooks/pre-commit`, `scripts/project-context-lib.mjs` | retire | It guards the generated context layer, which exists for the cutover. Auto-memory records "run `context:generate` twice, merge main first" as recurring friction. This review's own first commit, which added two markdown files, was refused by it until a 984-line JSON inventory was regenerated. | med per affected commit | |
| Codex notify wrapper and `.codex/hooks.json` | `scripts/handoff/codex-notify.mjs` | merge | WoW-Core's user-level `~/.codex/hooks.json` → `codex-hook.mjs` covers Codex in every repo. | low | |
| Report filing convention and the fixed root contents list | `CLAUDE.md` | simplify | Keep the root list (registries need those files at the root). Make it a one-line check or a `REVIEW.md` "always check" line, not prose. | low | |
| Root `AGENTS.md` refresh duty | `CLAUDE.md` §Report Filing | retire | Moot once `AGENTS.md` is canonical. | low | |

### B. Notion governance

| Rule | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| Notion access, workspace structure, governance rules (check before creating, one page per topic, Journal, To-do DB as the only task list) | `CLAUDE.md` | retire | T7's purpose. Cinver and Tilja retired Notion the same way (Cinver DEC-102 moved its canon verbatim to `docs/archive/notion/`). | med (two sources of truth) | |
| Workflow invariants: never edit Journal or Decision content, never delete in Notion, corrections as new entries | `CLAUDE.md` | simplify | Keep the principle for the repo: decisions are append-only and a reversal is a new record (= wow-core `DECISIONS.md` rule). Drop the Notion wording. | none | |
| Global decisions always get confirmation; supersessions use the Contradiction Protocol | `CLAUDE.md` | simplify | Keep "conflict duty" (quote the decision you would violate) as one line. The full protocol was already kept in batch 1. | low | |
| Degraded mode (Notion down → `[BACKFILL]`; Git down → stop) | `CLAUDE.md` | simplify | Keep "Git down → stop". The Notion half retires. | none | |
| Move completed To-dos to the Archive page | checklists | retire | Retires with Notion. | low | |

### C. Review routing and the Codex register

| Rule | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| `codex-review-backlog.yaml` and `codex:check` / `codex:test` in CI | `docs/programs/`, CI | retire the check, archive the file | All 36 rows were waived (DEC-20260910-A) and no new rows are added. The check now guards an immutable history nobody edits. It blocked every PR from 2026-09-07 to 2026-09-10. DEC-20260910-A says the register and `codex:check` stay "so the waived history stays immutable", so retiring the check needs a decision superseding that clause. Archived files are immutable in git anyway. | low now, high in September | |
| Fresh read-only Claude agent as the independent review | `CLAUDE.md` amendments | merge | Becomes the tier 1 and tier 2 review in `REVIEW.md` (rank 6). | none | |
| `/go` skill (scope detection, verification, `/simplify`, PR) | `.claude/skills/go/SKILL.md` | simplify | Keep scope detection and the capability verification steps. Remove the deleted `sqs.ts` references and the "never edit sqs.ts" rule. Hand review to the tiered flow. | low | |
| `/end-session` command | `.claude/commands/end-session.md` | simplify | Becomes "commit, push, next-action line". The full `/sweep` runs at milestones only (wow-core PACE §7). | med | |

### D. Evidence, receipts and registers

| Rule | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| Evidence receipts, write-once, `receipts:check` | `archive/receipts/`, CI | simplify | Keep receipts for production evidence (deploy verification, bulk-operation outcomes) and keep their immutability. Drop the warning about test counts in handoff prose. WoW-Core's rule is that the PR body is the receipt (PACE §7). | low–med | |
| Migration ledger, `migrations:check` | `startup-migrations.ledger.json`, CI | keep | Two migration blocks once fought over one column on every boot (2026-08-21). Cheap and product-relevant. | low | ⚠ |
| Research front-matter contract, `research:check` | `docs/research/`, CI | keep | Cheap, and it keeps sources attached. Consider adding a `process` type. | low | |
| Ideas only in `IDEAS.md` | `docs/company/IDEAS.md` | keep | Same as WoW-Core. | none | |
| Design tokens, `design:check` | `design/` | keep (out of scope here) | Owned by the brand-website sessions. Not reviewed. | — | |
| Env manifest, `env:check` | `config/env-manifest.yaml` | keep | It stops undocumented secrets and dead config. Product safety. | low | |
| Model registry, `models:check` | `apps/api/src/lib/models.ts` | keep | Product model ids in one place. | low | |
| Claims register, `claims:check` | `docs/company/claims.yaml` | keep | Stale public claims are failure family F6, and an outward claim is a one-way door. cinver-site has the same idea in `CLAIMS.md` with `copy-check.mjs`. | low | ⚠ |
| Vendor roster, `vendors:check` | `config/vendors.yaml` | keep | On 2026-09-11, #633 switched vendors off while #634, merged 40 minutes later, still listed them as active, and the check stayed green. Fix it to read executor hosts, then keep it. | low | ⚠ |
| Distribution registry, `distribution:check` | `docs/operations/distribution-registry.yaml` | keep | Part of the DEC-20260422-A protection. | low | ⚠ |
| Scheduled-mechanism registry, `scheduled:check` | `config/scheduled-mechanisms.yaml` | keep | Verifies that cron jobs exist in both directions (DEC-20260504-C family). | low | ⚠ |
| `scheduled:outcomes` (manual) | DAILY-RUN | merge | Belongs in a daily patrol routine that reports only red items (wow-core `skills/patrol/`). | low | |
| Docs index, `docs:check` | `docs/README.md` | keep | Trivial and never fails. | none | |
| Archive index, `generate-archive-index.mjs --check` | CI | simplify or retire | It caused 10 of the last 11 CI failures, each a forgotten regeneration. Cheapest fix: regenerate in the pre-commit hook (or a bot commit) instead of failing CI. Retiring it outright also drops `handoff/README.md` and rewrites T5's exit ("archive/ and handoff/ have generated indexes"). | **high** | |

### E. Production and product protocols

| Rule | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| Capability Onboarding Protocol (DEC-20260320-B) plus the manifest pipeline how-to | `CLAUDE.md` (about 100 lines) | simplify | Move the how-to to an `/onboard-capability` skill and run the readiness check in CI on changed manifests (rank 9). The rule itself stays. | med (loaded every session) | ⚠ (8 EU registries broke on asserted optional fields) |
| Field reliability rules (guaranteed / common / rare) | `CLAUDE.md` | keep, move into the skill | It directly prevents false test failures. | none | ⚠ |
| Distribution PR Integrity Protocol (DEC-20260422-A) | `CLAUDE.md`, `docs/governance/protocols/` | keep, simplify | A real public embarrassment (pydantic-ai #4866), and outward-facing, so a one-way door. Move to a skill plus `REVIEW.md` tier 2. `check-framework-packages.mjs` already runs in CI. | low (it only triggers on distribution work) | ⚠ |
| Post-publish production smoke test | DEC-20260422-A step 6 | keep | Found `strale-mcp` shipping zero trust data for about 3.5 months. | low | ⚠ |
| Audit-follow-up test coverage (DEC-20260504-A) | `CLAUDE.md` | merge | Generalise it into one `REVIEW.md` tier-2 rule: a fix on a money or compliance path ships with a fail-before test, and DB writes assert the bind-parameter shape. Keep the bind-shape test idea. It could become a lint. | low | ⚠ (paid `/v1/do` returned 500 for capped users for 4 days; retention pruning failed silently) |
| Bulk-Operation Deploy Protocol (DEC-20260504-B) | `CLAUDE.md` | keep, move to `REVIEW.md` tier 2 | The Postgres volume filled and crash-looped for 28 minutes. | low (rare trigger) | ⚠ |
| Deploy Mechanism Verification Protocol (DEC-20260504-C) | `CLAUDE.md` | keep, move to `REVIEW.md` tier 2 | A 28-minute customer-facing outage from a migration script that never ran. "Query prod for the effect" is the rule that matters. | low | ⚠ |
| Test infrastructure cost principles A/B/C (zero-cost probes, validate before paid calls, piggyback never scheduled) | `CLAUDE.md` | keep, move to `REVIEW.md` "always check" for capability PRs | Direct money protection. Principle B could become a lint. | none | ⚠ |
| Scoring Integrity (retired note) | `CLAUDE.md` | retire | The SQS engine was deleted in May. Keep one line, "fix root causes, never bend a scorer", in `REVIEW.md`. | low | |
| Wire-shape rule for trust endpoints (canonical values, `*_formatted` additive) | `CLAUDE.md` | keep, move to `REVIEW.md` | Fixed a real broken fallback card (cert-audit 2026-04-30). | none | ⚠ |
| Drift-prevention surfaces (`platform-facts.ts`, `usePlatformFacts`) | `CLAUDE.md` | keep, shorten | A good single-source pattern. Two lines are enough. | none | |
| Cross-repo updates (`llms.txt`, sitemap, `AuditRecord` shape check) | `CLAUDE.md` | simplify | Retarget to `apps/web` when it serves production (DEC-20260902-A). The weekly drift workflow already enforces the shape contract. | low | |
| `vendor-switch` skill | `.claude/skills/vendor-switch/` | keep | Exists because of cert-audit RED-2, when the methodology page named the wrong vendor for 3 days. | none | ⚠ |
| Scraping doctrine (DEC-20260428-A, DEC-20260813-A) | `CLAUDE.md` decisions | keep as decision records, out of the entrypoint | Legal risk. One line in `AGENTS.md` non-negotiables plus a pointer. | none | ⚠ |
| Data-service engineering bar (DEC-20260428-B) | decisions | keep, out of the entrypoint | Regulatory-grade requirements for compliance builds. Tier 2 trigger. | none | |
| Active Decisions list (DEC-1 to DEC-23, the March to September lists) | `CLAUDE.md` (about 60 lines, much of it single dense paragraphs) | retire from the entrypoint | They are in `docs/decisions/records/` (247 files). Several are long superseded: DEC-3 "keyword matching for 5 capabilities", DEC-4 "founder is the only provider for 3 months". Keep a generated index. | med (read every session) | |
| Capabilities and Quality prose (x402, the March 2026 capability notes, KYB families, SQS deletion, free tier, test modes) | `CLAUDE.md` | simplify | Move facts to `docs/project/PRODUCT.md` / `STRUCTURE.md`. Keep the two gotchas that bite (the boot rewrite of `scheduled_testing_eligible`; the free-tier canonical source) as LES entries. | med | |

### F. Concurrency and machine safety

| Rule | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| Agents that edit files run with `isolation: "worktree"` | `CLAUDE.md` Shared-Checkout 1 | keep | The actual prevention. WoW-Core's "one writer per working tree" says the same. | none | ⚠ (about 1,000 files vanished, three times, 2026-08-14) |
| Never `git checkout` a branch in the main tree; check `git status` first | Shared-Checkout 2–3 | keep, mechanize | Add the `wow-hook` primary-checkout commit guard (rank 5). | none | ⚠ |
| Never "fix" phantom breakage; run `guard-tree-integrity.mjs` | Shared-Checkout 4, PostToolUse hook | keep | It restores tracked-and-deleted files only, so it cannot discard work. | none | ⚠ |
| Never use `git stash` | Shared-Checkout 5 | keep, mechanize | `refs/stash` is shared across worktrees, and a sibling's work was popped on 2026-08-16. Add a deny for `git stash` to the shell-policy guard. | none | ⚠ |
| Worktree `node_modules` junction hazard (`npm install` per worktree, `git worktree remove`, never `rm -rf`) | `CLAUDE.md` | keep, mechanize | Part of failure family F12, which includes the deletion of the whole repository on 2026-09-02. The bash guard could refuse `rm -rf` on a worktree path. | none | ⚠ |
| Mutation testing through `mutation-test.mjs` only (F11) | `docs/company/LESSONS.md` | keep | Uncommitted work was destroyed six times. It belongs in `REVIEW.md` and the builder checklist, not only in LESSONS. | none | ⚠ |

### G. One-off migration machinery (built for the Notion exit)

| Rule or check | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| M2 closure register, decision-row grammar, git-qualified keys (DEC-20260904-A/B) | `scripts/m2-closure-register-lib.mjs`, `docs/project/m2-closure-register.yaml` | retire after T7 | M2 closed on 2026-09-11. The closing review alone took 16 rounds. Auto-memory records a trap where the closed register still scans plan lines. | high in September, low now | |
| Protocol coverage manifest and generated router (`protocols:coverage`) | `docs/project/protocol-coverage.yaml`, `PROTOCOL-ROUTER.md` | use once, then retire | Use it as the checklist for the rank 1 cut, then delete it. A reading map in `AGENTS.md` replaces the router. | med | |
| Protocol mirrors divergence check (`protocols:check`) | `docs/governance/protocols/` | simplify | After rank 1 the mirrors become the only copy, so there is nothing left to diverge from. Delete the check and keep the files. | med | |
| Project-context layer and inventory (`context:check`, `context:test`, `context:generate`) | `scripts/project-context-lib.mjs`, CI | retire after T7, except decision records | `context:test` is the slowest CI step (89 s) and caused 1 of the 11 failures, and most of it exists to prove the cutover. But it also runs `scripts/decision-records.test.mjs`, and `check-project-context.mjs` calls `decision-records-lib` (active-decision immutability, id collisions), the only mechanical guard on the 247 records. Carve that out as its own kept `decisions:check` step first. The inventory hash check then goes with the pre-commit rule above. | med–high | ⚠ (decision immutability) |
| Candidates tests, digest shadow (`candidates:test`, `digest:shadow`, `m3-digest-shadow.yml`) | CI, cron | retire after T7 | Shadow-mode comparisons for a cutover that either ships or doesn't. | low | |
| Entrypoint parity check (`m4/cutover` only, 3,302 lines) | `scripts/entrypoint-parity-*` | do not merge | Moot once `CLAUDE.md` imports `AGENTS.md`. Parity becomes structural. | — | |
| `docs/project/*` M1 banners and the candidate mechanism | `docs/project/` | simplify | Activate the files that are true (rank 12) and delete the M1/M4 banners in the same change. | low | |

### H. Company operating documents

| Rule | Where | Verdict | Reason | Friction | ⚠ |
|---|---|---|---|---|---|
| Operating charter: authority split, what Petter alone decides, shipping is not Petter's call (DEC-20260815-A) | `docs/company/CHARTER.md` (466 lines) | keep the substance, simplify the text | It is ahead of WoW-Core on delegation. Restate it as PACE_CORE §1 classes plus Strale's narrowings, at about 100 lines. Changing authority is Petter's call. | low | |
| Customer-data boundary (no outreach from transaction evidence, 90-day redaction) | CHARTER | keep | Legal and privacy. Make it an `AGENTS.md` non-negotiable. | none | ⚠ (privacy) |
| Daily run: two artifacts (operating record and CEO brief) | `docs/company/DAILY-RUN.md` | simplify | Monitor by exception: one line when green. Write a brief only when something changed or a decision waits. The operating record becomes the PR body. Petter's call (DEC-20260822-A). | med per day (a PR, a handoff file and a brief daily) | |
| CEO brief lint in CI on every PR | `apps/api/scripts/check-ceo-brief.ts` | simplify | Run it only when `docs/company/briefs/**` changes. | low | |
| Escalation needs five fields; no technical question reaches Petter | CHARTER, DEC-20260822-A | keep | Same as WoW-Core "ask last" and the decision memo. Already good. | none | |
| Failure families and the three-strike rule | `docs/company/LESSONS.md` | simplify | Keep the three-strike root-cause trigger as one rule. Convert the 1,516 lines into LES entries with confidence and sources, searched by noun, and promote the generic ones to wow-core GLES (rank 7). | low–med | ⚠ (F10 approval-boundary breach, F11, F12) |
| Authorization statuses bound to code (`production-authority.ts`, charter binding test) | CHARTER, DEC-20260822-B | keep | Approval gates bound to code, not prose. That is the WoW-Core GLES-001 principle exactly. | none | ⚠ (F10) |
| Decision queue | `docs/company/DECISION-QUEUE.md` (1,108 lines) | simplify | At most six live items in the state file with steps, cost and a recommendation (PACE §5). Archive the rest. | med | |
| Goals, measurement, workforce, budget | `GOALS.md` 1,328 lines; `MEASUREMENT.md`, `WORKFORCE.md`, `BUDGET.md` | simplify, merge | Keep the revenue ladder and the €50/week envelope. That is about twice the fleet's S1 default (USD 100/month per pre-launch project, PACE §6), which is fine: Strale is live, and a project decision above the default stands as an S2 decision. Put 3–5 current product outcomes in the state file. Move workforce and model notes into model routing (rank 11). | low | |
| Charter: "the session that opens a PR merges it" and "a merge is not shipped until the served artifact is verified" | CHARTER | keep | The second half is the deploy-verification rule (⚠). The first half becomes "label `ready-to-merge`" under rank 10. | none | ⚠ |

---

## 4. Proposed migration order

Each step is one reviewed PR, or a few. Nothing starts before Petter's yes on
the decisions in step 0.

**Step 0 — Petter decides (one conversation).**

1. Become a WoW-Core consumer: the `lessons` profile in the next
   infrastructure window, and `full` after T7. This deletes
   `.claude/wow-core.optout`, a recorded decision.
2. Re-scope T7 as in rank 3, dropping the parity, coverage and closure proofs.
   This changes the conditions of his 2026-09-11 merge delegation, so it is
   his yes or no.
3. Supersede DEC-20260910-A's "`codex:check` stays" clause, so the Codex
   register check can retire now. The group G checks retire after T7. The
   archive index regenerates automatically now.
4. Daily run cadence: one line when green, a brief only when something
   changed (rank 8).
5. Infrastructure window. WoW-Core's rule 4 says hooks, gates and syncs change
   only in a window he opens. The last window closed on 2026-10-17. Steps 5
   and 6 below are infrastructure. Step 1's hook change counts as Strale-local
   infrastructure; whether that rule binds a repo that is not yet a consumer is
   his call.

**Step 1 — quick wins with no safety impact (S, any time after the yes).**
Retire the `codex:check` step. Make the archive index regenerate in the
pre-commit hook instead of failing CI. Fix the stale `sqs.ts` references in
`/go`. Scope the CEO brief lint to brief files.

**Step 2 — close T7 small (M).** Bring the production readers from
`m4/cutover` (#679, #680, #681) and the batch-7 rescue onto a fresh branch
from main, with DEC-20260504-C deploy verification, because they touch the
`Dockerfile` and the production digest. Move the six `.claude/` starter-kit
files to `archive/`. Retire the Notion rules. Rewrite T7's `next_action` and
exits, and the other track exits below, in the same change.

**Step 3 — the contract cut (M, right after step 2 or in the same PR).**
`AGENTS.md` canonical (≤150 lines), with a reading map and non-negotiables
(customer-data boundary, scraping doctrine, never commit on main, the shared
checkout rules). `CLAUDE.md` becomes `@AGENTS.md` plus Claude notes (≤80).
Protocol bodies live in `docs/governance/protocols/`. Walk
`protocol-coverage.yaml` as the checklist so no ⚠ rule is dropped. Carve the
decision-record validation out into its own `decisions:check`. Then delete
the coverage, context, candidates and closure machinery (group G).

**Track exits this plan changes** (`docs/programs/cto-readiness/tracks.yaml`):

| Track | Exit today | Change |
|---|---|---|
| T5 (done) | "archive/ and handoff/ have generated indexes and no unindexed files" | Keep, with the regeneration automatic, or drop it if the archive index retires. |
| T7 | "both tools load the same project truth and pass entrypoint parity"; "all guards blocking"; batch 8 (schema change, authority-marker flip) | Parity becomes structural (`CLAUDE.md` imports `AGENTS.md`). "All guards blocking" covers the kept product checks, not group G. Batch 8 folds into step 2. |
| T8 | "clean-session acceptance passed on Claude Code and Codex from the same commit" | Keep. It is the cheap acceptance test for step 3. |
| T9 | depends on T7 | Unchanged. It unblocks when T7 closes. |
| T15 | "never a bare test count in prose" (receipts) | Narrow to production evidence. The PR body carries test results. |

**Step 4 — review and builds (M).** Write a root `REVIEW.md` with Strale's
tier-2 surfaces and every ⚠ protocol as an "always check" line, and add the
`/review` and `/fresh-eyes` skills with a Strale overlay. Add the
`/onboard-capability` skill. Start recording `GO at <sha>, rounds: <n>`.

**Step 5 — state and guards (M, infrastructure window).** Add a ≤40-line live
state file and lane notes. Make `next_action` one line. Take the WoW-Core
`lessons` profile. First get the shared gate's `status-doc` check to accept a
lane note upstream in WoW-Core (already on its open list). Then run the shared
gate and `wow-hook.mjs` next to Strale's fork for a week, and remove the fork.
Its one-batch-worktree check is replaced by the shared `worktree` check. Add the `git stash` and `rm -rf`
denies to the shell guard. Keep `guard-tree-integrity.mjs`.

**Step 6 — full adoption (M, infrastructure window).** Run
`sync-to-project.ps1` as a full consumer: skills, model routing, health and
patrol. Then the label-triggered `merge-gate` with a ruleset, recording the
deploy-on-merge class delegation from the charter as a decision. Convert
`LESSONS.md` to LES entries and promote the generic ones. Shrink the decision
queue and the charter text.

**Step 7 — measure.** Two weeks after step 6, compare governance-PR share,
CI failures from non-product steps, rounds to GO
(`review-convergence.mjs --days 14`) and product PRs per week against the
baseline below. Keep what moved the numbers.

**Baseline for step 7** (measured 2026-10-23, all on `origin/main`):

- Merged PRs: 289 in 60 days, 153 of them governance (53%). 13 in the last
  30 days.
- PR CI: 11 of the last 25 runs failed, all on register steps; about 4 min per
  successful run (`gh run list --workflow ci.yml --event pull_request --limit 25`).
- Governance PRs: merged-PR titles matching
  `m2|m3|m4|T\d{1,2}|DEC-|program|register|receipt|handoff|gate|governance|closure|protocol|codex|worktree|AGENTS.md|ledger|inventory|checkin|decision record`,
  excluding titles starting `fix(` (`gh pr list --state merged --limit 300`).
- Entrypoint size: `CLAUDE.md` 76.5 KB plus `AGENTS.md` 24.7 KB.
- Handoff files: 322.
