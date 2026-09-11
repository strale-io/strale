# AI Runbook

> Entry point for AI agents. Start here.

---

## Related

| File | Purpose |
|------|---------|
| `DISPATCH.yaml` | Task-aware file routing and triggers — read this to know what to load |
| `PROTOCOL.md` | Session management, decisions, logging, handoffs, authority |
| `WORKFLOW.md` | Build execution guidance (plan mode, subagents, verification) |
| `BUILD.md` | Build sequencing — what happens in what order |
| `NOTION.md` | Project context in Notion |
| `EVOLUTION.md` | Starter kit evolution — how to propagate learnings back to the template |
| `DESIGN_ROUTER.yaml` | Surface-type routing — which design files to load per UI surface type |

---

## Authority

**Single source of law:** `_rules/laws.yaml`

**Constraint locator:** `CONSTRAINTS_INDEX.yaml` — reference-only index pointing to all hard constraints by category. Load this first to identify which deeper files to consult for a given task.

**Project context:** Notion databases (see `.claude/NOTION.md`)

Everything else references these, never restates them.

### Autonomous Decisions
- UI implementation using `_ui/*`
- Pattern application from `_model/patterns/*`
- State handling per `_ui/states.md`
- Interaction per `_interaction/*`
- Running critique loop

### Requires Proposal
- Tool adoption or changes (see `config/TOOLING.md`)
- Changes to `_model/truth/*`
- New patterns not in `_model/patterns/*`
- Changes to `_rules/laws.yaml`
- Archetype exceptions
- Navigation structure changes

### Forbidden
- Violating laws.yaml
- Violating Notion Constitution laws
- Skipping critique loop
- Introducing phantom actions
- Generating invalid token combinations (see token constraints)
- **Dead affordances** — buttons/links/chevrons that do nothing (LAW-007)
- **Incomplete primary flows** — shipping surfaces before flows work (LAW-008)
- **Adding before replacing** — must justify why existing feature can't be modified (LAW-009)

---

## Authority Boundary

This starter kit system has a defined scope. Understanding this boundary prevents confusion about what can and cannot be changed.

### System Owns (Starter Kit Authority)

These are governed by the starter kit and should not be contradicted by product decisions:

| Category | Files | Change Process |
|----------|-------|----------------|
| Laws | `_rules/laws.yaml` | Amendment via GOVERNANCE.md |
| Invariants | `_invariants/REGISTRY.md` | Amendment via GOVERNANCE.md |
| Gate sequence | `_quality/QUALITY_PROTOCOL.md` | Frozen (DEC-006) |
| Critique loop | `_critique/*.md` | Frozen (DEC-006) |
| Meta-rules | `SYSTEM_CONTRACT.md` | Frozen (DEC-006) |
| Token grammar | `_ui/tokens.yaml` | Amendment via Decision Registry |
| Archetype budgets | `_quality/archetypes/` | Amendment via Decision Registry |

### Product Owns (Project Authority)

These are filled per-product and take precedence within their scope:

| Category | Files | Authority Source |
|----------|-------|------------------|
| Product identity | `config/manifest.yaml` | Product team |
| Tech foundation | `config/tech-foundation.yaml` | Engineering/Product |
| Preset selection | `_presets/{preset}.yaml` | Product team |
| Notion Constitution | Notion database | Product leadership |
| Truth model | `_model/truth/*.yaml` | Product team |
| Surface registry | `_surfaces/REGISTRY.yaml` | Product team |
| NFR targets | `_nfr/*.yaml` | Engineering/Product |

### Boundary Rule

When system guidance and product decisions conflict:

1. **Notion Constitution wins** over starter kit defaults
2. **Starter kit laws** cannot be overridden by product decisions
3. **Starter kit provides HOW** — product provides WHAT
4. **Presets customize** — they don't override laws

See `SYSTEM_CONTRACT.md` Resolution Order for full precedence chain.

---

## Design System Presets

**Location:** `_design-systems/{preset}/`

**Selection:** Set in `config/manifest.yaml` via `design_system: professional | publishing`

| Preset | Use Case | Key Characteristics |
|--------|----------|---------------------|
| `professional` | Data-dense SaaS apps, dashboards | Shadow elevation, two-panel layout, compact spacing |
| `publishing` | Documentation platforms, content apps | Flat surfaces (no shadows), three-column layout, generous whitespace, no-hover-movement |

**Each preset provides:**
- `_contract.yaml` — Identity and constraints
- `tokens.yaml` — Complete design tokens
- `components.yaml` or `components.md` — Component specifications
- `patterns.md` — Layout patterns
- `states.md` — Loading/empty/error states

**Conflict rule:** Presets declare `forbids` lists. Only one design system can be active.

