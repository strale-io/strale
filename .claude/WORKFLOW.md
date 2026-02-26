# Claude Code Workflow

> Execution guidance for AI-assisted development.

---

## Scope Clarification

This file governs **how to build** — execution patterns for plan mode, subagents, verification, critique, and quality gates.

For **how sessions operate** — decisions, logging, handoffs, authority thresholds — see `PROTOCOL.md`.

| Concern | Authority |
|---------|-----------|
| Plan mode, subagents, verification | This file |
| Critique loop, quality gates | This file |
| Session logging, Journal entries | `PROTOCOL.md` |
| Decision tracking, handoffs | `PROTOCOL.md` |
| Authority thresholds, delegation | `PROTOCOL.md` |

For **task classification and file loading** — see `.claude/DISPATCH.yaml`.
For **build sequencing** (which step comes when for your task tier) — see `.claude/BUILD.md`.

**Build-level vs Session-level tracking:**
- `tasks/todo.md` and `tasks/lessons.md` (this file) → Build execution tracking within a single task
- `/handoff/` and Notion Journal (`PROTOCOL.md`) → Session-level logging across actors

Use both systems for their intended purpose. Build tracking is ephemeral and task-scoped. Session logging is persistent and audit-ready.

---

## Build Sequencing

For the complete build sequence, first identify your task type in `.claude/DISPATCH.yaml` (which provides `build_classification`), then follow the corresponding tier path in `.claude/BUILD.md` Section 2. This file (WORKFLOW.md) provides execution patterns (plan mode, subagents, critique integration) used within those build paths.

---

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

**Trigger:** Task complexity > simple fix → Plan first.

---

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

**Pattern:** Main agent orchestrates, subagents execute discrete tasks.

---

### 3. Self-Improvement Loop

- After ANY correction from user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

**File:** `tasks/lessons.md` — append-only mistake log with prevention rules.

**Scope note:** This is build-level learning (how to execute better). For session-level logging (decisions made, context for other actors), use the Notion Journal and `/handoff/` files per `PROTOCOL.md`.

---

### 4. Success Pattern Capture

After a build that exceeds quality gates (all dimensions ≥4, key dimensions at 5):

1. **Identify** what approach worked well
2. **Generalize** to problem type (not project-specific)
3. **Document** in project context with tags:
   - Problem type (e.g., "data-dense dashboard", "onboarding flow")
   - Approach summary (e.g., "used progressive disclosure with 3 reveal levels")
   - Why it worked (e.g., "matched user's mental model of hierarchy")
4. **Propose** to `_model/patterns/` if pattern is reusable across projects

**Rules:**
- Only generalizable patterns enter the system via governance
- Project-specific wins stay in project context
- Pattern proposals require evidence from 2+ builds

**Template:**

```yaml
success_pattern:
  problem_type: "[Category of problem]"
  approach: "[What was done]"
  why_it_worked: "[Why it succeeded]"
  reusable: "[yes/no — if yes, propose to patterns/]"
  evidence: "[Link to build/critique]"
```

---

### 4a. Lesson Promotion Protocol

When learnings from `_runs/` or `tasks/lessons.md` have proven value across multiple builds, promote them to `_quality/LEARNING.md`.

**Promotion Criteria:**

A learning is eligible for promotion when:
- [ ] Observed in **2+ distinct builds** (not just variations of same build)
- [ ] Has **concrete evidence** (RUN-NNN IDs, specific examples)
- [ ] Is **generalizable** (not project-specific)
- [ ] Would **prevent repeated mistakes** or **accelerate future builds**

**Promotion Process:**

1. **Identify candidate** from build runs or lessons
2. **Gather evidence** — list the specific builds where this pattern held
3. **Draft entry** for LEARNING.md using appropriate category (Early Warning, Success Pattern, or Common Trap)
4. **Submit for review** — add to LEARNING.md with `[NEW]` marker
5. **Remove marker** after first verification in subsequent build

**Categories in LEARNING.md:**

| Category | Content Type | Example |
|----------|--------------|---------|
| Early Warning Signals | Predictive indicators of problems | "Late requirement changes after Gate 2 → add 1 critique cycle" |
| Success Patterns | Approaches that consistently work | "Progressive disclosure for data-dense dashboards" |
| Common Traps | Mistakes that repeat | "Missing keyboard navigation on modal close" |

