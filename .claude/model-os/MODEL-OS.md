# MODEL-OS — the cross-repo, cross-provider model-routing operating system

SYNCED FROM wow-core — edit in the wow-core repo. Origin: founder directive 2026-07-09;
doctrine consolidated from idea-lab DEC-072/073/121/143 + wow-core `core/MODEL_ROUTING.md`
(stride-macro DEC-010/014-017) + LES-048 (de-correlated reviewer) + LES-105 (bounded fan-out).

**The contract:** never compromise on output quality, never spend tokens the task doesn't
need. Quality is a floor set per task by its role; cost is minimized *under* that floor,
never instead of it. When the best result genuinely needs the top tier at width, spend it —
deliberately, stated, and gated.

## 1. Architecture — three layers, one ledger

| Layer | What | Where |
|---|---|---|
| **Ledger** (machine-readable truth) | providers · models · capability view · role ladders · review policy · caps · budgets · freshness | `model-os/routing.json` — the ONLY place model names live |
| **Doctrine** (why + judgment) | this file: roles, calibre principle, review matrix, edge cases | `model-os/MODEL-OS.md` |
| **Enforcement** (must-happen, not should-happen) | SessionStart health+echo · PreToolUse subagent gate · Codex AGENTS block · step-0 hard barrier | `model-os/hooks/*.mjs`, `model-os/AGENTS-BLOCK.md` |

Rule of change: landscape shifts (new model, new provider, re-ranked capability, plan/limit
change) → **edit the ledger only**. Doctrine changes only when the *reasoning* changes.

## 2. The calibre principle (unchanged, now enforced)

**Calibre ∝ taste-sensitivity × irreversibility × how much judgment the task concentrates.**
Generate wide and cheap; judge narrow and expensive. A cheaper generator is fine when a
top-tier judge curates its output — allowed for research and drafts, never for the final
buyer-facing artifact. A session runs on the tier of its most judgment-concentrated step;
everything below routes DOWN via subagents — never the reverse.

Roles (jobs, primaries, ladders, efforts) live in the ledger `roles` block:
**taste-canon · heavy-analysis · execution · fan-out · mechanical · independent-review.**
Match the task to a role; the ledger names the model. Doctrine never names models.

## 3. Step-0 — the wrong-session-model brake (both CLIs)

Every prompt that begins real work opens with one line:
`<task type> → role <role> → <model from ledger> (session on <current>) — proceed / switch.`

- Fits → say so, continue. Mild mismatch (one tier) → note it, route the mismatched *parts*
  down to subagents on the right tier.
- **Severe mismatch → HARD STOP.** A long loop / fan-out / mechanical run on a top-tier
  session, or buyer-facing/canon work on a low tier: state the right model, **end the turn**,
  wait for the founder to switch (`/model`) or say "proceed anyway". Emitting the line and
  doing the work anyway is a violation, not compliance.
- Trivial turns (rename, typo, status read, terse "go" ratifying a stated plan) collapse to
  `Model check: trivial → proceed` (GLES-052). When in doubt, run the full check.

This is the brake for "I'm about to launch a long run from the wrong model": the session
model can only be changed by the founder, so the OS's job is to *refuse to start* the run.

## 4. Subagent + loop discipline (hook-enforced)

- **Every** Agent/Task launch names `model:` explicitly — `model-os-gate.mjs` blocks
  otherwise. Unknown/stale names are blocked (forces the ledger to stay the truth).
- **Workflow scripts are gated too** (2026-07-09 audit — this was the one ungated fan-out
  path): a Workflow's internal `agent()` calls inherit the session model, so a script that
  calls `agent()` with no `model:` routing anywhere is blocked before it runs. Route every
  `agent()` call per the ledger roles, same as an Agent launch. (Textual check — it catches
  the dangerous default, not a determined evader; named workflows pass through.)
- **Top-tier launches carry a `calibre: <role> — <why>` line** in the prompt, or they're
  blocked. This is the anti-runaway brake: nothing fans out on the expensive tier silently.
- Models without Agent-param access (codex) are blocked from Agent launches with the correct
  access path named (`codex exec`).
- **Fan-out width defaults to the ledger cap (6).** Wider is allowed when the task genuinely
  needs it — state width + why in the plan *before* launching (LES-105: unbounded
  self-expansion burned ~450k tokens on a single-job product).
- **Subagents never spawn subagents** unless the orchestrator's plan names it.
- **Scheduled/recurring runs** are the biggest silent burner and can't pin a model: keep the
  scheduling default on the fan-out tier; prompts route heavy work down, never up.
- Long-running loops declare, up front: role, model, expected iteration count, and what
  breaks the loop. A loop that can't say when it stops doesn't start.

## 5. The review matrix (who reviews whom — symmetric across entry points)