---

## Token System

**Schema:** `_ui/tokens.yaml` defines naming, dimensions, and constraints.

**Constraints must be respected:**
- Check `constraints.capability_matrix` before generating tokens
- `text` and `icon` have NO hover states
- `ring` only appears on `focus` interaction
- `focus` sentiment only valid for `ring` and `border` usage

**Reference:** `_ui/tokens.example.yaml` shows a complete filled example.

**Rule:** All visual values must come from tokens. No hardcoded colors, spacing, or typography.

---

## Tech Foundation

**Config:** `config/tech-foundation.yaml` defines architectural decisions.

**Guardrail (TF-001):** Before implementing any of these, tech-foundation.yaml must have `status: active`:
- Database or persistence
- Authentication or user accounts  
- Sync or collaboration
- File upload or ingestion
- Export functionality

**If tech-foundation.yaml still has `status: template`, do not build these features.** Ask human to fill it first.

**Mode constraints:**
- Persistence must match `data.persistence_mode` (TF-002)
- Auth must match `auth.mode` + `auth.tenancy` (TF-003)
- Sync must match `sync.mode` (TF-004)
- Never build items listed in `non_goals_v1` (TF-005)
- Meet performance budgets in `performance.*` (TF-006)

---

## Completeness Requirements

**Every affordance must work.** See LAW-007 and AF-001 through AF-007 in `_invariants/REGISTRY.md`.

**Gate 5 (Completeness Audit)** must pass before release. See `_quality/QUALITY_PROTOCOL.md`.

---

## Restraint Principles

**Replace before adding.** See LAW-009 in `_rules/laws.yaml`.

**It's OK to not support a use case.** See LAW-010 in `_rules/laws.yaml`.

---

## Pre-Creation Protocol

**Before building any screen, feature, or output, answer these questions explicitly.** See LAW-011.

### 1. Intent Clarity

- What problem is the user actually trying to solve?
- What outcome would make them say "this was worth it"?
- What are they explicitly *not* asking for?

### 2. Audience Assumption

Classify the intended audience:

| Type | Expectation | Behavior |
|------|-------------|----------|
| Explorer | Learning | Explain more, guide discovery |
| Practitioner | Efficiency | Build lean, minimize friction |
| Decision-maker | Clarity | Synthesize, highlight trade-offs |
| Client | Quality | Impress, demonstrate judgment |

**Default assumption: Client.** Build as if presenting to someone paying for quality.

### 3. Output Type

Identify what kind of artifact this is:

| Type | Purpose | Key Trait |
|------|---------|-----------|
| Decision Surface | Make choices | Interactive, focused |
| Data Display | Show information | Clear, scannable |
| Export | Implement elsewhere | Portable, complete |
| Narrative Output | Evaluate coherence | Demonstrative, curated |

This determines structure, not just styling.

### 4. Success Definition

Before any code or UI:

- What must it include to be complete?
- What must it exclude to stay focused?
- Would a discerning client consider this finished?

Ask: **"What is the minimum that would satisfy a discerning client?"**

This is not "what would a top agency add?" (scope creep).
This is "what would embarrass us to ship without?" (quality floor).

### 5. Demonstration vs Enumeration

When showing a system, configuration, or structured data:

| Prefer | Avoid |
|--------|-------|
| Show in context | List raw values |
| Representative examples | Exhaustive inventories |
| Group by role/intent | Group by data structure |
| Omit low-signal detail | Include everything |

A system preview that lists "Primary: #0066FF" is enumeration.
A system preview that shows a button using that color is demonstration.

**Rule:** If you cannot articulate what success looks like, do not start building.

---

## Task Flow

How DISPATCH, BUILD, PROTOCOL, and WORKFLOW fit together:

```
DISPATCH.yaml          BUILD.md              PROTOCOL.md           WORKFLOW.md
(what to read)         (build sequence)      (session lifecycle)   (execution patterns)
      │                      │                      │                     │
      ▼                      ▼                      ▼                     ▼
1. Match task type    2. Classify tier       3. Start session       4. Build
   → key_signals         Micro/Targeted/        Quick or Full          plan mode
   → must_read           Standard/Complex       (per session_          subagents
   → session_workflow    (per build_             workflow)              critique
                          classification)
```

**Step-by-step:**

1. **Identify task type** in DISPATCH.yaml → read its `key_signals` first (critical rules without opening files)
2. **Classify build tier** using `build_classification` in DISPATCH (maps to BUILD.md Section 1)
3. **Start session** per PROTOCOL.md — Quick or Full based on `session_workflow.session_mode`
4. **Load files** per DISPATCH `must_read` using depth hints (full/scan/verify)
5. **Follow build path** in BUILD.md Section 2 for the classified tier
6. **Execute** using WORKFLOW.md patterns (plan mode, subagents, verification)
7. **End session** per PROTOCOL.md — handoff weight and Notion writes from `session_workflow`

