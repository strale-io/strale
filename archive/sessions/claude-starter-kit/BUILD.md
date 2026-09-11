# Build Conductor

> The single sequence for all build tasks. Start here, follow the path.

---

## Related

| File | Role |
|------|------|
| `RUNBOOK.md` | Entry point, context loading, authority |
| `PROTOCOL.md` | Session management, decisions, logging |
| `DISPATCH.yaml` | Task-aware routing — identifies task type, provides `build_classification` mapping to tiers below |
| `WORKFLOW.md` | Build execution patterns (plan mode, subagents, critique) |
| This file | **Sequencing** — what happens in what order for each task type |

---

## How This File Works

1. Classify your task (Section 1)
2. Follow the build path for that classification (Section 2)
3. Each step tells you exactly which file to consult and what to produce
4. Skip nothing marked "Required." Skip anything marked "If applicable."

---

## Section 1: Task Classification

Before building anything, classify the task. This determines your build path.

### Classification Matrix

| Signal | Micro | Targeted | Standard | Complex |
|--------|-------|----------|----------|---------|
| Files touched | 1-2 | 2-5 | 3-10 | 5+ |
| Design decisions | 0 | 0-1 | 1-3 | 3+ |
| New UI surfaces | 0 | 0 | 0-1 | 1+ |
| Affects other surfaces | No | No | Maybe | Yes |
| New user-facing concepts | 0 | 0 | 0-1 | 1+ |
| Estimated time | <30min | 30min-2hr | 2-6hr | 6hr+ |
| Example tasks | Typo fix, config tweak | Bug fix, style adjustment, copy change | New component, feature addition, refactor | New screen, workflow, multi-surface feature |

### Classification Rules

- If ANY signal hits a higher tier, use that tier
- When unsure, classify one tier higher (over-prepare beats under-prepare)
- If a Micro/Targeted task reveals complexity during execution, stop and reclassify
- New UI surfaces are always Standard or Complex, never Micro/Targeted
- Cross-surface changes are always Complex

### Quick Reference

| Task | Classification |
|------|---------------|
| Fix a typo | Micro |
| Fix a bug with known cause | Targeted |
| Update button styles across a surface | Targeted |
| Add a filter to an existing list | Standard |
| Build a new component | Standard |
| Refactor a data flow | Standard |
| Build a new screen | Complex |
| Add a feature that touches 3+ screens | Complex |
| Redesign navigation | Complex |

---

## Section 2: Build Paths

> **Cross-cutting triggers:** Every build path also runs the `cross_cutting` triggers from DISPATCH.yaml. These include: critique after any screen, decision logging, handoff writing, session-end compliance, and escalation rules. Check DISPATCH.yaml `cross_cutting` section at session end.

### Path: Micro

**Session mode:** Quick

    LOAD     → RUNBOOK.md context loading (quick fix row)
    CHECK    → laws.yaml (scan for relevant constraints)
    BUILD    → Make the change
    VERIFY   → Does it work? Any regressions?
    DONE     → Commit, update Linear if applicable

No pre-build declarations. No critique loop. No exploration.
Micro tasks are below the governance threshold.

---

### Path: Targeted

**Session mode:** Quick (escalate to Full if design decision emerges)

    LOAD       → RUNBOOK.md context loading (quick fix row)
                 + check handoff/from-chat/ for pending items
    LAWS       → laws.yaml — identify applicable constraints
    CONTEXT    → If UI change: load _ui/tokens.yaml, _ui/states.md,
                 relevant component from _ui/components.yaml
                 If logic change: load relevant truth model files
    BUILD      → Make the change
    SPOT-CHECK → Targeted verification:
                 - Does the change respect loaded constraints?
                 - If visual: render in browser, compare before/after
                 - If behavioral: test the flow manually
    DONE       → Commit, update Linear

No formal pre-build declarations. No full critique loop.
Spot-check replaces critique for contained changes.

**Escalation trigger:** If during step 4 you discover a design decision is needed (two valid approaches, unclear which is better), STOP. Reclassify as Standard. Follow that path from step 1.

---

### Path: Standard

