# MODEL-OS — provider-neutral model scheduling

SYNCED FROM wow-core — edit in the wow-core repo. Founder directive 2026-07-15:
providers are transport, never a quality ranking preference.

MODEL-OS chooses the most suitable safely accessible model for a task or meaningful task
phase, returns every remaining qualified candidate in global order, and maps abstract effort
to the selected model separately. It never enables API billing, usage credits, or another
metered fallback without a separate founder policy change and authorization.

## 1. One kernel, three kinds of state

`select.mjs` is the only routing kernel and executable selector. Hooks, health output,
dispatch, and prose do not implement their own ordering.

| State | Authority | Location |
|---|---|---|
| Active registry | Ratified model identity, routes, role floors, task-specific capability evidence, weaknesses, effort controls, lifecycle | `routing.json` |
| Policy | Ranking hierarchy, billing prohibition, task profile, effort, evaluation/promotion rules, TTLs | `policy.json` |
| Observations | Machine-local auth, catalogue, entitlement, quota, last execution success/failure, bounded run telemetry/receipts, candidate lifecycle/watch state, deterministic outcomes, performance + maintenance snapshots | `$MODEL_OS_STATE_DIR` (default `~/.model-os`) |

The registry is the last-known-good roster. Discovery, failed refreshes, and provider
telemetry never rewrite it. New identities enter as candidates and must pass evaluation and
promotion before becoming qualified active entries.

## 2. Task profile: classify the work, not the filename

Clear tasks are classified deterministically and locally. No model call is spent solely on
routing. A genuinely mixed or ambiguous prompt may use a balanced coordinator only when that
call also begins useful work.

Every profile records:

- operation: `decide | analyze | execute | review | mechanical`
- artifact: `scratch | code | buyer-facing | canon`
- authority: `autonomous | founder-directed`
- stage: `explore | draft | local-change | commit | push | deploy-send`
- hard required capabilities, soft preferred capabilities, optional quality floor, stakes,
  review provenance, reasoning effort, and parallelism

Operation and explicit decision context outrank file type. Inventing strategy is autonomous canon judgment;
applying a founder-ratified decision to `DIRECTION.json` is execution; formatting or stamping
canonical data is mechanical. Review attaches to its relevant outward transition, not every
reversible edit.

**The taste lane is ceiling-seeking, never floor-seeking (2026-07-17, the CoopReclaim flagship
post-mortem).** "Cheapest that clears the bar" governs execution/mechanical/fan-out; it NEVER
governs the taste-canon lane — there the objective is the most capable available model, because
creative generation and judgment calls compound across a run and a one-tier gap on the crown,
the concept authoring, or the round-1 critique silently caps everything downstream (an 8-hour
calibration run executed its whole taste lane one tier below the ratified ceiling because a
stale route flag outranked the role score). Two teeth: (a) any non-safety route flag that
demotes the taste-canon ceiling is surfaced as a named warning, not silently absorbed into
ordering; (b) on flagship/calibration runs, taste-canon dispatches go through an
effort-controllable surface (Workflow `agent()` with `effort:`, or `dispatch.mjs`) — the plain
Agent tool inherits session effort, which is acceptable only when the session itself runs high.