**Quick example — bug fix:**
DISPATCH `bug_fix` → `build_classification.typical: Targeted` → Quick session → 4 must_read files at scan depth → BUILD Targeted path (LOAD→LAWS→CONTEXT→BUILD→SPOT-CHECK→DONE) → one_liner handoff

**Quick example — new screen:**
DISPATCH `new_screen` → `build_classification.typical: Complex` → Full session → 9 must_read files (mix of full/scan) → BUILD Complex path (full pre-build, explore, critique) → detailed handoff

---

## Context Loading

> **Template State:** In a fresh copy of this template, the following contain placeholder values until Bootstrap runs: `CLAUDE.md` (Notion URLs, Linear team, GitHub repo), `handoff/` (empty — populated during sessions), `tasks/` (starter templates). These are structural scaffolding, not empty files. The workflow is fully functional — missing project-specific values are expected and will be filled during Bootstrap (see `.claude/PROTOCOL.md` § Bootstrap Mode).

### From Notion (Project-Specific)

| Need | Check |
|------|-------|
| Laws for this product | Constitution |
| What to build | Product Specs |
| Visual references | Design Library |
| Past decisions | Decisions |
| Unresolved questions | Open Questions |
| Previous attempts | Implementation Log |

### From Starter Kit (System-Wide)

See `.claude/DISPATCH.yaml` for task-aware file loading.

DISPATCH provides exact file lists, reasons, before/after triggers, and applicable quality gates for each task type. Identify your task type, then follow its reading list.

**Rule:** If a file is in `must_read`, you must open and read it. "I already know what's in it" is not an excuse to skip.

### Loading Protocol

1. **Read key_signals first** — DISPATCH.yaml has a `key_signals` block per task type.
   These are the critical rules extracted from across all files. Read them before opening anything.

2. **Full-read files marked `depth: full`** — These are the 3-5 files that genuinely
   require complete reading for this task. Don't skim them.

3. **Scan files marked `depth: scan`** — Open the file, find the sections noted in
   `look_for`, read those sections. Skip the rest.

4. **Verify files marked `depth: verify`** — Open the file only to confirm a specific
   thing exists or is correct. One lookup, not a read.

5. **Defer should_read until you need it** — Don't load conditional files upfront.
   Load them when you encounter the condition they describe.

6. **If context is tight** — Use the `priority_if_constrained` list. Drop files
   from the bottom of must_read first. Never drop key_signals.

### Session Workflow Essentials

Quick reference for PROTOCOL.md session lifecycle. DISPATCH.yaml `session_workflow` per task type has the specific details.

**Session Modes at a Glance:**

| Mode | When | Start Steps | End Steps | Notion Load |
|------|------|-------------|-----------|-------------|
| **Quick** | Bug fix, config tweak, single-issue, <2hr, no decisions | 5 steps | 3 steps | Minimal (0-1 databases) |
| **Full** | New feature, design exploration, multi-issue, decisions | 9 steps | 8 steps | Full (3-7 databases) |

**Default:** Quick. Escalate to Full when: second feature touched, design decision emerges, >2hr estimate, contradiction detected.

**Quick Session (minimum viable):**
- **Start:** Declare intent → Connectivity check → Read handoff/from-chat/ → Check Linear issue(s)
- **End:** Write handoff file → Update Linear → Create Journal entry (one-liner)

**Full Session (minimum viable):**
- **Start:** All Quick steps + Read Project Home + Current State Summary (check stale flag) + Last 5 relevant Journal entries + Active Decisions + Linear priorities + DESIGN_ROUTER (if UI)
- **End:** Create Journal (full) → Update Linear + Log rows → Create follow-up issues → Log decisions → Save handoff → Update Feature Registry → Contradiction check → Self-audit

**Which Notion Databases per Task Type:**

| Database | Read When | Write When |
|----------|-----------|------------|
| **Decisions** | Almost always — past decisions constrain work | Any session producing design choices |
| **Journal** | Full sessions (last 5 entries) | Every session (one-liner minimum) |
| **Feature Registry** | new_screen, full_feature, data_display, model_change | When registering new screens or features |
| **Product Specs** | new_screen, full_feature, data_display, model_change | Never (human-written) |
| **Design Library** | new_screen, full_feature | Never (human-curated) |
| **Deferred** | exploration, full_feature | When items are deferred during build |
| **Glossary** | full_feature (new domain terms) | When new terms introduced |
| **Constitution** | config_change, token_work | Never (human-written) |
| **Current State Summary** | Full sessions (staleness check) | When regenerating (rare) |