**Session mode:** Full

    LOAD          → RUNBOOK.md context loading (full feature row)
                    Read PROTOCOL.md Full Session "On start" steps
                    Check handoff/from-chat/ for pending items
    UNDERSTAND    → Read the spec/requirement
                    What exactly are we building?
                    What's the expected user outcome?
    PRE-BUILD     → Gate 0 (streamlined for Standard — see Section 3)
                    Required: Intent modeling, scope boundaries, success criteria
                    Required: Completeness target (Full/Scoped/Foundation)
                    If applicable: Spec interrogation (if spec exists)
                    If applicable: EIL-Lite (if new capability)
                    Skip: Full assumption matrix, full failure scenarios,
                    journey context, reasoning traces for every decision
    CONSTRAINTS   → Load applicable constraints:
                    _rules/laws.yaml
                    CONSTRAINTS_INDEX.yaml (scan for relevant categories)
                    config/manifest.yaml (product class, active preset)
                    config/tech-foundation.yaml (tech stack, tooling)
                    Relevant archetype from _quality/archetypes/
    EXPLORE       → If the task has a visual/structural component:
                    See _modes/explore.md — generate 2+ approaches
                    Evaluate against constraints from step 4
                    Select with documented rationale
                    If pure logic/data: skip exploration, proceed to build
    BUILD         → Execute the selected approach
                    Use plan mode for 3+ step tasks (WORKFLOW.md)
                    Use subagents for parallel work (WORKFLOW.md)
                    Follow Component Evolution Path if components don't fit
    VISUAL CHECK  → If UI work: render in browser
                    See _quality/VISUAL_VERIFICATION.md
                    Capture screenshots at key states
                    Evaluate against visual criteria
    CRITIQUE      → Run critique loop (_critique/LOOP.md)
                    Use _critique/PROMPT.md
                    Max 3 cycles, evaluate stop conditions
                    Include visual verification output in scoring
    SHIP          → All stop conditions met?
                    Commit with conventional commit message
                    Update Linear issue
                    Write handoff file
                    Create Journal entry
                    Check for Learning Signals (EVOLUTION.md)
    ESCALATE      → If stuck after 3 critique cycles:
                    Write escalation report
                    Requires human decision

---

### Path: Complex