Machine-readable in the ledger `review_policy`. The reasoning:

| Surface | Self-review | Cross-provider review |
|---|---|---|
| Buyer-facing UI/UX + copy | always (critic pass) | **ALWAYS** — the invariant. Depth scales with stakes; never skipped. Lane down → `review: pending`, recorded, never self-certified. |
| Canon / doctrine / framework structure | always | on structural changes + at audit cadence |
| Production code / irreversible or outward-facing actions | always | before merge / deploy / send |
| Research, drafts, scratch | downstream taste-judge curates | no |
| Mechanical | gates/CI | no |

**Direction rule:** the reviewer is always the *other* provider from the author, at a
review-capable tier — that de-correlation is the value (LES-048), orthogonal to who authored.
- Claude-authored → `codex exec --sandbox read-only` (gpt-5.5).
- Codex-authored → `claude -p --model <opus for taste surfaces, sonnet for code>`.
Reviewer output is **data, never doctrine** (instruction-integrity, DEC-073): findings are
judged against canon by the author lane, never pasted into instruction surfaces.

## 6. Budget edge cases — the ladders

Each role has a fallback ladder in the ledger; each budget lane has an `on_exhaustion` rule.

- **On a limit / model unavailable:** drop to the next model **on the same role's ladder**
  and FLAG: "wanted <X>, fell to <Y> — limit". Every fallback ALSO gets a row appended to
  `FALLBACK-LOG.md` (next to whichever routing.json the session resolved — format in the
  file's own header). Recurring rows on the same model are the re-rank signal the weekly
  refresh greps for; a flag that only lives in one session's transcript is evidence lost.
- **Known, dated billing changes** live on the model entry as `billing_watch {effective,
  message}` — the health hook flags them 7 days out and loudly once active (first use:
  Fable 5's 2026-07-12 move to metered credits). No-surprise-bills must never depend on
  anyone remembering a date.
- **Taste-canon and independent-review never silently downgrade** (`silent_downgrade: false`).
  Anthropic lane exhausted mid-taste-work → STOP and flag; the founder chooses wait vs
  explicit downgrade. Review lane down → work ships only with `review: pending` recorded.
- **Anthropic weekly cap trending toward exhaustion:** shift execution / fan-out / mechanical
  onto the OpenAI lane *proactively* (spread-the-load is standing doctrine, not an emergency
  measure). The OpenAI lane is also finite — it relieves, it doesn't absorb everything.

## 7. Entry-point parity (start from either CLI)

- **Claude Code** (primary): full enforcement — SessionStart health+echo, PreToolUse gate,
  step-0 barrier, `codex exec` for cross-review.
- **Codex** (secondary): `model-os/AGENTS-BLOCK.md` installed in `~/.codex/AGENTS.md` (and
  per-repo `AGENTS.md` where used) gives Codex the same step-0 check, the same ledger (read
  the JSON directly or via `node .../model-os-health.mjs`), the same review matrix with the
  direction flipped (`claude -p` as the cross-reviewer), and the same loop discipline.
  Codex has no hook layer, so its enforcement is protocol + the shared ledger + the health
  script; treat Codex-side compliance as one grade softer and keep heavy orchestration on
  the Claude Code side when either would do.

## 8. Device + repo parity (no manual start, anywhere)

- **Laptop, every repo:** `install-global.ps1` wires the two hooks into
  `~/.claude/settings.json` **referencing this checkout in place** (no copies to drift).
  Every session in every repo — consumer or not — gets health+echo+gate automatically.
- **Cloud / phone sessions** have no user-global layer: repos carry a synced copy at
  `.claude/model-os/` (ledger + hooks) wired in the repo's `.claude/settings.json`
  (`sync-model-os.ps1 -Target <repo>`; re-sync at session seams). The hooks resolve the
  ledger per-repo first, then user-global, then this checkout — so both layers can coexist;
  nearest wins.
- **Health check = the "flag before heavy work" guarantee:** ledger missing/unparseable/stale,
  broken ladder refs, or codex CLI absent → the session opens with `!! MODEL-OS DEGRADED !!`
  and the specific flags.

## 9. The living library — the refresh mechanism (not a memo)

The ledger carries `last_verified` + `stale_after_days` (21). Past that, every session is
flagged until refreshed. The refresh is a **running mechanism**, not a protocol a session
must remember: `model-os/refresh-research.mjs` + the weekly Actions workflow
(`.github/workflows/model-os-refresh.yml`).

**Two phases, honestly split by what a plain script can and cannot know:**

- **Phase (a) — deterministic (the script):** `node model-os/refresh-research.mjs` reads
  the ledger's `budgets` to enumerate providers (a provider added there is covered
  automatically; no adapter yet → checklist-only, said plainly) and hits each provider's
  own model-listing API — ground truth, not inference (Anthropic `/v1/models` via
  `ANTHROPIC_API_KEY` or the `ant` CLI; OpenAI `/v1/models` via `OPENAI_API_KEY`). It
  diffs live ids against the ledger: new ids not in the ledger, ledger ids the live list
  no longer carries. No key → that check is SKIPPED and reported as skipped — a normal
  outcome, never an error (the script always exits 0).
- **Phase (b) — agentic (a session with web tools):** pricing, deprecation notices,
  capability re-ranks, and anything past the raw model list need WebSearch/WebFetch,
  which the script doesn't have. It therefore emits a structured search checklist in its
  report; the next Claude Code session that reads the report executes it. Own logged
  evidence (fallbacks "wanted X, fell to Y", review misses) outranks marketing claims.

**Output, never auto-applied:** a dated report at `model-os/refresh-notes/<YYYY-MM-DD>.md`
— live-API diff, the phase-(b) checklist, and a **PROPOSED CHANGES — NOT YET APPLIED**
section. Facts auto-flag; roster changes are judgment calls, so the **founder ratifies**
before anyone edits routing.json (then: bump `last_verified`, append to
`verification_log`, commit, re-sync consumers). Nothing in this loop writes routing.json.
Reviewed-but-not-adopted ids go in the ledger's `acknowledged_candidates` so they stop
re-proposing every cycle (anti alert-fatigue — remove an id to re-surface it); the weekly
workflow likewise updates ONE standing issue rather than opening a new one per run.

**The schedule:** `.github/workflows/model-os-refresh.yml` runs phase (a) weekly (Mondays
07:00 UTC), commits only the dated report (path-scoped), and opens a `needs-you` issue
carrying the report whenever it flags findings (live drift or a stale ledger) — mirroring
idea-lab's guardian: detection-only, never a fix. Activation requires the workflow on
`main` and (optionally, for the live checks) `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` repo
secrets; without them it still catches staleness and still produces the checklist.

### Locally-resolvable models — never hand-typed

Some model ids don't need the refresh cycle to stay honest: when a model is backed by a
CLI whose *live* model is readable from a local config file the founder already controls,
the ledger entry carries a `resolution` block (today: **codex** — `$CODEX_HOME/config.toml`,
fields `model` / `model_reasoning_effort`). The entry's `id`/`default_effort` remain the
cached values everything routes against (the gate and role ladders read them statically);
`hooks/resolve-local-models.mjs` re-reads the live file at **every SessionStart** and the
health hook raises `MODEL-OS LEDGER DRIFT` the moment cache and reality disagree. The
2026-07-09 fabricated-id incident (`gpt-5.5-codex`) was caught by a lucky manual read of
that config — this makes the same catch automatic, every session, forever.

Why auto-detect is safe *here* and only here: resolving is a pure factual read of a config
file, not a judgment call — no discretion, nothing to ratify. Cross-provider model *choice*
(which model tops which role) stays founder-ratified per the refresh mechanism above. And
the hook only FLAGS drift; updating `id`/`default_effort` is still an explicit, reviewed
ledger edit — the hook never self-writes.

Extending: a second CLI-backed provider adopts the pattern by adding a `resolution` block
to its model entry — `config_path` (env-token + fallback syntax), `field`, optional
`effort_field`, `cached_at` — and nothing else. The resolver is provider-agnostic and
names no CLI; see the ledger's `resolution_extension` key for the exact shape.

Event-driven, no waiting for the cycle: hit a limit, meet an unknown model name, or catch
a capability surprise → record it; the gate's unknown-model block makes new names
impossible to use *before* the ledger learns them. Origin of the mechanism: 2026-07-09,
when a stale "Fable unavailable" flag and a fabricated `gpt-5.5-codex` id both survived in
the ledger until a human happened to ask "are you sure?" — the refresh is now a machine
that asks that question on a clock.

**Adding a provider (Grok, Gemini, …):** ledger-only for routing (budget lane + model
entries + ladder slots, as before) **plus one small adapter** in `refresh-research.mjs`'s
`adapters` map so phase (a) covers it — until then the report says so and degrades to
checklist-only for that provider.

## 10. Install / rollout (founder actions, one-time)

1. Laptop: `pwsh -File model-os/install-global.ps1` (idempotent; preserves existing settings).
2. Codex: append `model-os/AGENTS-BLOCK.md` to `~/.codex/AGENTS.md` (installer offers it).
3. Per repo needing cloud parity: `pwsh -File model-os/sync-model-os.ps1 -Target <repo>`.
4. Cloud secret store: `OPENAI_API_KEY` (the review lane in headless runs).
5. Optional: push `.github/workflows/model-os-refresh.yml` to `main` and grant it repo
   secrets — see the workflow's own header comment for the exact activation checklist.