**Two symmetric failure modes, both now measurable (2026-07-18, founder cost-calibre directive).**
The whole point of calibre∝stakes is to avoid BOTH: (1) OVER-consumption — a frontier model
(high `cost_class`) doing low-stakes work (mechanical/execution/trivial); (2) UNDER-provisioning —
a sub-ceiling model on high-stakes taste/buyer-facing judgment. The session receipt
(`session-receipt.mjs`) now records per-session primary model + tokens + effort objectively, and
dispatch receipts carry role×model — so the field-review audits both directions quantitatively
(frontier tokens spent on low-stakes rows; high-stakes rows on sub-ceiling models), no longer by
vibe. **The dominant over-consumption source is the ORCHESTRATOR, not dispatches:** dispatched
work is already tiered per task and the gate nudges a top-`cost_class` model off mechanical/fan-out
launches, but the main session runs at ONE tier for every turn and cannot per-turn downshift — so a
frontier session model spends frontier tokens on every trivial turn. The structural fix is workflow
discipline, not a gate (a gate can't downshift the main loop): **default the session to a MID tier
and dispatch UP to the ceiling for the taste/judgment work** — the inverse of "frontier session does
the plumbing." The step-0 trivial fast-path proceeds cheaply but does not change the session model;
only the founder's session-tier choice does. Running a flagship taste run is the one case to start
the session itself on the ceiling.

**Starting on the right tier without a manual pick — DERIVED, not hardcoded (2026-07-18, made
dynamic after founder correction).** `.claude/settings.json` `model` sets the start tier, read ONCE
at start (no hook can auto-switch mid-session; only `/model` does). Since the task is unknown at
start and the main loop can't downshift after, the tier can't be auto-selected per task — the
achievable design is a per-project default **derived from the ledger, never a hand-picked literal
that rots**. `tools/session-default.mjs --write` sets `settings.json` `model` to the ledger's current
top model for the repo's orchestrator ROLE (default `heavy-analysis` — coordination + inline
judgment, no new taste at stake; a build-dominant repo may declare `execution`). Model NAMES stay in
the ledger (DEC-121/145), so when the model set changes the default **re-derives** — the roster-change
detector (`roster-baseline-check`) nudges the re-run. Two things fall out with NO special-casing:
(1) the default always tracks the current roster; (2) the top taste model never becomes the
orchestrator default, because it is taste-canon-specialised and not qualified for the orchestrator
role — emergent from the roster, not a "never <model>" ban; if it ever topped the orchestrator role
it would correctly become the default. Any task you want on the ceiling model stays available
dynamically regardless of the default — automatic DISPATCH of taste-canon work, `session-launcher
--model <id>`, or `/model` — the default is the zero-config start tier, never a filter. A mid-tier
session must DISPATCH taste-canon work up (not inline, not a forced manual switch); that is what keeps
the derived default from under-provisioning the high-stakes work.

For an explicit task envelope:

```powershell
node <model-os>/select.mjs --profile-json '{"operation":"execute","artifact":"code","authority":"founder-directed","stage":"local-change","requiredCapabilities":["coding"]}' --surface codex --json
```

`--task-text` provides the deterministic clear-text classifier. `--role` remains a compact
input for hooks and established workflows; it never revives a provider-local ladder.
Use `--compact` for the normal token-bounded Step-0 output and `--explain` for a readable account
of the selected route, profile, task fit, empirical status, fallbacks, degradation, and warnings.
Do not use a required capability merely to express a preference: required is a hard feasibility
gate, preferred is a soft ranking signal, and `qualityFloor` is an explicit numeric hard floor.
A required capability disqualifies a model only on **explicit negative evidence** — the capability
listed in that model's `capabilities.unsupported`. A model with *no* registry evidence for a
required capability stays a candidate: it is ranked with the missing-data penalty, the decision is
marked degraded with the named `requirement_gaps`, and a warning states which models were penalized.
Absence of registry evidence is a calibration debt, never an exclusion and never a BLACK-STATE
input (2026-07-16 incident: a hard-required `precision` silently filtered Claude Opus out of a
heavy-analysis pool because the registry had simply never scored precision for it). Reserve
required for genuine infeasibility; when in doubt, express the need as preferred.

## 3. Global selection contract

The decision order is fixed:

1. safety and feasibility — a zero-spend subscription/local/free route with verified safe
   authentication, or an explicitly approved route; metered fallback remains disabled;
2. task-specific capability among models that clear the original role/capability floor;
3. strength and freshness of the capability and route evidence;
4. cost and latency only when expected capability is effectively equivalent.

Once a model/role/effort group has at least the policy minimum of deterministic verified
outcomes, empirically equivalent candidates minimize expected tokens to verified completion,
then latency, while clearing the stakes-specific predicted-success floor. Uncalibrated groups do
not override the registry prior.

Provider and entry surface have zero ranking weight. The same profile and route facts produce
the same selected model and fallback order from Codex and Claude Code. Independent review is
the exception: every candidate must have a provider different from the artifact author.

The selector returns:

```json
{
  "status": "routable",
  "selected": {
    "model": "...",
    "provider": "...",
    "route": "...",
    "surface": "...",
    "effort": "medium",
    "effort_control": "provider-specific-value"
  },
  "fallbacks": [],
  "requirements": {},
  "review_required_before": null,
  "requested_identity": { "model": "...", "route": "..." },
  "warnings": []
}
```