**Promotion Template:**

```yaml
promotion:
  learning: "[What was learned]"
  category: "[early_warning | success_pattern | common_trap]"
  evidence:
    - run: RUN-YYYYMMDD-NNN
      context: "[How it manifested]"
    - run: RUN-YYYYMMDD-NNN
      context: "[How it manifested]"
  proposed_entry: |
    [Draft text for LEARNING.md]
```

**Non-Promotion:**

Keep in project-level `tasks/lessons.md` if:
- Only observed once (may be coincidence)
- Highly project-specific
- Already covered by existing LEARNING.md entry

**See also:** `_runs/README.md` for build log format, `_quality/LEARNING.md` for current learnings.

---

### 5. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

**Test:** If you can't show proof of completion, you're not done.

---

### 6. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

**Balance:** Elegance for complexity, simplicity for simplicity.

---

### 7. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

**Principle:** Autonomy over asking. Fix, then report.

---

## Task Management

| Step | Action | Artifact |
|------|--------|----------|
| 1 | **Plan First** | Write plan to `tasks/todo.md` with checkable items |
| 2 | **Verify Plan** | Check in before starting implementation |
| 3 | **Track Progress** | Mark items complete as you go |
| 4 | **Explain Changes** | High-level summary at each step |
| 5 | **Document Results** | Add review section to `tasks/todo.md` |
| 6 | **Capture Lessons** | Update `tasks/lessons.md` after corrections |

**Note:** `tasks/` files are for build execution tracking within the current task. For session-level logging that persists across actors and survives context resets, use the Notion Journal and `/handoff/` system defined in `PROTOCOL.md`.

---

## Core Principles

| Principle | Meaning |
|-----------|---------|
| **Simplicity First** | Make every change as simple as possible. Impact minimal code. |
| **No Laziness** | Find root causes. No temporary fixes. Senior developer standards. |
| **Minimal Impact** | Changes should only touch what's necessary. Avoid introducing bugs. |

---

## Task File Templates

**Scope:** These templates are for build-level task tracking. They are ephemeral, task-scoped, and owned by the executing agent. For persistent, cross-actor session logging, see `PROTOCOL.md` § Handoff System.

### tasks/todo.md

```markdown
# [Task Name]

## Plan
- [ ] Step 1: Description
- [ ] Step 2: Description
- [ ] Step 3: Description

## Progress
- [x] Step 1 complete — [brief note]

## Review
- What worked:
- What didn't:
- Follow-up needed:
```

### tasks/lessons.md

```markdown
# Lessons Learned

## [Date] — [Project Context]

### Mistake
[What went wrong]

### Pattern
[Why it happened — the generalizable cause]

### Prevention Rule
[Specific rule to prevent recurrence]

---
```

---

## Integration with Starter Kit

| Workflow Step | Starter Kit Component |
|---------------|----------------------|
| Plan Mode | Check `_modes/explore.md` or `_modes/govern.md` |
| Pre-Build | Run Pre-Build Exploration Flow (`_expectations/PRE-BUILD.md`) |
| Quality Check | Follow critique loop (`_critique/LOOP.md`) |
| Decision Logging | Update `_decisions/REGISTRY.md` |
| Artifact Check | Verify against `_artifacts/SYNTHESIS.md` |

---

## When to Use Plan Mode

| Scenario | Plan Mode? |
|----------|------------|
| Simple bug fix | No |
| Adding a new field | No |
| New component | Yes |
| Architectural change | Yes |
| Multi-file refactor | Yes |
| Performance optimization | Yes |
| Integration with external service | Yes |

**Rule of thumb:** If it touches 3+ files or requires a decision, plan first.

---

## Subagent Task Examples

| Task Type | Subagent Assignment |
|-----------|---------------------|
| Research | "Find how Linear implements keyboard navigation" |
| Analysis | "Analyze this codebase for accessibility issues" |
| Generation | "Generate test cases for this component" |
| Exploration | "List 5 approaches to solve this problem" |
| Validation | "Check if this implementation matches the spec" |