**Handoff Weight by Task Type:**

| Weight | Task Types | Content |
|--------|------------|---------|
| **one_liner** | bug_fix, refactor | Intent + what was done + Linear ref |
| **summary** | modify_screen, accessibility, exploration | Intent + work done + findings |
| **detailed** | new_screen, token_work, model_change, new_component, full_feature, review_audit, config_change, data_display | Intent + full work log + decisions + follow-ups + self-audit |

**Linear Actions Quick Reference:**

| Task Type | Typical Linear Actions |
|-----------|----------------------|
| bug_fix | Update existing issue → Done, append Log |
| new_screen | Create [FEATURE] issue, update to In Progress, create follow-ups |
| full_feature | Create parent [FEATURE], child issues per screen, progressive updates |
| review_audit | Create [AUDIT] issues for P0/P1 findings |
| exploration | None unless escalated to build |
| refactor | Create or update [REFACTOR] issue |
| config_change | Create [CHORE] issue |
| accessibility | Create or update [FIX] issue |

---

## Resolution Order

When sources conflict:

```
Notion Constitution → Starter Kit Laws → Starter Kit Defaults → Notion Specs
```

- Notion Constitution overrides everything (project-specific laws)
- Starter kit defines *how* to build
- Notion specs define *what* to build

---

## Reference Protocol

- Cite rules by ID: `LAW-001`, `RULE-010`
- Never restate rules in prose
- Link to source, don't duplicate

---

## Critique Requirement

Every screen runs through `_critique/LOOP.md` before shipping.

Stop conditions:
- P0 = 0
- P1 ≤ 2
- All scores ≥ 4 (Correctness = 5)

Max 3 cycles, then escalate.

### Release Review Trigger

When all screens in a product have passing critique scorecards (P0=0, P1≤2, all scores meet minimums):

1. Announce that Release Readiness Review has been triggered
2. Follow the sequence in `_quality/RELEASE_REVIEW.md`
3. Do not declare the product "done" or "shipped" until Phase 6 sign-off is complete

This is automatic — do not wait for human to request it.

---

## Audit Output

When running audits (full, drift, critique), save all outputs to a dedicated folder.

### Folder Convention

```
audit-output/
  {YYYY-MM-DD}-{audit-type}/
    screenshots/
    {filename}.md
```

**Audit types:**
- `full-audit` — Complete system audit
- `drift-audit` — Drift detection only
- `critique-audit` — Critique loop for specific screen
- `completeness-audit` — Gate 5 completeness check
- `intent-audit` — Gate 0 pre-creation verification

**Examples:**
- `2026-02-01-full-audit/`
- `2026-02-01-drift-audit/`
- `2026-02-01-critique-audit-settings-page/`

### Folder Creation Rule

**Always create a new folder for each audit run.** Never overwrite previous audit outputs.

This preserves audit history and allows comparison across runs.

### Output Files

Each audit folder should contain:
- Relevant `.md` files for each audited area
- `screenshots/` subfolder if visual evidence captured
- `summary.md` with overall findings and P0/P1/P2 counts

### Expectation Audit

For major screens, run a User Expectation Audit. This evaluates both action and information contracts.

**Process:**

1. **Screenshot the surface**

2. **Action Contract Audit:**
   - List every element that looks interactive
   - For each: What would user expect to do?
   - Compare to actual capability
   - Run Dead Surface Test

3. **Information Contract Audit:**
   - What questions did user arrive with? (based on page title, entry point)
   - What questions does displayed content raise?
   - Are all questions answered (or path clear)?
   - Run Information Completeness Test

4. **Explanation Coverage Audit:**
   - List all mandatory explanation targets (status badges, progress, disabled, counts)
   - For each: What explanation rung is used?
   - Are tooltips following contract?
   - Run "Explain It to a Client" Test

5. **Flag gaps as P1** (or note as intentional)

**Output:** `{surface}-expectations.md` in audit folder

**Audit types (updated):**
- `full-audit` — Complete system audit
- `drift-audit` — Drift detection only
- `critique-audit` — Critique loop for specific screen
- `completeness-audit` — Gate 5 completeness check
- `intent-audit` — Gate 0 pre-creation verification
- `expectation-audit` — User expectation audit for surface

---

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Load everything | Load minimum for task |
| Restate rules | Reference by ID |
| Skip critique | Always run loop |
| Invent components | Use `components.yaml` |
| Hardcode values | Use `tokens.yaml` |

---

## When Stuck

1. Check `_decisions/REGISTRY.md` for precedent
2. If novel, document decision there
3. If blocked, escalate with:
   - What's blocking
   - What input is missing
   - Recommended path forward