`fallbacks` is the rest of the global task-fit order, never a provider-local ladder and never
a sub-floor model. The top-level `model/route/effort` projection is compatibility data; new
callers consume `selected`.

### Availability semantics

- `available`: current positive route facts.
- `attemptable`: safe subscription authentication is verified and billing is zero-spend, but
  catalogue, entitlement, or quota maintenance telemetry is unknown/stale. Invocation is the
  authoritative observation. This state warns but does not block ordinary work.
- `unavailable`: known exhaustion, missing safe authentication, explicit non-entitlement,
  unsafe billing, incompatible lifecycle, or a real invocation failure.

A boundary whose unknown value could cross into usage credits is unsafe, not attemptable.
`api_metered` and `subscription_credits` are hard-forbidden before any spend authorization is
considered.

`BLACK-STATE` is not a synonym for `blocked`. It is emitted only when every qualified safe
candidate is explicitly exhausted/unavailable or no safe route exists. Missing or unknown
telemetry can never infer it.

## 4. Effort is independent of model identity

Abstract effort levels are:

- `low`: deterministic/mechanical work
- `medium`: ordinary implementation from a clear specification
- `high`: ambiguous debugging, synthesis, architecture, or research
- `maximum`: unusually difficult diagnosis or concentrated high-stakes judgment

Parallelism is separate from reasoning effort: `single` or `fan-out`. Fan-out requires
meaningfully decomposable work, an integral two-to-20 unit count, and justification above the
default width six. An explicit `maximum` override requires `effortJustification` plus critical
stakes or concentrated judgment. Legacy `effort=multi-agent` is accepted as medium reasoning
plus fan-out for compatibility only.

Each model maps those levels to its provider-specific controls in `effort_controls`. The
dispatcher sends `effort_control`, never assumes equal provider semantics, and records both.

Dynamic escalation is bounded: start at the lowest reasonable level, verify, increase effort
after unresolved uncertainty or invalid output, and change models when a genuine invocation
failure makes the next global candidate more promising. Multi-agent is a decomposition mode,
not a synonym for “try harder.”

## 5. Execution and fallback

Selection is not execution. Pass the selector decision and a compact envelope to the bounded
dispatcher:

```powershell
node <model-os>/dispatch.mjs --decision-file <decision.json> --envelope-file <envelope.json> --mode <analysis|review|execution|heavy-execution> --current-provider <provider> --repo <path> --json
```

`analysis` is a read-only structured work unit for a selected analysis model. It is distinct
from independent review: it neither requests a patch nor certifies an artifact, but it keeps
the normal route-safety, identity, global-fallback, and receipt requirements.

The dispatcher:

1. re-checks route safety at launch;
2. scrubs API keys, alternative cloud credentials, credit modes, and recursion paths;
3. invokes the exact requested model and provider-specific effort control;
4. verifies structured output and observed model identity;
5. after a genuine quota, entitlement, authentication, or invocation failure, tries the next
   candidate from `fallbacks`;
6. records requested and observed identity, plus a transcript-free task fingerprint, profile,
   run kind, effort/parallelism, usage, duration, timeout, outcome, and last success/failure;
7. never substitutes the current/local model outside the authoritative order or reports
   unexecuted work as completed.

Invalid output may receive one higher-effort verification retry. A failed model invocation
advances immediately. Heavy execution uses an isolated worktree and does not return a completed
handoff while cleanup is owed.

Timeouts are policy-driven by dispatch mode and may be overridden within the hard limit. Route
facts must have the configured freshness margin at launch; they need not remain fresh for the
entire estimated task, avoiding racey rejection of legitimate long work. Mark synthetic checks
with `--run-kind test|probe` so they cannot contaminate production performance data.

Compact envelopes contain objective, bounded artifacts, constraints, definition of done,
output schema, and enforced aggregate iteration/token limits — never the full transcript. Route mixed work at
meaningful phase boundaries, not before every tool call.