**Keep main context clean:** Offload anything that doesn't need to persist.

---

## Quality Gates (Claude Code)

Before marking any task complete:

| Gate | Check |
|------|-------|
| **Compiles** | No syntax errors, imports resolve |
| **Works** | Manual or automated verification |
| **Tested** | Tests pass (or explain why not applicable) |
| **Clean** | No console.logs, no debug code, no TODOs |
| **Documented** | Changes explained in commit or task log |

---

## Error Recovery

| Situation | Action |
|-----------|--------|
| Build fails | Read error, fix root cause, don't mask it |
| Test fails | Understand why, fix test or code (not both blindly) |
| Stuck > 10 min | Re-plan, consider different approach |
| User correction | Update `tasks/lessons.md`, then fix |
| Scope creep | Stop, re-plan, get confirmation |

**Never:** Push through confusion. Always: Stop and re-orient.

---

## Reference Precision

When referencing starter kit files, cite specific sections — not whole files.

| Do | Don't |
|----|-------|
| "Per Orientation Contract in `_expectations/CONTRACTS.md`" | "Per `_expectations/CONTRACTS.md`" |
| "LAW-007 (Affordance Integrity)" | "See `laws.yaml`" |
| "Gate 3 (Visual Verification) in `QUALITY_PROTOCOL.md`" | "Per `QUALITY_PROTOCOL.md`" |
| "`_invariants/REGISTRY.md` — Feedback Invariants, FB-002" | "Check `_invariants/REGISTRY.md`" |

**Why:** Whole-file references waste tokens and reduce accuracy. Specific references let the reader (human or agent) navigate directly to the relevant section.

**Rule:** Every reference must include enough specificity that the reader does not need to scan the target file.

---

## Intent Drift Detection

During long builds (3+ screens, multi-session work), periodically re-validate understanding against the current conversation state.

### When to Check

| Trigger | Action |
|---------|--------|
| After every 3rd screen | Re-read original spec, compare to what's being built |
| After any scope discussion | Confirm: did scope change? Update plan if yes |
| When something feels "off" | Stop building, articulate what changed |
| At session start | Re-read previous session's plan and outcomes |

### The Check

1. State the original intent (from spec or conversation)
2. State what is currently being built
3. Identify any divergence
4. If divergence exists: is it intentional (agreed-upon change) or accidental (drift)?
5. Accidental drift → stop, re-align, then continue
6. Intentional divergence → document the change in `_decisions/REGISTRY.md`

### Drift Indicators

| Signal | Risk |
|--------|------|
| Building features not in spec | Scope creep |
| Skipping declared features | Silent descoping |
| Changing terminology mid-build | Model coherence failure |
| "While I'm here, I'll also..." | Opportunistic drift |
| User request contradicts earlier decision | Undocumented pivot |

**Principle:** The cost of checking intent is always less than the cost of rebuilding from drift.

---

## Gap Recognition

When a problem cannot be solved by composing existing system concepts, document the gap rather than improvising.

### Gap Triggers

| Trigger | What It Means |
|---------|---------------|
| Repeated low scores in the same critique dimension | The system's guidance in that area is insufficient |
| Low-confidence decisions that needed user correction | The system lacks coverage for this decision type |
| Improvisation outside the framework | A real need exists that the framework doesn't address |
| Workarounds that feel hacky | The system's model doesn't match reality |
| Same question asked across multiple builds | Missing reusable answer |

### Gap Documentation

When a gap is identified:

```yaml
gap:
  description: "[What the system cannot currently handle]"
  evidence: "[Specific situation where this was felt]"
  proposed_home: "[Which file should address this]"
  proposed_solution: "[Brief sketch of what would help]"
  priority: "[blocking / important / nice-to-have]"
```

### Processing Gaps