**Session mode:** Full

    LOAD          → RUNBOOK.md context loading (full feature row)
                    Read PROTOCOL.md Full Session "On start" steps
                    Check handoff/from-chat/ for ALL pending items
                    Read Product Strategy Current State Summary
                    Read relevant Feature Registry entries
    UNDERSTAND    → Read spec/requirement thoroughly
                    Cross-reference with existing surfaces
                    Identify all surfaces this touches
                    Map user journey across surfaces
    PRE-BUILD     → Gate 0 (full for Complex — see Section 3)
                    All declarations required:
                    - Spec interrogation with falsifiable assumptions
                    - Intent modeling (problem, output type, scope, success, audience)
                    - Screen Intent Declaration (role, primary UI object, dominance)
                    - IA Position Declaration (parent, siblings, children, depth)
                    - Emotional Intent Declaration
                    - Outcome Declaration with User State Model
                    - Completeness target
                    If applicable:
                    - Full EIL (if new capability)
                    - Journey Context (if multi-surface)
                    - Failure Scenario Modeling (3-5 scenarios)
                    - Surfacing Audit (if overview/aggregation surface)
    CONSTRAINTS   → Full constraint loading:
                    _rules/laws.yaml
                    CONSTRAINTS_INDEX.yaml (all relevant categories)
                    config/manifest.yaml
                    config/tech-foundation.yaml (including tooling section)
                    Relevant archetype(s) from _quality/archetypes/
                    _model/truth/* (entities, actions, states, permissions)
                    _invariants/REGISTRY.md
                    _interaction/* (physics, focus, progression, choreography)
                    Relevant patterns from _model/patterns/*
    REFERENCE     → External reference analysis (see _quality/REFERENCE_ANALYSIS.md):
                    Identify 2-3 products excellent at this pattern type
                    Extract transferable principles
                    Document what conventions users expect
    EXPLORE       → Generate 2-3 genuinely different approaches
                    Not variations on a theme — different structures
                    Evaluate each against:
                    - Constraints from step 4
                    - Principles from step 5
                    - Screen Intent Declaration from step 3
                    - User State Model from step 3
                    Select with documented rationale
                    Preserve rejected approaches with reasoning
    BUILD         → Execute in planned phases:
                    Use plan mode always (WORKFLOW.md)
                    Break into discrete subtasks
                    Use subagents for parallel work
                    Build primary flow first, then secondary
                    Check Component Evolution Path for any gaps
    VISUAL CHECK  → Full visual verification:
                    See _quality/VISUAL_VERIFICATION.md
                    All breakpoints
                    All key states (default, loading, empty, error, populated)
                    Multi-persona walkthrough (3+ mindsets)
                    Cross-surface consistency check if multi-surface
    CRITIQUE      → Full critique loop (_critique/LOOP.md)
                    All 14 dimensions scored
                    Experiential evaluation required
                    Holistic re-evaluation after patches
                    Surprise test required
                    Bias check required
                    Max 3 cycles
    CROSS-CHECK   → If multi-surface:
                    Gate 8 cross-surface coherence checks
                    Terminology consistency across surfaces
                    Representation consistency
                    Navigation coherence
    SHIP          → All stop conditions met?
                    Commit with conventional commit message
                    Update Linear issues
                    Write handoff file (detailed for Complex tasks)
                    Create Journal entry
                    Check for Learning Signals (EVOLUTION.md)
                    Update Feature Registry status
                    If all screens done: trigger Release Review consideration
    ESCALATE      → If stuck: escalation report + human decision

---

## Section 3: Pre-Build Requirements by Classification

This section resolves the tension between thorough pre-build and practical speed. Not every task needs every declaration.

### Requirements Matrix

| Pre-Build Step | Micro | Targeted | Standard | Complex |
|----------------|-------|----------|----------|---------|
| Intent modeling (problem, output type, scope, success) | — | — | Required | Required |
| Spec interrogation | — | — | If spec exists | Required |
| Falsifiable assumptions (3-5) | — | — | If spec exists (2 minimum) | Required (3-5) |
| Screen Intent Declaration | — | — | If new surface | Required |
| IA Position Declaration | — | — | If new surface | Required |
| Emotional Intent Declaration | — | — | — | Required |
| Outcome Declaration | — | — | Simplified (before/after only) | Full (with User State Model) |
| Failure Scenario Modeling | — | — | — | Required (3-5 scenarios) |
| Journey Context | — | — | — | If multi-surface |
| EIL | — | — | EIL-Lite if new capability | Full EIL if new capability |
| Completeness target | — | — | Required | Required |
| Reasoning traces | — | — | For key decisions only | For all significant decisions |
| Surfacing Audit | — | — | — | If aggregation surface |
| Feature classification | — | — | — | Required |

### The Minimum Viable Pre-Build (Standard)

For Standard tasks, the minimum viable pre-build is:
```yaml
pre_build:
  intent:
    problem: "[What we're solving, one sentence]"
    output_type: "[Decision Surface / Data Display / Export / Narrative]"
    scope_in: "[What's included]"
    scope_out: "[What's explicitly excluded]"
    success: "[Done looks like...]"
  completeness_target: "[Full / Scoped / Foundation]"
  outcome:
    before: "[User state before]"
    after: "[User state after]"
```

This takes 5-10 minutes and prevents the most common build failures (building the wrong thing, unclear scope, no definition of done).

### The Full Pre-Build (Complex)

For Complex tasks, produce all required declarations per `_expectations/PRE-BUILD.md` and `_quality/QUALITY_PROTOCOL.md` Gate 0. No shortcuts — Complex tasks justify the full investment.

---

## Section 4: File Reference Map

When you need something, this tells you where to find it.

### "What should I build?"
| Need | File |
|------|------|
| Product specs | Notion Product Specs |
| Feature requirements | Notion Feature Registry |
| Pending instructions | `handoff/from-chat/` |
| Current focus | Notion Project Home |

### "How should I build it?"
| Need | File |
|------|------|
| Build patterns | `.claude/WORKFLOW.md` |
| Component system | `_ui/components.yaml` |
| Token system | `_ui/tokens.yaml` |
| State handling | `_ui/states.md` |
| Layout patterns | `_ui/layouts/` |
| Interaction patterns | `_interaction/*` |
| Navigation patterns | `_model/patterns/navigation.md` |
| Data display patterns | `_model/patterns/data-display.md` |
| Form patterns | `_model/patterns/forms.md` |
| Tool selection | `config/TOOLING.md` + `config/tech-foundation.yaml` |
| Reference analysis | `_quality/REFERENCE_ANALYSIS.md` |

### "What constraints apply?"
| Need | File |
|------|------|
| Product laws | `_rules/laws.yaml` |
| Project laws | Notion Constitution |
| Constraint index | `CONSTRAINTS_INDEX.yaml` |
| Archetype budgets | `_quality/archetypes/{type}.yaml` |
| Token constraints | `_ui/tokens.yaml` capability_matrix |
| Invariants | `_invariants/REGISTRY.md` |
| NFR requirements | `_nfr/*.yaml` |

### "What exists already?"
| Need | File |
|------|------|
| Truth model | `_model/truth/*.yaml` |
| Existing surfaces | `_surfaces/REGISTRY.yaml` |
| Past decisions | Notion Decisions + `_decisions/REGISTRY.md` |
| Product strategy | Notion Product Strategy |

### "How do I evaluate quality?"
| Need | File |
|------|------|
| Critique loop | `_critique/LOOP.md` |
| Critique prompt | `_critique/PROMPT.md` |
| Score calibration | `_critique/CALIBRATION.md` |
| Quality rubric | `_critique/RUBRIC.md` |
| Visual verification | `_quality/VISUAL_VERIFICATION.md` |
| Quality tests | `_expectations/TESTS.md` |
| Release review | `_quality/RELEASE_REVIEW.md` |
| Reference analysis protocol | `_quality/REFERENCE_ANALYSIS.md` |

### "How do I log what I did?"
| Need | File |
|------|------|
| Session protocol | `.claude/PROTOCOL.md` |
| Decision format | `.claude/PROTOCOL.md` Decisions section |
| Handoff format | `.claude/PROTOCOL.md` Handoff section |
| Journal format | `.claude/PROTOCOL.md` Journal section |
| Learning signals | `EVOLUTION.md` |

---

## Section 5: Common Build Scenarios

### Scenario: "Fix this bug"
Classification: Targeted (usually)
Path: Targeted
Key files: RUNBOOK.md → laws.yaml → relevant UI/logic files → fix → spot-check → commit

### Scenario: "Add a column to this table"
Classification: Targeted or Standard (depends on whether it requires a design decision)
Path: Targeted if obvious, Standard if choices exist
Key files: _ui/components.yaml → _model/patterns/data-display.md → relevant truth model

### Scenario: "Build the settings page"
Classification: Complex (new surface)
Path: Complex
Key files: Full pre-build → archetypes → explore with reference analysis → full critique

### Scenario: "Improve the loading states"
Classification: Standard (touches existing surfaces, requires design thinking)
Path: Standard
Key files: _ui/states.md → _interaction/CHOREOGRAPHY.md → affected surfaces → critique

### Scenario: "Redesign the sidebar navigation"
Classification: Complex (cross-surface, architectural)
Path: Complex
Key files: _model/patterns/navigation.md → _ia/grammar.yaml → all affected surfaces → Gate 8

### Scenario: "Add inline editing to data table rows"
Classification: Standard or Complex (depends on number of surfaces affected)
Path: Standard if one surface, Complex if multiple
Key files: _model/patterns/data-display.md → _interaction/FOCUS.md → _ui/states.md → truth model

---

## Section 6: Anti-Patterns

| Anti-Pattern | Why It Fails | Instead |
|--------------|-------------|---------|
| Skip to build | No constraints loaded, no intent, wrong direction | Always classify first, then follow the path |
| Load everything | Context window bloat, analysis paralysis | Load only what the classification requires |
| Classify too low | Discover complexity mid-build, rework needed | When unsure, classify one tier higher |
| Skip exploration for Complex tasks | Commit to first approach, miss better options | Exploration is mandatory for Complex |
| Skip visual check | Critique scores based on code, not user experience | Render in browser before critique |
| Treat every task as Complex | Compliance fatigue, slow velocity | Most tasks are Targeted or Standard |
| Ignore file reference map | Reinvent solutions that already exist in the system | Check the map before building new patterns |

---

## Section 7: Reclassification Protocol

If during any build path you discover the task is more or less complex than initially classified:

### Upgrading (Targeted → Standard, Standard → Complex)

1. STOP current work at a clean point
2. Reclassify with justification
3. If upgrading to Standard/Complex: complete pre-build steps you haven't done yet
4. Resume from the earliest step in the new path that you haven't completed
5. Note the reclassification in your handoff file

### Downgrading (Complex → Standard, Standard → Targeted)

1. Permitted only if you haven't started building yet
2. If already building: complete at current classification level
3. Downgrading after build has started is not allowed (the pre-build work is already done; skipping critique isn't an option)

**Rule:** Reclassification is an honest signal, not a shortcut. Upgrading is always allowed. Downgrading is only allowed before build starts.