For explicit multi-phase plans, `phase-routing.mjs` may change model/effort only when both the
incumbent and selector-chosen candidate have optimization-eligible evidence and the conservative
expected verified-token saving is strictly larger than transition overhead plus hysteresis.
Missing evidence, ties, or the maximum switch count keep the current route. The phase planner is
pure: it neither infers phases nor launches models; switched phases still use the dispatcher and a
new compact envelope. `phase-execution.mjs` is the operational boundary: `stay` returns control to
the current session with zero provider work, while `switch` dispatches the approved candidate with
an opaque task ID and preserves the remaining selector-qualified candidates for genuine failures.
It never asks a model to classify or decompose the task.

## 6. Fast hot path and maintenance

Ordinary selection is local JSON/state evaluation with a short in-memory cache. It performs no
LLM call and no synchronous provider refresh. SessionStart starts a credential-scrubbed,
single-instance `freshness-daemon.mjs` monitor. The monitor sleeps until the earliest bounded
deadline (or the 15-minute maximum poll), then runs zero-generation `maintenance.mjs` only when
work is due. This continues during an active session instead of relying on the next SessionStart.
Entitlement probes are explicit, event-bounded maintenance
operations; provider probes, discovery, terms monitoring, and roster research stay outside the
prompt hot path. A stale or failed refresh retains the last-known-good registry and emits a
maintenance warning.

Anthropic Max quota (session/weekly) is passive-only by construction: the sole machine-readable
surface is the Claude Code status-line payload's `rate_limits.{five_hour,seven_day}.used_percentage`,
which the wrapped `quota-statusline.mjs` bridge ingests. That field is present only under a
claude.ai Pro/Max OAuth login and only after the session's first provider response, so the
resource legitimately reads `unknown`/attemptable until a post-response refresh arrives — there
is no active poll to build (no CLI subcommand, file, or endpoint exposes subscription quota). An
`unknown` here reflects that passivity, not a maintenance failure. The OpenAI Codex lane, by
contrast, has an active adapter and reports exact percentages.

Maintenance uses catalogue TTLs (`discover.mjs --if-stale`) so current observations result in no
network/provider work. Account catalogues are checked at most every 15 minutes and official
catalogue/terms sources every hour; conditional HTTP validators avoid downloading unchanged
official pages. It also refreshes `performance.json` from dispatch receipts and outcomes.
Quota reset timestamps may schedule the next refresh shortly after reset, but can only pull the
TTL deadline earlier. `maintenance.mjs --plan --json` exposes the deterministic local plan without
refreshing; completed maintenance atomically records last success and next due reason.
An explicitly exhausted passive quota source is recovery-checked automatically after 15 minutes
or 30 seconds after a reported reset. One tiny subscription-only probe may run per maintenance
cycle; continued exhaustion backs off to one hour. A successful probe proves capacity but not
utilization, so the resource becomes honest `unknown`/attemptable until passive telemetry reports
the exact percentage. Machine-verified disabled spend protection remains mandatory.
An event-bounded entitlement probe likewise proceeds when its route's billing-boundary
telemetry is merely unknown — the probe is that boundary's designed recovery observation and
cannot spend under a machine-verified disabled spend guard — provided the base billing mode is
zero-spend authorized; an invalid boundary still refuses outright.
Catalogue presence is not entitlement: discovery may add an unprobed signal, but it cannot
downgrade a fresh authoritative entitlement/non-entitlement observation. An unprobed catalogue
listing remains attemptable unknown telemetry on a verified zero-spend subscription route.
Every meaningful cross-model dispatch carries an opaque `--task-id` and explicit `--phase-id`.
Organic `work` dispatches that omit `--task-id` are auto-linked (`task_id: auto:<uuid>`,
`task_id_source: "auto"` on the receipt) so completed work can never bypass the evidence gate by
simply not being linked — the 2026-07-16 audit found unlinked dispatches were the leak that left
every performance group uncalibrated. Explicit ids remain the way to group multi-dispatch tasks;
probes, tests, and evaluation runs are never auto-linked.
Terminal requested-model failures receive deterministic failure outcomes automatically. After the
local verification gates finish, close the whole task once; this assigns outcomes to every linked
attempt and refreshes performance without artifact content:

```powershell
node <model-os>/task-evidence.mjs --task-id <opaque-id> --verification passed --source machine:test-suite --checks lint,tests
```

Only named `machine:` checks may claim passed/failed verification; self-grading is rejected.