1. Document gap immediately (don't lose it)
2. Do NOT improvise a solution into existing files
3. Submit as governance proposal through `GOVERNANCE.md` process
4. If the gap is blocking current work: make a pragmatic decision, document it in `_decisions/REGISTRY.md`, and flag for system-level resolution later

**Principle:** Improvisation solves the moment. Governance proposals solve the pattern.

---

## Component Evolution Path

When an existing component doesn't quite fit a need, follow this path instead of improvising.

### The Path

```
1. DOCUMENT → Note the gap in project context
2. COMPOSE  → Attempt to solve by composing existing components
3. PROPOSE  → If composition insufficient, create evolution proposal
4. PROCEED  → Make pragmatic decision for current build, flag for system resolution
```

### Step 1: Document the Gap

```yaml
component_gap:
  component: "[Which component]"
  gap: "[What it can't do that's needed]"
  context: "[Build/surface where this arose]"
  attempted_compositions: "[What was tried]"
```

### Step 2: Attempt Composition

Before proposing evolution:
- Can two existing components combine to solve this?
- Can a wrapper component provide the missing capability?
- Can the layout pattern change to avoid the gap?

### Step 3: Create Evolution Proposal (if needed)

```yaml
component_evolution:
  component: "[Which component]"
  proposed_change: "[What would fix it]"
  evidence: "[Builds where this mattered]"
  backwards_compatible: "[yes/no]"
  affects_other_uses: "[Which other surfaces use this component]"
```

Submit via governance process in `GOVERNANCE.md`.

### Step 4: Proceed Pragmatically

For current build:
- Make pragmatic decision
- Document deviation in `_decisions/REGISTRY.md`
- Mark for resolution when evolution is approved

**Principle:** Channel evolution pressure through governance, not around it.

---

## Visual Verification

For the complete visual verification protocol including capture, storage, and evaluation procedures, see `_quality/VISUAL_VERIFICATION.md`.

**Summary:** Visual verification means rendering the product in a browser, capturing screenshots at key breakpoints and states, and evaluating them against quality criteria. Code review alone is insufficient for visual quality scoring.

**Quick reference:**
- Capture at 1440px and 1024px minimum (desktop)
- Capture all relevant states (default, empty, loading, error)
- Use realistic data, never placeholder text
- Store in `audit-output/{date}-visual/{surface-name}/`
- Evaluate before each critique cycle, not after
- Without visual verification, Visual Craft is capped at 3

See `_quality/VISUAL_VERIFICATION.md` for the full protocol.

---

## Parallel Critique Strategy

When running the critique loop, phases can be parallelized to reduce total cycle time.

### Phase 1: Automated Checks (run first, background)

Start these immediately — they can run while other work proceeds:

- Token compliance (TK-001 to TK-004)
- Reference integrity (cross-file links resolve)
- Invariant ID format compliance
- Accessibility audit (automated portion via axe-core or similar)

### Phase 2: Visual Evaluation (can start immediately)

Start in parallel with Phase 1:

- Screenshot capture at key breakpoints
- Squint test execution
- Hierarchy evaluation
- Peer comparison (Linear/Stripe/Notion benchmark)

### Phase 3: Semantic Evaluation (after Phase 1 completes)

Depends on Phase 1 findings:

- Model coherence scoring
- Intent alignment verification
- Design reasoning review
- User expectation verification

### Parallel Execution Pattern

```
Time →
Phase 1: ████████░░░░░░░░░░░░
Phase 2: ████████████░░░░░░░░
Phase 3: ░░░░░░░░████████████
         ↑         ↑
         Start     Phase 1 done
```

**Pattern:** Start Phases 1 and 2 simultaneously. Phase 3 depends on Phase 1 findings. Total cycle time reduced by ~40%.

**Rule:** Do not skip phases. Parallelization speeds execution; it does not reduce coverage.

---

## Release Protocol

When all screens pass critique loops, the Release Readiness Review triggers automatically. See `_quality/RELEASE_REVIEW.md`.

**Do not skip this.** Individual critique loops passing does not mean the product is ready. Cross-surface coherence, holistic accessibility, and human judgment are required.

**Your role in the review:**
- Phases 1–4: Run automatically, save outputs to `audit-output/{date}-release-review/`
- Phase 5: Present the structured handoff to the human and record their responses
- Phase 6: Wait for explicit "Ship [version]" before recording sign-off

**If any phase fails:** Report the failures, fix them, then re-run from the earliest affected phase per the re-review scope rules in RELEASE_REVIEW.md.