Verified outcomes also aggregate per **model|capability** (the capabilities the dispatch receipt's
selection profile demanded — recorded mechanically at dispatch time, never self-reported later)
into the performance snapshot's `capabilities` section. **Deterministic verification credits only an
ALLOWLIST of machine-verifiable capabilities** (`coding`, `debugging`, `precision`,
`mechanical-reliability`, `agentic-tool-execution`): a machine check ("the suite passed", "the report
exists") cannot validate taste/judgment (design-judgment, copywriting, strategic-judgment, …) — or
even research/review-quality — so crediting them from a generic check is semantically invalid; it
launders artifact integrity into taste evidence (cross-provider MODEL-OS audit, 2026-07-19). It is an
allowlist, not a denylist, so an unknown or newly-coined tag is excluded **by default** (fail-safe —
a denylist would let a synonym like `visual-taste` leak back in). Everything off the allowlist gets no
machine-check evidence until a separate JUDGMENT-EVIDENCE class exists — blinded/target labels,
control ballots, market outcomes — which is DEC-231's taste-learning charter, NOT this loop.
Capability credit requires **exact verified identity**: only a completed receipt whose observed model equals the requested model counts toward
that model's pair, and tags are canonicalized and bounded before becoming snapshot keys (Sol
review 2026-07-16, F2/F3/F5). This is the empirical **posterior** to the registry's desk-score
**prior**: once a pair is calibrated (policy minimum verified samples), `status.mjs` compares
empirical pass-rate ordering against `capability_scores` ordering and surfaces any contradiction
as a **calibrated capability inversion** warning — a registry-review proposal. Inversion pass
rates are NOT difficulty- or effort-adjusted (F4): the warning is where a review starts,
never a number to copy into the registry. Nothing ever mutates `routing.json` automatically.

**Capability-score maintenance is agent-owned, never a founder ask** (founder direction
2026-07-17: "you know I can't give scores per model manually"). The founder ratifies the
METHOD — this paragraph — once; individual numbers never route to the founder. A score enters
or changes in the registry only with all three of: (1) a dated provenance note in
`refresh-notes/` (sources, anchoring logic, independent-over-vendor weighting); (2) a
cross-provider review of the derivation (the other provider from the researching agent;
verdict recorded; a reviewer assessing scores about itself must state that caveat in the
review); (3) an evidence label naming both, e.g. `agent-researched, cross-provider reviewed
(sol 2026-07-17)`. The empirical capability posterior (above) is the standing corrector:
a calibrated inversion re-opens the score through the same three-step process, and empirical
evidence outranks desk research when both exist. `run_kind` exemption (probe/test/evaluation) is
caller-supplied and cannot be machine-enforced (F1): status reports dispatch counts by run_kind
so unusual exempt volume is visible rather than a silent bypass.
Closure is must-happen, not prose: the Stop-hook evidence gate
(`hooks/model-os-evidence-gate.mjs`) blocks a silent session stop when recent organic
dispatched work still has completed receipts without outcomes, and shows the exact close command.
Work that genuinely cannot be closed (no runnable machine check, or another session's dispatch)
is acknowledged with a durable deferral — `task-evidence.mjs --defer --task-id <id> --reason <why>`
records an on-the-record acknowledgment (never a fabricated pass/fail, never performance evidence)
so the gate stops re-blocking that task on every future stop. Deferral is the designed answer to
the alert-fatigue failure a per-stop-only suppressor would cause; unacknowledged completed work
still blocks.

Staleness is tiered so the gate is always either green or one honest command from green — a gate
that can never be made green trains everyone to ignore gates (the historical "9 open task(s)"
standing noise). A FRESH open task (<7d) blocks as above. A STALE open task (≥7d) is no longer
silently dropped: it surfaces as a NON-BLOCKING advisory EXPIRY CANDIDATE carrying its one-command
disposition — `task-evidence.mjs --expire --task-id <id> --reason <why>`, a durable write-off for
work that will never be machine-verified (e.g. an LLM review dispatch, or work predating receipt
discipline). Like a deferral, an expiry silences the task and never fabricates an outcome; unlike a
deferral it is a permanent write-off rather than "close it later". A fresh task co-present with a
stale one still blocks; a stale-only backlog is advisory-only (fail-open).

Expiry is precondition-checked and cutoff-bound, so it can never manufacture green:
`--expire` refuses unless the task is currently OPEN by the gate's own computation (evaluated as
if the task had no prior dispositions, so an earlier silencing can't hide its receipts) AND
positively STALE; `--force` is the audited escape hatch and stamps `forced: true` on the row.
Every expiry records a cutoff — the newest receipt it covers — and silences ONLY receipts
at-or-before that cutoff: a later receipt reusing the task_id REOPENS the task. A cutoff-less
(legacy) expired row covers nothing. Timestamps are held to the same honesty bar: the staleness
downgrade (blocking → advisory) requires a strictly valid ISO-8601 timestamp WITH timezone on
every receipt — a missing, garbage, or zoneless timestamp keeps the task in the BLOCKING fresh
tier, because undatable work can never prove it aged out.
`performance.mjs --json` provides completion, verified success, rework, token, and latency
statistics. Test/probe receipts are excluded and the latest outcome for a receipt wins.
Failed attempts with reported usage are included in verified-token economics. Missing outcomes,
usage, identity, or sample depth make a group optimization-ineligible rather than optimistic.

`calibration.mjs` plans optional shadow comparisons off path. The cumulative evaluation allowance
is at most five percent of deduplicated organic work attempts and at most two units per cycle.
Execution requires a deterministic machine verifier before the first provider call; fixtures and
self-grading cannot become live evidence. A plan consumes no provider tokens.

The update loop is:

1. `discover.mjs` observes provider-native catalogues, official release/terms changes, and CLI
   compatibility without changing the registry;
2. a new identity remains `discovered/available-unassessed`;
3. a bounded studio run covers every category in `policy.json evaluation.corpus`;
4. `evaluate.mjs` shadow-compares candidate and incumbent across quality, effort, and latency;
5. an evaluation-gated promotion decision is emitted while the active roster remains unchanged;
6. clear measured wins may be automatically eligible for execution/fan-out/mechanical roles;
   taste/canon needs stronger comparison and rollback, with founder judgment only when results
   are materially ambiguous;
7. the reviewed registry change is committed and later distributed.

`candidate-lifecycle.mjs` records compare-and-swap, idempotent lifecycle transitions and durable
quarantine. A quarantined qualified model is removed from selection and fallback. Clearing it
returns to `available-unassessed`, so evaluation/shadow evidence must be earned again. Rumors use
the separate `--rumor` watch path; only a claim hash and bounded source/label metadata are stored,
and watch rows never become candidates or selector evidence.

Discovery code cannot modify `routing.json` or `policy.json`. Refresh failure never removes the
incumbent.

Use the local operator view at any time:

```powershell
node <model-os>/status.mjs
node <model-os>/status.mjs --json
```

Status is read-only and network-free. It summarizes route freshness, maintenance due state,
the latest selection, the last actual requested/observed execution separately from later pending
dispatch/review events, bounded route reason codes, lifecycle quarantine, rumor watch count,
telemetry integrity, task verification coverage, calibration allowance, the last executed phase,
pending reviews whose historical block is now retryable, quota-recovery/backoff state,
and optimization eligibility. A plan-only switch never becomes a savings claim; an executed
planned model is still labeled as a conservative estimate rather than a measured counterfactual.
Operational telemetry is allowlisted and bounded: IDs,
hashes, reason codes, counts, timestamps, duration, identity, and aggregate usage only. Prompts,
envelopes, transcripts, artifact/output content, credentials, command lines, environment values,
and raw provider errors are rejected.

Execution and discovery adapters are composed through `provider-registry.mjs`. The registry
validates contract version, provider/surface ownership, and mandatory observed-identity plus
usage telemetry; conflicting ownership fails closed. Adding an adapter never qualifies a model
or enables spend—the safe route, capability evidence, evaluation, and promotion rules remain.

## 7. Gates and review

Gates protect real boundaries:

- model/role qualification and safe subscription authentication at provider invocation;
- hard prohibition of API-metered and usage-credit modes;
- independent provider provenance where review is required — gate-enforced, not prose: an
  `independent-review` Agent/Workflow launch must declare the artifact's author provider
  (`author: <provider>` or `reviewing: <provider>-authored`), and the gate blocks a missing
  declaration or a reviewer whose provider matches the author's;
- role/calibre discipline on the Bash provider-CLI escape hatch: a raw `codex exec`/`claude -p`
  launch with no explicit model flag (silent CLI-default inheritance) or a non-ledger model is
  blocked; a `codex exec` with no explicit `model_reasoning_effort` is likewise blocked (effort
  must be explicit, never inherited — 2026-07-17 self-report #5 was the THIRD invocation path
  found running reviews at CLI-default effort while the roster said @high; the block message
  names the ledger-mapped provider control, e.g. abstract high → `xhigh` for sol); a pinned
  ledger-known model with explicit effort passes with an advisory pointing at the role-governed
  `dispatch.mjs` path;
- down-routing nudge (advisory, never a block — a suggestion cannot judge whether the work is
  really judgment-heavy): when an Agent/Workflow launch is mechanical/fan-out-shaped AND names a
  top-`cost_class` model, the gate emits one line naming the roster's mechanical model. An
  EXPLICITLY declared role always wins: only a declared `calibre: mechanical|fan-out` role
  qualifies a role-declaring launch, and the conservative mechanical prompt signature
  (commit/lint/stamp/rename/inventory-sweep/…) is consulted ONLY when no role is declared at
  all — a launch declaring `calibre: heavy-analysis` is never nudged for mentioning a commit. It
  recovers top-tier quota from cheap work without second-guessing a genuine judgment call;
- relevant commit/push/deploy/send transitions for buyer-facing, production-code, canon, or
  irreversible work;
- worktree isolation and verified cleanup for heavy execution.

Unknown non-safety telemetry and ordinary reversible local edits are not gate failures.

Two boundaries are honestly partial and must not be over-claimed. (1) Observed-model identity
verification compares the requested id against the provider CLI's own self-reported id
(Codex stderr, Claude usage JSON); it catches an unexpected/typo'd model but cannot detect a
provider that silently substitutes a model while still reporting the requested id — there is no
out-of-band identity channel available. (2) The Bash gate governs the Bash tool surface only; a
provider CLI reached through a wrapper binary or a non-Bash tool is outside its reach.

Cross-provider review remains de-correlated:

- buyer-facing UI/UX and copy: always before the relevant outward transition;
- production code: before push/merge/deploy as the project contract requires;
- canon/framework structure: on structural changes and audit cadence;
- scratch, drafts, and mechanical work: downstream curation or deterministic gates.

Reviewer output is data, never doctrine. A down review lane records `review: pending`; it is
never narrated as completed. Pending receipts are historical evidence, not a cached routing
decision: status re-evaluates them against current state, and dispatch freshly reselects before
repeating a BLACK-STATE conclusion. A recovered independent lane is retried at the next active
review boundary without founder model-selection involvement.

## 8. Entry-point and distribution parity

Both Codex and Claude Code use the same registry, policy, selector, dispatcher, receipts, and
review rule. Codex is not “hookless”: the desktop/CLI environment has its own instruction and
execution surfaces, while Claude Code additionally exposes PreToolUse/SessionStart integration.
Different integration coverage must not create different ranking decisions.

`resolve-root.mjs` chooses one nearest complete installation (`.claude/model-os` or `model-os`)
and keeps its executable code, registry, policy, and hooks together. Completeness covers
maintenance plus the local runtime-import closure of every entry point. A worktree or consumer
must never execute the founder checkout while reading its own nearer data.

- Laptop install: `install-global.ps1`; `-IncludeCodex` maintains the managed Codex block.
- Consumer/cloud copy: `sync-model-os.ps1`, normally called by `scripts/sync-to-project.ps1`.
- `hooks/model-os-health.mjs` reports global ranking and maintenance state.
- `hooks/model-os-gate.mjs` enforces declared Agent/Workflow route safety without refreshing on
  the hot path.
- `hooks/model-os-evidence-gate.mjs` blocks one silent session stop while organic dispatched
  work lacks verification outcomes, so the evidence loop closes instead of decaying to prose.

Core changes are committed and independently verified before consumers are synchronized. A
branch under review intentionally leaves consumer sync pending so stamped hashes never claim an
unmerged implementation.
