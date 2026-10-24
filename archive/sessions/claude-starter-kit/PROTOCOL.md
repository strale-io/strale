# Workflow Protocol

> This document is not a strategy deck. It is an execution constraint.

**Purpose:** Define how the human product owner, Claude Chat, and Claude Code communicate, make decisions, and leave trails — so nothing gets lost, overwritten, or forgotten.

---

## Placeholder Legend

This file is a generic template. Before use, fill in all placeholders marked with `__FILL__` or `__SELECT__`.

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `__FILL:human_authority__` | Name or role of the human product owner | `Petter`, `Product Lead` |
| `__FILL:url__` | A URL that must be provided during Bootstrap | `https://notion.so/myproject/...` |
| `__FILL:name__` | A name that must be provided during Bootstrap | `my-team`, `my-product` |
| `__SELECT:tool__` | Tool choice with default noted in parentheses | Defaults: Notion, Linear, GitHub |

**Defaults:** This protocol assumes Notion (project management), Linear (issue tracking), and GitHub (version control). These are the recommended and documented defaults. If you use different tools, substitute throughout — but the protocol's concepts (databases, issues, branches) remain the same.

**Bootstrap Mode** (see end of document) automates placeholder filling during project initialization.

---

---

## The Three Actors

| Actor | Role | Reads From | Writes To |
|-------|------|------------|-----------|
| **__FILL:human_authority__** | Intent, priorities, decisions, feedback, acceptance | Everything | Notion, Linear, GitHub (via Claude Code) |
| **Claude Chat** | Analysis, spec writing, design thinking, translation | Notion, Linear, GitHub (via project knowledge), Starter Kit | Notion, Linear |
| **Claude Code** | Implementation, audits, file changes, testing | Notion, Linear, GitHub repo, Starter Kit, `/handoff/from-chat/` | GitHub repo, Notion, Linear, `/handoff/from-code/` |

**Actor Codes** (defaults — configurable during Bootstrap)**:** Used in ID generation and Journal entries.

| Actor | Code |
|-------|------|
| __FILL:human_authority__ | `P` |
| Claude Chat | `C` |
| Claude Code | `X` |

**Actor specificity default:** When this document says "Claude" without qualification, the rule applies to both Claude Chat and Claude Code. When a rule is actor-specific, it names the actor explicitly (e.g., "Claude Code must..." or "Claude Chat must...").

---

## System Constraints

This workflow is optimized for a specific operating model. If these constraints change, the system must be re-evaluated.

| Constraint | What It Means | What Breaks Without It |
|------------|---------------|------------------------|
| **Single human authority** | __FILL:human_authority__ is the sole decision-maker. Confirmations are timely. Standing delegations are exceptions, not defaults. | Authority diffuses, confirmations stall, standing delegations become permanent by inertia, friction compounds. |
| **Notion is the primary store, not a transactional source of truth** | Notion is the primary store during normal operation — the Decisions database, Journal, Feature Registry, and Glossary all live there. However, Notion is not transactional, not schema-enforced, and not designed for append-only guarantees. Handoff files are the canonical fallback when Notion is unavailable and are preserved as the audit trail of last resort. | If Notion is treated as infallible, data loss or silent edits can corrupt the audit trail. If handoff files are treated as always-canonical, Notion becomes a dead copy that nobody trusts. |
| **AI adherence is a capability, not a guarantee** | Claude will sometimes misjudge decision detection, miss authority thresholds, or accidentally summarize instead of quoting. The system must survive these failures. | If the system assumes perfect AI compliance, unreviewed auto-decisions become load-bearing and audit gaps go unnoticed. |
| **Context windows are finite** | Claude Chat and Claude Code have limited context windows. Protocol metadata (strategy, journals, decisions, handoffs) competes with working memory for the actual task. | If context loading consumes too much of the window, Claude's performance on the actual task degrades. The Current State Summary, handoff files, and CLAUDE.md must be kept concise. |
| **One product, one repo, one team** | This workflow assumes a single product with one GitHub repo and one Linear team. | Multi-repo, multi-team, or multi-product setups require structural changes to ID formats, handoff folders, and authority chains. |

If the single-authority constraint changes (e.g., a second decision-maker joins), the Authority Thresholds, Standing Delegations, and Contradiction Protocol all need revision.

### Context Budget

Protocol metadata (CLAUDE.md, Current State Summary, Active Decisions, handoff files, config) should consume no more than **20%** of the actor's context window. If metadata load exceeds this budget:

**Progressive loading tiers (in priority order):**
1. First: Summarize older Journal entries instead of loading full text
2. Second: Archive superseded decisions instead of keeping all active
3. Third: Load only feature-relevant handoffs, not global

**Scale thresholds:**
- **100+ decisions:** Trigger "metadata diet" review — archive decisions older than 90 days that are superseded or shipped
- **200+ Journal entries:** Summarize entries older than 30 days; keep only headlines accessible
- **50+ Active Decisions in CLAUDE.md:** Cap at 50 most recent/relevant; archive the rest

If any threshold is exceeded, the next Full session must address it before other work begins.

### Archival Policy

To prevent unbounded growth, the following retention thresholds apply:

| Document Type | Archive Trigger | Archive Action |
|---------------|-----------------|----------------|
| **Decisions** (superseded) | 90 days after superseded | Move to archive; keep as read-only reference |
| **Decisions** (shipped) | 180 days after shipped | Move to archive; keep as read-only reference |
| **Journal entries** | 365 days AND feature shipped | Summarize to one-line headline; archive full text |
| **Active Decisions list** | Exceeds 50 items | Keep 50 most recent/relevant in CLAUDE.md |
| **Handoff files** | Feature shipped + 30 days | Move to `handoff/_archive/<feature>/` |

Archived items remain searchable but are not loaded into context by default. Full text can be retrieved on demand.

**Reversal safeguard:** Before creating a Decision that reverses shipped behavior, search archived Decisions for the original design rationale. Changing shipped behavior is effectively superseding the original Decision, even if archived — apply the Contradiction Protocol with the archived decision surfaced.

**Re-validation:** Active decisions older than 90 days that have not been referenced in a Journal entry, handoff file, or contradiction check → flag for re-validation during the next audit. The human reviews and either reaffirms (add "Reaffirmed [date]" to the Decision's Rationale field) or supersedes.

---

## Session Modes

Every session starts by declaring the **session intent** and determining the session mode. The mode governs how much process is required.

### Session Intent

Every session begins with a single sentence declaring what the session is for. This is written as the first line of the handoff file and included in the Journal entry.

**Format:** `Intent: [one sentence describing the goal]`

**Examples:**
- `Intent: Fix contrast issue on TokenEditor submit button (LIN-042)`
- `Intent: Design token editing UX — explore inline vs modal approaches`
- `Intent: Implement time-tracking MVP per spec in handoff/time-tracking/from-chat/2026-02-05-spec.md`

The session intent serves as a scope anchor. If work begins drifting beyond the stated intent, that's an escalation signal.

### Mode Selection Criteria

| Mode | When | Examples |
|------|------|---------|
| **Quick** | Single-issue fix, under ~1 hour, no design decisions, no new features | Bug fix, copy change, config tweak, dependency update |
| **Full** | New feature work, design exploration, multi-issue sessions, anything requiring decisions | Feature implementation, design session, refactor, audit |

**Default:** If unclear, start Quick. Escalate to Full if any escalation trigger fires.

**Escalation Triggers (Quick → Full):** A Quick session must escalate to Full when any of the following occur:

- The session touches a second feature (cross-feature work requires Full context loading)
- A design decision emerges (not just a bug fix — a choice between alternatives)
- The estimated remaining work exceeds 2 hours
- A contradiction with an existing decision is detected
- __FILL:human_authority__ explicitly requests escalation

When escalating, complete the Full Session "On start" steps before continuing work. Note the escalation in the Journal entry.

### Quick Session Protocol

**Covers:** Mandatory compliance tier.

**On start:**
1. Declare session intent
2. Run connectivity check (Git + handoff folder; Notion/Linear if touching issues). If any check fails, log the failure (see Degraded Mode).
3. Read `handoff/from-chat/` for pending items
4. Check relevant Linear issue(s)
5. If session touches UI: Read `DESIGN_ROUTER.yaml` → load referenced design files for affected surface types

**On end:**
1. Write handoff file to `handoff/from-code/` (can be one-liner: "Fixed button contrast, updated LIN-042")
2. Update Linear issue status + append Log row
3. Create Journal entry (one line minimum)

### Full Session Protocol

**Covers:** Mandatory + Extended compliance tiers.

**On start:**
1. Declare session intent
2. Run Pre-Build Connectivity Checklist (all connections). If any check fails, log the failure (see Degraded Mode).
3. Read Project Home → current focus
4. Read Product Strategy — Current State Summary (check for stale flag — if stale, regenerate before proceeding)
5. Read last 5 Journal entries filtered by relevance (if context-constrained per Context Budget, load summaries for entries older than 7 days): prioritize entries tagged with the feature(s) to be worked on, entries with `Action Required: yes`, and entries of type `decision-context`, `course-correction`, or `risk`. Skip one-liner Quick session entries about unrelated features.
6. Read active Decisions (global always; feature-scope when relevant)
7. Read `handoff/from-chat/` for pending specs or feedback
8. Check Linear priorities
9. If session touches UI: Read `DESIGN_ROUTER.yaml` → load referenced design files for affected surface types

**On end:**
1. Create Journal entry (`YYYY-MM-DD [description]`, full format)
2. Update Linear statuses + append Log rows
3. Create Linear issues for follow-up items or bugs found
4. Log any decisions made (respect authority thresholds)
5. Save session summary to `handoff/from-code/`
6. Update Feature Registry status if changed
7. Run Contradiction Check if decisions were made
8. Run Post-Session Self-Audit (see AI Adherence section)

### Session Checkpoints

**Trigger:** Session exceeds 90 minutes OR actor switches to a different feature.

When triggered:
1. Write interim handoff file to `handoff/<feature>/from-code/` (or `from-chat/`) with decisions, terms, and issues since last checkpoint
2. Create Journal entry (type: `session-checkpoint`) listing decisions-to-date
3. Reset mental "decisions this session" counter

**Mode interaction:** If a Quick session triggers a checkpoint (90+ minutes), escalate to Full mode. A session lasting 90+ minutes is no longer "quick" — complete the Full Session "On start" steps before the next work block.

### Claude Chat Session Protocol

Claude Chat sessions don't follow the Quick/Full structure (they're conversations, not implementation sessions), but they have their own completion requirements.

**Before ending any Chat session where a Journal trigger condition was met:**
1. Create or confirm all required Journal entries in Notion
2. Create or confirm all required Decision entries in Notion
3. If Notion is unavailable, write pending entries to the appropriate `handoff/from-chat/` folder with `[BACKFILL]` prefix
4. Summarize any pending items that need Claude Code action

This is non-negotiable. A Chat session that triggers Journal conditions but creates no entries is a system failure.

**Chat and Explore Mode:** When a Claude Chat session follows the starter kit's Explore mode flow (`_modes/explore.md`), the Explore mode governs *how the exploration is conducted* (Frame → Research → Generate Options → Evaluate → Recommend). The Chat Session Protocol governs *logging and audit requirements* (Journal entries, Decision entries, handoff files). Both apply simultaneously. When Explore mode's exit criteria say "Document decision in Notion Decisions database," use this protocol's Decision format (including Confidence, Scope, Reviewed, and Detection Signal fields). Explore mode's "Lock the recommendation" step maps to creating a Decision with `Reviewed: unchecked` — __FILL:human_authority__'s review is the lock.

---

## Naming Convention

### The Rule

Every concept has **one name**. That name is used identically across Notion, Linear, GitHub, and conversation.

**Scope note:** These naming patterns apply to product-level artifacts (features, screens, decisions, issues, branches). Starter kit file naming conventions (e.g., YAML keys, file names in `_rules/`, `_ui/`, etc.) remain unchanged and follow the starter kit's own conventions.

### Naming Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Features | `kebab-case` | `time-tracking`, `bulk-export` |
| Screens | `PascalCase` | `SettingsPage`, `TokenEditor` |
| Decisions | `DEC-YYYYMMDD-A-XXXX` | `DEC-20260205-C-a8f2`, `DEC-20260210-X-k3m9` |
| Deferred items | `DEF-YYYYMMDD-A-XXXX` | `DEF-20260205-P-b4e1` |
| Journal entries | `YYYY-MM-DD [description]` | `2026-02-05 Token editor design session` |
| Session IDs | `YYYYMMDD-A-HHMM` | `20260205-X-1430` (started at 14:30) |
| Linear issues | `[TYPE] Description` | `[FEATURE] Time tracking MVP` |
| Git branches | `type/kebab-description` | `feature/time-tracking`, `fix/token-contrast` |
| Git commits | `type(scope): description` | `feat(ui): add time tracking component` |

**ID Format — Decisions and Deferred:** IDs use `DEC-YYYYMMDD-A-XXXX` where `A` is the actor code (`C` = Claude Chat, `X` = Claude Code, `P` = __FILL:human_authority__) and `XXXX` is a random 4-character alphanumeric suffix (lowercase). This format is collision-proof across sessions and actors without requiring a Notion lookup or a sequential counter. If Notion's internal IDs are available, those serve as the canonical machine key; the human-readable ID is for conversation and cross-referencing.

**Why random suffix instead of sequential:** Sequential numbering (`NNN`) requires knowing how many IDs have already been generated that day. If Claude Chat and Claude Code are running in parallel, or during degraded mode, there is no reliable way to coordinate the counter. A random 4-character suffix (`a-z0-9`, 1.6M combinations) eliminates the coordination problem entirely.

**Session ID Format:** Session IDs use `YYYYMMDD-A-HHMM` where `HHMM` is the session start time (24h format, UTC or local — be consistent within the project). This avoids the collision problem of sequential session numbers during degraded mode, since two sessions by the same actor at the same minute are operationally impossible.

**Relationship to starter kit Decision Registry:** The starter kit's `_decisions/REGISTRY.md` uses sequential IDs (`DEC-001`, `DEC-002`, ...) for *system-level* decisions (changes to the starter kit itself — new primitives, new archetypes, rule amendments). The `DEC-YYYYMMDD-A-XXXX` format is for *product-level* decisions (design choices, feature decisions, strategy calls) tracked in the Notion Decisions database. These are two separate registries with two separate ID schemes. System decisions go in `_decisions/REGISTRY.md`. Product decisions go in Notion. They do not overlap.

### Linear Issue Types

| Prefix | When |
|--------|------|
| `[FEATURE]` | New capability |
| `[FIX]` | Bug or defect |
| `[REFACTOR]` | Structural improvement |
| `[DESIGN]` | Design exploration or specification |
| `[CHORE]` | Maintenance, config, cleanup |
| `[AUDIT]` | System or quality audit |

### Product Glossary (Notion Database)

Maintain a living product glossary in Notion. This is separate from the starter kit's system glossary in `SYSTEM_CONTRACT.md` — the product glossary covers domain terms used in your product's UI, specs, and conversations.

| Field | Description |
|-------|-------------|
| Term | The canonical name |
| Definition | What it means (one sentence) |
| Aliases | Other names people might use (mapped here, used nowhere else) |
| Status | `proposed` · `accepted` · `deprecated` |
| First Used | Date the term entered the system |

**Lifecycle:** New terms can be used immediately with `proposed` status. Batch-audit weekly to promote `proposed` → `accepted` or flag conflicts. Deprecated terms get a pointer to their replacement.

**Rule:** If __FILL:human_authority__ says "the timeline thing" and there's a glossary entry for `progress-tracker`, Claude uses `progress-tracker` in all systems and notes the alias. Terms don't need to be registered before first use — but they must be registered by the end of the session in which they're introduced.

**Strict term correction:** When a non-canonical term is used in conversation, Claude must use the canonical term in all system entries (Journal, Decisions, Linear, handoff files) and note the alias in the Glossary. This is critical for search reliability — the "Why Don't We Have X?" protocol depends on consistent terminology. If `authentication` is the canonical term, a search for "login" must still find the right entries via the Glossary's Aliases field.

**Definition changes:** Glossary definitions can be edited in place (definitions should be correct, not versioned). However, when a definition is materially changed — not just a typo fix — the following sequence is required:

1. **First:** Create a Journal entry of type `course-correction` documenting the old definition (quoted exactly), new definition, and reason for the change
2. **Then:** Edit the Glossary entry

This ordering ensures the old definition is captured before it's overwritten. If Claude summarizes instead of quoting the old definition, the audit trail is incomplete.

---

## Document Types

### 1. Journal (Notion Database)

**Purpose:** Append-only log of what happened, what was discussed, and what was learned.

| Field | Description |
|-------|-------------|
| Title | `YYYY-MM-DD [description]` |
| Type | `session` · `decision-context` · `course-correction` · `risk` · `brainstorm` |
| Actor | `petter` · `claude-chat` · `claude-code` |
| Source | `chat` · `code` · `manual` |
| Session | `YYYYMMDD-A-HHMM` format (date + actor code + start time). Groups entries from the same session. |
| Content | What happened, key insights, links to artifacts |
| Tags | Feature names, topic labels |
| Action Required | `yes` · `no` (default: `no`). Entries tagged `no` are informational only — __FILL:human_authority__ can skip them during review. |
| Reviewed | Checkbox (default: unchecked). __FILL:human_authority__'s triage mechanism. |
| Related Feature | Notion relation → Feature Registry (a Notion relation is a database field that creates a clickable link to a row in another database, ensuring the reference stays valid if the target is renamed) |
| Related Decisions | Notion relation → Decisions |

**When to create a Journal entry:**

A Journal entry is **required** when any of the following occur:
- A decision was made or discussed
- A feature was designed, reviewed, or implemented
- A risk was identified
- A contradiction was found
- Feedback was given on existing work
- A glossary definition was materially changed
- An integrity check was run
- A standing delegation was granted or revoked
- A backfill from degraded mode was completed
- Degraded mode was entered (connectivity failure)

A Journal entry is **optional** for:
- Pure Q&A about existing documentation with no new information
- Clarification of existing decisions with no changes
- Trivial conversation

Quick sessions always get a minimum one-line entry regardless.

**Content format by session type:**
- **Quick sessions:** Single-line summary is sufficient (e.g., "Fixed button contrast on TokenEditor, updated LIN-042"). Set `Action Required: no`.
- **Full sessions:** Narrative format with key insights, decisions referenced by ID, and links to artifacts. Set `Action Required` based on whether __FILL:human_authority__ needs to review or act.

**Rules:**
- Never edit a Journal entry after creation
- Corrections → new entry with type `course-correction` that references the original
- Claude Chat creates Journal entries automatically when a trigger condition above is met
- Claude Code creates Journal entries at session end (mandatory — even one line in Quick sessions)
- `risk` type: for known uncertainties — things that might break, assumptions being made, dependencies not yet confirmed

**Example:**
```
Title: 2026-02-05 Token editor design session
Type: brainstorm
Actor: claude-chat
Source: chat
Session: 20260205-C-0930
Action Required: yes
Related Feature: token-editor
Content: Explored three approaches to token editing UX. Decided inline 
editing with preview (DEC-20260205-C-a8f2). Deferred bulk token operations (DEF-20260205-C-b3k1).
Tags: token-editor, design
```

---

### 2. Decisions (Notion Database)

**Purpose:** Track what was decided, why, and with what confidence.

| Field | Description |
|-------|-------------|
| ID | `DEC-YYYYMMDD-A-XXXX` (date + actor code + random 4-char suffix) |
| Decision | What was decided (one sentence) |
| Rationale | Why this was chosen over alternatives |
| Confidence | `high` · `medium` · `low` |
| Scope | `global` · `feature` · `temporary` |
| Status | `active` · `superseded` · `reversed` |
| Reviewed | Checkbox (default: unchecked). For human triage — especially important for auto-created decisions. |
| Superseded By | Link to replacement decision (if applicable) |
| Date | When decided |
| Source | Link to Journal entry or conversation |
| Related Feature | Notion relation → Feature Registry |

**Reviewed field:** All auto-created Decisions start with `Reviewed: unchecked`. __FILL:human_authority__ reviews and checks them during periodic maintenance or the "Needs Review" view. The integrity check flags any unreviewed Decision older than 7 days. This prevents auto-created decisions from becoming load-bearing without human validation.

**What counts as a Decision:** A Decision entry requires commitment language ("we will," "the approach is," "this is how") and an explicit trigger (discussion, contradiction, design choice). If there's no commitment and no trigger, it belongs in the Journal as a note. The `confidence = low` field handles assumptions — no separate taxonomy needed.

**Decision Detection Heuristic (both actors):** Claude should treat the following as decision signals:
- Commitment language: "we will," "the approach is," "let's go with," "this is how we'll"
- Explicit choice between named alternatives: "option A over option B"
- Resolution of a previously logged risk or open question
- __FILL:human_authority__ using directive language: "do it this way," "use X not Y," "that's the direction"

Not a decision: Exploratory discussion ("what if we..."), questions without resolution, observations, or preferences stated without commitment. When uncertain, log it as a Journal entry with type `brainstorm` or `decision-context`. __FILL:human_authority__ can always promote it later using "Log decision:".

**Hard stop rule (Claude Chat):** If Claude Chat thinks a decision *might* have been made but is uncertain, it must default to creating a Journal entry (type `decision-context`), **never** a Decision entry. This reduces false positives during the calibration period and respects the principle that uncertain auto-decisions are worse than missed decisions — a Journal entry preserves the context for __FILL:human_authority__ to promote later, while a false Decision pollutes the Decisions database.

**Confidence:**
- `high` — Strong evidence, tested, or obvious
- `medium` — Reasonable judgment, some uncertainty
- `low` — Assumption being made (effectively an assumption — no separate database needed, just filter Decisions by `confidence = low`)

**Scope:**
- `global` — Affects the whole product. Always requires __FILL:human_authority__'s confirmation.
- `feature` — Affects one feature. Can be auto-created by Claude if confidence is `high` or `medium`.
- `temporary` — Time-boxed. Include expiry or review date.

**Pre-Decision Feature Check:** Before creating any Decision, query the Decisions database (and Active Decisions in CLAUDE.md) for any decisions on the same feature from the current day. If another actor made a decision on this feature today, surface it and confirm with __FILL:human_authority__ before proceeding. This catches same-day parallel work that hasn't been backfilled yet. If a potential contradiction is found, escalate to __FILL:human_authority__ rather than auto-creating.

**Rules:**
- Never edit a Decision's content after creation
- To change a decision → create a new Decision with `superseded` status on the old one
- Global decisions always require __FILL:human_authority__'s confirmation
- The Contradiction Protocol (below) governs conflicts
- When Claude auto-creates a Decision without __FILL:human_authority__'s confirmation, the Rationale field must include an authority note: "Auto-created: feature-scope, [confidence level]. Threshold met because [reason]. Detection signal: [the specific signal that triggered creation, e.g., 'explicit choice between inline editing and modal editing']."

The detection signal requirement ensures auditability — __FILL:human_authority__ can assess whether the auto-creation was justified by checking the signal against the conversation.

---

### 3. Product Strategy (Notion — Append-Only Page + Derived Summary)

**Purpose:** Living document of product direction, updated over time.

**Two-page structure:**

#### Strategy Page (Source of Truth — Append-Only)

Single long document. New sections are appended; old sections are never edited or deleted.

```
# Product Strategy

## [Date] — [Title of Update]

### Vision
[Current vision statement]

### Current Focus
[What we're working on now and why]

### Key Bets
[Strategic assumptions we're making]

### Not Doing
[What we've explicitly decided against]

---

## [Earlier Date] — [Earlier Title]
...
```

#### Current State Summary (Derived — Regenerated Periodically)

Separate Notion page, explicitly labeled "Derived / Cached — not authoritative." Claude Chat regenerates this when triggered (see rules below). Claude Code reads **this page** for current direction instead of parsing the full history.

Contains:
- Current vision (one paragraph)
- Active focus areas
- Key active bets
- Recent changes (last 2–3 updates summarized)
- `Last regenerated: [date]`
- `Stale: yes/no`

**Conciseness requirement:** The Current State Summary must not exceed ~1,500 words. This is a context window protection — if this summary grows to 5,000 words, it consumes working memory that Claude Code needs for actual implementation. When regenerating, prioritize brevity: one paragraph per section, bullet points for lists, no narrative history. The full Strategy Page exists for history; the summary exists for rapid context loading.

**Rules:**
- Strategy Page: Never edit previous sections — only append new ones
- Strategy Page: Every new section includes a changelog entry at the bottom
- Current State Summary: Can be fully overwritten when regenerated
- Current State Summary: Always includes "Last regenerated: [date]" at top
- When strategy changes, the new section explains what changed and why
- Claude Chat creates new Strategy sections after significant discussions (with __FILL:human_authority__'s confirmation)

**Staleness rules:**
- When a new Strategy section is appended, the Current State Summary is immediately flagged as stale (`Stale: yes`). It does **not** need to be regenerated immediately — rapid strategy iteration (e.g., 3 updates in one session) should not be interrupted by regeneration each time.
- The stale flag is the signal, not the regeneration. Claude Code checks this flag at Full session start (step 4). If stale, Claude Code should read the full Strategy Page append log for accurate context, not rely on the cached summary.
- Regeneration must happen within the current session or the next Full session. If it cannot be done in the current session, Claude Chat notes "(Current State Summary is stale)" in the handoff file.
- **Full Session start step:** If Current State Summary is stale, regenerate it before proceeding with other work. This is an Extended compliance requirement.
- If not triggered by a strategy change, regenerate monthly at minimum during periodic maintenance.

---

### 4. Feature Registry (Notion Database)

**Purpose:** Catalog of all features and their important screens. This is a stable metadata store — it records what features exist, not their execution status.

| Field | Description |
|-------|-------------|
| Feature Name | Canonical name (kebab-case, must match Glossary) |
| Description | One-paragraph summary |
| Key Screens | List of screens belonging to this feature |
| Spec Link | Link to Notion Product Spec |
| Decisions | Notion relation → Decisions database |
| Deferred Items | Notion relation → Deferred database |
| Owner | Who's responsible |

**Screen sub-entries:**

| Field | Description |
|-------|-------------|
| Screen Name | PascalCase, must match Glossary |
| Archetype | `workspace` · `detail` · `overview` · `configuration` · `transient` |
| Spec Link | Link to screen spec |

**Status is derived from Linear.** The Feature Registry does not independently track execution status. Instead, status is determined by querying Linear issues associated with the feature. Default sync: Linear → Feature Registry (one-way).

| Linear State (all issues for feature) | Derived Feature Status |
|---------------------------------------|----------------------|
| All in Backlog/Todo | `planned` |
| Any In Progress | `in-progress` |
| All Done | `shipped` |

**How derivation works in practice:** During integrity checks (or on-demand), query all Linear issues whose title contains the feature name (matching the Feature Registry's canonical name). Apply the derivation table above to determine current status. This is automated by the audit script (see Integrity Checks — check #12).

**Manual override rule:** `paused` and `cancelled` can only be set manually by __FILL:human_authority__, and override the derived status from Linear. When a manual override is set, a Journal entry is required documenting the reason. When a manual override is removed, derivation from Linear resumes automatically. Manual overrides are the exception — the default is always derived status.

**Split-brain detection:** When a manual override is active (e.g., `paused`), the integrity check must verify that Linear issues for that feature are consistent with the override. Specifically: if a feature is `paused` in the Feature Registry but has `In Progress` issues in Linear, the audit script flags this as a warning: "Feature [name] is PAUSED in Feature Registry but has [N] active issues in Linear." This prevents silent drift between Notion and Linear.

**Rules:**
- Every feature must have a Feature Registry entry before implementation work begins (design discussion and brainstorming can reference a feature before its registry entry exists — see Glossary lifecycle for how names enter the system)
- Every significant screen must be listed under its feature
- Don't manually track status here — derive it from Linear (with the manual override exception above)
- This is where you answer "What features do we have?" and "What screens exist?"
- All relations (Decisions, Deferred, Journal) use Notion relation fields, not free-text tags

---

### 5. Deferred (Notion Database)

**Purpose:** Track things deliberately postponed — not forgotten, just not now.

| Field | Description |
|-------|-------------|
| ID | `DEF-YYYYMMDD-A-XXXX` |
| What | What was deferred |
| Why | Why it was deferred |
| Planned Phase | When it might be addressed |
| Status | `deferred` · `reactivated` · `cancelled` |
| Source | Link to Journal entry or Decision |
| Date Deferred | When |
| Cancelled Reason | If status = `cancelled`, why it's no longer relevant |
| Related Feature | Notion relation → Feature Registry |

**Rules:**
- Never delete a Deferred item
- If a deferred item becomes irrelevant → set status to `cancelled` with a reason (don't delete it — the reasoning is valuable history)
- If reactivated → set status to `reactivated` and create a Journal entry + Linear issue
- "Why don't we have X?" → search Decisions + Deferred + Journal before answering (see protocol below)

---

### 6. Handoff System (GitHub Repo)

**Purpose:** Guaranteed output from every session. The handoff file is the contract; Notion is a backfill target.

#### Folder Structure

```
/handoff/
  <feature-name>/     ← organized by feature
    from-chat/         ← Claude Chat outputs for Claude Code
    from-code/         ← Claude Code outputs for Claude Chat
  _general/            ← cross-cutting or non-feature-specific handoffs
    from-chat/
    from-code/
```

**`from-chat/` contents:**
- Spec files (what to build)
- Design decisions (context for implementation)
- Design Brief (visual identity, surface types, peer benchmarks — see template below)
- Review feedback (what to change)

**`from-code/` contents:**
- Session summaries (what was done)
- Questions for __FILL:human_authority__ or Chat (blockers, ambiguities)
- Audit outputs (results, screenshots)

**Rules:**
- Files are timestamped: `YYYY-MM-DD-description.md`
- Every handoff file starts with the session intent line: `Intent: [one sentence]`
- Claude Code reads `from-chat/` at session start (mandatory)
- Claude Code writes to `from-code/` at session end (mandatory — even a one-liner in Quick sessions)
- Handoff files are the primary session record. Notion logging is secondary (backfill when connectivity allows).
- When a feature ships → archive its handoff folder (move to `/handoff/_archive/<feature-name>/`)
- Periodic cleanup: archive shipped features, remove files older than 90 days from `_archive/`

#### Design Brief Template

When a `from-chat/` handoff includes UI work, include a Design Brief section. This gives Claude Code the visual context needed to make design-consistent implementation decisions.

```markdown
## Design Brief

**Surface type(s):** __SELECT: table | detail | form | dashboard | settings | wizard | empty_state | modal__
**Design system preset:** __SELECT: publishing | professional | __FILL____
**Peer benchmarks:** __FILL__ (e.g., Linear, Stripe, Notion — what should this feel like?)

### Visual Identity
- Primary typeface: __FILL__
- Accent color: __FILL__
- Border radius: __FILL__
- Spacing scale: __FILL__
- Key visual trait: __FILL__ (e.g., "dense but breathable", "editorial whitespace")

### Constraints
- __FILL__

### States Required
- [ ] Default
- [ ] Empty
- [ ] Loading
- [ ] Error
- [ ] Disabled (if applicable)
```

**Usage:** Claude Code reads the Design Brief at session start (step 5/9 in session checklists). The surface type(s) determine which files to load via `DESIGN_ROUTER.yaml`. The visual identity section provides the implementation-level details that the design system preset alone doesn't capture.

---

## Protocols

### Contradiction Protocol

When a new decision contradicts an existing one:

1. **Quote both** — show the old decision and the proposed new one, side by side
2. **Explain the conflict** — what specifically contradicts
3. **Get confirmation** — __FILL:human_authority__ must approve the supersession
4. **Create audit trail:**
   - New Decision entry with rationale for change
   - Old Decision marked `superseded` with link to new one
   - Journal entry documenting the contradiction and resolution
5. **Update CLAUDE.md** — if the superseded decision was listed in the Active Decisions section, update it immediately. Don't wait for the monthly integrity check.

**Claude cannot silently supersede a decision.** Ever.

**Active Decisions Reference:** Maintain a short list of the 10–20 most important active decisions in the project's `CLAUDE.md` or Project Home page. This catches the most likely contradiction scenarios without requiring a full Notion search every time. Refresh this list:
- At the end of any session that creates decisions
- Immediately when the Contradiction Protocol is invoked (step 5 above)
- During periodic integrity checks (as a catch-up)

**Multi-Actor Degraded Mode:** When Notion is unavailable in a multi-actor environment, ALL actors' handoff files must be read before declaring no contradiction exists. Check `handoff/*/from-code/` AND `handoff/*/from-chat/` for any decisions made in the last 24 hours that might conflict with the current work.

---

### "Why Don't We Have X?" Protocol

When __FILL:human_authority__ (or anyone) asks why a feature or capability doesn't exist:

1. **Glossary-first search:** Check the Glossary for the term used and any aliases. If the user said "login" but the canonical term is "authentication," search using the canonical term.
2. Search **Decisions** (using canonical term + aliases) — was it decided against?
3. Search **Deferred** (using canonical term + aliases) — was it postponed?
4. Search **Journal** (using canonical term + aliases) — was it discussed?
5. If structured search returns nothing → **also do a full-text search** across all three databases before concluding "never considered." Structured queries depend on Notion relations being populated; in early weeks or for older entries, relations may be incomplete. Full-text search catches what structured queries miss.
6. **Handoff file search:** If Notion searches return nothing, also search handoff files in Git (`grep -r "term" handoff/`). Handoff files are the canonical record during degraded periods and may contain discussions not yet backfilled to Notion.
7. If found → show the history with links
8. If not found → it was never considered. Log it as an Open Question or start exploring.

This protocol works best when Notion relations are fully populated. Structured queries beat fuzzy search, but fuzzy search is the fallback, not nothing.

---

### Complete Supersession Rule

**Never edit. Always supersede.**

This applies to:
- Decisions (create new, mark old as superseded)
- Product Strategy (append new section, never edit old)
- Journal entries (create correction entry, never edit original)

**Linear issue descriptions use a split format:**
- **Top section (editable):** Summary, context, acceptance criteria — kept current and readable
- **Bottom section (append-only log):** Status changes, session references, historical notes — never edited, only appended

The only things that get edited in place:
- Linear issue top section (summary is current state, kept readable)
- Glossary definitions (definitions should be correct, not versioned — but material changes require a Journal entry created *before* the edit; see Glossary rules)

---

### Change Log Rule

**Every versioned document must have a Change Log at the bottom.**

Format:
```
## Change Log

| Version | Date | What Changed | Why |
|---------|------|--------------|-----|
| v8 | 2026-02-05 | [changes] | [reasons] |
| v7 | 2026-02-05 | [changes] | [reasons] |
```

This applies to:
- Product Strategy (changelog at bottom of the page)
- Any document that uses version numbers
- Any spec that gets updated after initial creation

This does **not** apply to:
- Journal entries (append-only, no versions)
- Individual Decision entries (superseded, not versioned)

---

### Authority Thresholds

Authority is **impact-based**, not count-based.

| Action | Authority |
|--------|-----------|
| Create Journal entry | Any actor (automatic) |
| Create feature-scope Decision (high/medium confidence) | Claude can auto-create (must include authority note + detection signal in Rationale) |
| Create feature-scope Decision (low confidence) | Requires __FILL:human_authority__ confirmation |
| Create global-scope Decision | Always requires __FILL:human_authority__ confirmation |
| Supersede any Decision | Always requires __FILL:human_authority__ confirmation |
| Update Product Strategy | Always requires __FILL:human_authority__ confirmation |
| Cancel a Deferred item | Requires __FILL:human_authority__ confirmation |
| Create Linear issue | Claude can auto-create |
| Cancel Linear issue | Requires __FILL:human_authority__ confirmation |
| Close issues across multiple features in one session | Notification to __FILL:human_authority__ (not a hard gate — heads-up only) |
| Push to GitHub `main` branch | Requires __FILL:human_authority__ confirmation |
| Push to GitHub feature branch | Claude Code can auto-push |
| Grant/revoke Standing Delegation | __FILL:human_authority__ only |

**Removed:** The old "3+ status changes requires confirmation" rule. Routine status updates within a single feature don't need approval regardless of count. Cross-feature batch closures get a notification, not a gate.

### Standing Delegations

__FILL:human_authority__ can issue time-boxed or scope-boxed delegations that temporarily lower the confirmation threshold for specific categories.

**Format:** "Standing delegation: Claude may [action] for [scope] until [date/condition]."

**Rules:**
- Standing delegations are logged as Decisions with `scope: temporary` and an expiry date
- When a standing delegation expires or is revoked, it is superseded (not deleted)
- Claude must check for active standing delegations before requesting confirmation for a gated action
- A Journal entry is required when a standing delegation is granted or revoked
- When Claude acts under a standing delegation, the authority note in the Decision or Journal entry must reference the delegation by its Decision ID (e.g., "Acted under standing delegation DEC-20260205-P-f3k2")

**Scope limits:** Standing delegations **cannot** override the following gates, regardless of scope or duration:
- Global-scope decision creation (always requires __FILL:human_authority__)
- Decision supersession (always requires __FILL:human_authority__ via Contradiction Protocol)
- Product Strategy updates (always requires __FILL:human_authority__)

These gates exist to protect system integrity. If they could be delegated away, the single-authority constraint (see System Constraints) would be undermined.

**Proactive delegation guidance:** To prevent __FILL:human_authority__ from becoming a bottleneck, __FILL:human_authority__ should proactively issue standing delegations for predictable safe zones. Examples of good delegation candidates:
- CSS-only and UI styling changes (no structural changes)
- Dependency updates within semver minor/patch
- Fix-branch pushes to main
- One-liner copy changes

If Claude frequently requests confirmation for the same category of low-risk action, that's a signal that a standing delegation should exist.

**Example:** "Standing delegation: Claude Code may push to main for fix/ branches until 2026-02-15."

---

### Override Triggers

Three optional phrases that override auto-detection when you want precision:

| Phrase | Effect |
|--------|--------|
| **"Log decision:"** | Forces a Decision entry even if Claude wouldn't auto-create one |
| **"Defer:"** | Forces a Deferred entry |
| **"Strategy change:"** | Triggers Product Strategy append (always needs confirmation) |

These are shortcuts, not requirements. Normal conversation still triggers the right behavior via the Decision Detection Heuristic.

---

## AI Adherence

AI adherence is the biggest technical risk in this system. Claude will sometimes misjudge decision detection, miss authority thresholds, accidentally summarize instead of quoting, or forget to update CLAUDE.md during contradictions. This section defines mitigations.

### Post-Session Self-Audit

At the end of every Full session (before writing the handoff file), Claude must answer these questions in the session summary:

1. **Decisions created this session:** List each by ID, with the detection signal that triggered creation.
2. **Authority threshold actions:** List any actions where confirmation was required. Were they confirmed?
3. **Contradictions detected:** Were any found? If yes, was the Contradiction Protocol followed?
4. **CLAUDE.md changes:** Were any Active Decisions or Standing Delegations changed? If yes, was CLAUDE.md updated?
5. **Glossary terms introduced:** Were any new terms used? If yes, were they registered in the Glossary?

This self-audit is included in the handoff file. It's not a guarantee of correctness — it's a structured prompt that makes errors visible to __FILL:human_authority__ during review.

### Periodic Drills

During the first 4 weeks (system stabilization period), run periodic "why did you do X?" drills:
- Pick a random auto-created Decision and ask Claude to explain why it was created
- Pick a random Journal entry and verify it links to the correct Feature Registry entry
- Pick a random session and verify the handoff file matches the Journal entry

These drills are training data collection, not production audits. They calibrate expectations about AI accuracy and surface systematic failure patterns.

### Early Weeks as Training Data

Treat weeks 1–4 as the calibration period. During this time:
- Review all auto-created Decisions (not just the unreviewed ones)
- Track false positive rate (decisions that shouldn't have been created)
- Track false negative rate (decisions that should have been created but weren't)
- Adjust the Decision Detection Heuristic based on observed patterns

After week 4, shift to the standard review cadence (weekly batch review of `Reviewed: unchecked` items).

---

## Degraded Mode

When external tools (Notion, Linear) are unavailable, work continues with local-first logging.

### Detection

At session start, the connectivity check identifies which tools are available. **When entering Degraded Mode, the first line of the handoff file (after the intent) must document which tools failed and how** (error message, timeout, or specific failure). This creates an audit trail of system state, not just work done.

If a tool fails:

| Tool Down | Impact | Degraded Behavior |
|-----------|--------|-------------------|
| **Notion** | Can't read/write Journal, Decisions, Feature Registry | Use handoff files as primary log. Prefix entries with `[BACKFILL]`. Resume Notion logging when connectivity returns. Create a Journal entry documenting the outage when connectivity returns. |
| **Linear** | Can't read/update issues | Track status changes in handoff file. Backfill Linear when connectivity returns. |
| **Both** | No external project management | Full local mode: handoff files carry everything. Session can proceed if task is clear. |
| **Git** | Can't push/pull | **Stop.** Git is non-negotiable for code sessions. Fix before proceeding. |

### Backfill Process

When connectivity returns:
1. **Deduplication check:** Before creating a backfill entry in Notion/Linear, check if a matching entry already exists (same date, same actor, same description summary). If a match exists, mark the handoff entry as `[BACKFILLED — ALREADY EXISTS]` and skip creation. This guards against intermittent connectivity creating duplicates.
2. **Contradiction check during backfill:** If a handoff entry contains a Decision, check whether a conflicting Decision was created in Notion by a different actor during the degraded period. **Also check other actors' handoff files:** Before backfilling a Decision, search `handoff/*/from-code/` and `handoff/*/from-chat/` for any decisions on the same feature from the last 24 hours. If a conflict exists in either Notion or another actor's handoff files, do not backfill — instead, trigger the Contradiction Protocol with both decisions presented to __FILL:human_authority__. This prevents two actors from silently creating contradictory decisions during an outage.
3. Read all remaining `[BACKFILL]`-prefixed entries from handoff files
4. Create corresponding Notion/Linear entries
5. Mark handoff entries as backfilled (append `[BACKFILLED YYYY-MM-DD]`)
6. Don't delete the original handoff files — they're the source of truth for the degraded period
7. Create a Journal entry of type `session` documenting the backfill completion (what was backfilled, any conflicts found)

---

## Linear Integration

### Issue Format (Split Description)

```
Title: [TYPE] Description

Description:

  ## Summary (editable — keep current)
  Source: [link to Journal entry, Chat, or Spec]
  Context: [why this exists]
  
  Acceptance Criteria:
  - [ ] Criterion 1
  - [ ] Criterion 2

  ---

  ## Log (append-only — never edit above this line)
  | Date | Status | Note |
  |------|--------|------|
  | 2026-02-05 | Created | From chat session about token editor |
```

**Key change from v4:** The description is split into an editable top section (Summary) and an append-only bottom section (Log). The Summary stays readable; the Log preserves history. The `---` separator and `## Log` heading mark the boundary.

### Status Sync

Status is derived from Linear — the Feature Registry does not independently track it (see Feature Registry manual override rule for the exception).

| Linear Status | Derived Meaning | When |
|---------------|----------------|------|
| Backlog | `planned` | Issue created |
| Todo | `planned` | Prioritized |
| In Progress | `in-progress` | Work started |
| Done | `shipped` | Work complete |
| Cancelled | `cancelled` | No longer relevant |

**Rule:** Every Linear status change appends a row to the issue's Log section. Claude Code does this automatically.

### Linear ↓ Notion Naming

| Linear Field | Notion Equivalent | Must Match |
|-------------|-------------------|------------|
| Issue title prefix `[TYPE]` | — | Linear only |
| Feature name in title | Feature Registry `Feature Name` | Exact match |
| Project name | Feature Registry `Feature Name` | Exact match |
| Labels | — | Use Glossary terms |

---

## Pre-Build Connectivity Checklist

**Before any project work begins, verify connections are live.** Quick sessions may skip Notion/Linear checks if the task doesn't touch them.

### Claude Chat Connectivity

| Connection | How to Verify | Required For |
|------------|---------------|--------------|
| **Notion** | Search for Project Home page — success = page content returned | Reading specs, writing Journal/Decisions |
| **Linear** | List team issues (limit 1) — success = at least one issue returned | Creating/updating issues |
| **GitHub** | Project knowledge contains repo files, or web fetch a known file | Reading current codebase state |

### Claude Code Connectivity

| Connection | How to Verify | Required For |
|------------|---------------|--------------|
| **GitHub repo** | `git status` succeeds | All implementation work |
| **Notion** | Read Project Home page via MCP — success = page content returned | Reading specs, logging sessions |
| **Linear** | List team issues via MCP (limit 1) — success = at least one issue returned | Issue management |
| **Handoff folder** | `/handoff/` structure exists | Chat ↓ Code communication |

### Verification Script (Claude Code)

Run at the start of every Full session (Quick sessions: Git + handoff only):

```bash
# 1. Git status
git status

# 2. Check handoff folders exist
ls -la handoff/

# 3. Notion: read Project Home page via MCP
#    Tool: notion_fetch with Project Home URL
#    → Success: page content returned
#    → Failure: enter Degraded Mode for Notion

# 4. Linear: list team issues (limit 1) via MCP
#    Tool: linear_list_issues with team name, limit 1
#    → Success: at least one issue returned
#    → Failure: enter Degraded Mode for Linear
```

**Note:** Steps 3–4 use MCP tool calls, not bash commands. The CLAUDE.md template must include the actual Notion page URL and Linear team name so Claude Code can run concrete checks without improvising. See CLAUDE.md Template for the required fields.

**If a connection fails:** Enter Degraded Mode for that tool. Log the failure in the handoff file (which tool, what error). Git failure = full stop.

---

## Compliance Tiers

Process requirements are tiered to prevent compliance fatigue.

### Mandatory (every session, non-negotiable)

1. Session intent declared
2. Handoff file written (local, always works)
3. Linear status updated (if issues were touched)
4. Journal entry content created (even one line in Quick sessions — Notion entry or handoff file with `[BACKFILL]` prefix)

**Handoff-First Logging Rule:** When a session produces 3 or more decisions, the handoff file is the primary record of what happened. Notion/Linear entries may be backfilled within 24 hours, but the handoff file must be written before session end. If backfill doesn't happen within 24 hours, the handoff file becomes the canonical record and Notion entries are optional.

### Extended (required for Full sessions)

5. Current State Summary staleness check (regenerate if stale — before other work)
6. Decisions logged with confidence, scope, and authority note + detection signal (if auto-created)
7. Feature Registry reviewed/updated
8. Contradiction check (if decisions were made)
9. Notion backfill from handoff (if in degraded mode)
10. Post-Session Self-Audit completed (see AI Adherence section)

### Maintenance (weekly during first 4 weeks, then monthly)

11. Glossary audit — promote `proposed` → `accepted`, flag conflicts, check for unregistered terms
12. Current State Summary regenerated from Strategy page (also triggered automatically when Strategy is appended)
13. Integrity check (see below)
14. Handoff folder cleanup — archive shipped features
15. Active Decisions list in CLAUDE.md verified (primary refresh happens at session end; maintenance is catch-up only)
16. Review all `Reviewed: unchecked` Decisions (flag any older than 7 days)
17. Weekly delta summary (see Journal Consumption)

**Weekly delta summary trigger:** If more than 7 days have elapsed since the last delta summary, the next Full session must generate one before other work begins. This is a Maintenance requirement that becomes Extended-priority when overdue.

---

## Integrity Checks

Run weekly during the first 4 weeks (system stabilization), then monthly or when something feels off.

### Day 1 Audit Script

The following automatable checks should be implemented as a script (`scripts/audit-workflow.ts` or equivalent) on **Day 1 of migration**, not deferred to a later phase. This is low effort and high value — it catches drift before it compounds.

**Automatable checks (script):**
1. **Orphan check (Linear → Feature Registry):** Find any Linear issue whose feature name doesn't match a Feature Registry entry
2. **Orphan check (Feature Registry → Linear):** Find any Feature Registry entry with no corresponding Linear issues
3. **Orphan check (Decisions → Feature Registry):** Find any Decision without a "Related Feature" relation
4. **Decision review check:** Find any Decision with `Reviewed: unchecked` older than 7 days
5. **Journal reference check:** Verify Journal entries reference valid Decision IDs
6. **Journal immutability check:** Compare each Journal entry's `Last Edited` timestamp against its `Created` timestamp. Flag any entry where the two differ by more than 5 minutes (allowing for initial save delays). This catches accidental edits to what should be append-only entries.
7. **CLAUDE.md sync check:** Verify Active Decisions in CLAUDE.md match actual active Decisions in Notion. If mismatch detected, auto-generate a corrected Active Decisions list and include it in the audit output for Claude Code to commit. (This is a feature-branch commit, not a main push — __FILL:human_authority__ reviews the diff.)
8. **Handoff staleness check:** `find ./handoff -type f -mtime +14` (no unprocessed files older than 2 weeks)
9. **Glossary staleness check:** Find any `proposed` terms older than 30 days without review
10. **Glossary coverage check:** Extract unique feature/screen/concept names from Journal entries and Decision entries created in the last 7 days. Flag any that don't appear in the Glossary (as Term or Alias). This will produce false positives — treat the output as a review list, not an error list.
11. **Current State Summary staleness check:** Verify Current State Summary `Last regenerated` date is less than 30 days old
12. **Feature Registry status derivation:** For each Feature Registry entry without a manual override, query its Linear issues and verify the derived status matches. Flag mismatches.
13. **Standing delegation expiry check:** Find any standing delegations with passed expiry dates
14. **Split-brain detection:** For any feature with a manual override (`paused`/`cancelled`), check if Linear has contradictory active issues
15. **Backfill duplicate check:** Find any Decisions with the same date and actor code whose Decision text is substantially similar (same first 50 characters). Flag for manual review.

**Audit script output format:** The script produces a single structured report with three sections:

```
# Workflow Integrity Check — YYYY-MM-DD

## ❌ Critical (stop feature work — same session)
[List critical findings per Audit Severity Classification]

## ❌ High (action required — within 24 hours)
[List high-severity findings]

## ⚠️ Medium (review recommended — within 7 days)
[List medium-severity findings]

## ⚠️ Low (next maintenance cycle)
[List low-severity findings]

## ✅ Passed
[List each passed check]

## Auto-fixes applied
[List any automatic corrections, e.g., CLAUDE.md sync diff]
```

This report is saved to `handoff/_general/from-code/YYYY-MM-DD-integrity-check.md` and a Journal entry of type `session` is created linking to it. The consistent format enables comparison across runs.

**Requires-judgment checks (human review):**
- Deferred items: review any with `planned phase` that has passed
- Standing delegations: review whether expired delegations should be renewed or formally revoked
- AI adherence: review post-session self-audit outputs from recent sessions

**Notification hook (optional but recommended):** If a notification system is available (Slack, Discord, email), the audit script should send a notification when: (a) any Decision has been `Reviewed: unchecked` for more than 48 hours, or (b) any integrity check produces a Failure. This prevents "out of sight, out of mind" drift during busy periods. Implementation is environment-specific — the script should have a pluggable notification interface, not a hardcoded integration.

### Audit Severity Classification

All audit findings are classified by severity to enable triage and prevent backlog paralysis.

| Severity | Examples | SLA |
|----------|----------|-----|
| **Critical** | Active contradiction unresolved, data integrity failure, authority threshold bypassed | Same session — stop feature work until resolved |
| **High** | Orphan decisions, stale reviews (>7 days unchecked), missing handoff files | Within 24 hours |
| **Medium** | Glossary drift, Current State Summary stale, unprocessed Journal entries | Within 7 days |
| **Low** | Minor staleness, cosmetic mismatches, expired standing delegations | Next maintenance cycle |

**Accumulation rule:** If **Critical + High** findings exceed 5 total, pause all feature work until the backlog is cleared. This prevents audit debt from compounding while new work creates more issues.

**Severity assignment:** The audit script should classify each finding. When classification is ambiguous, default to the higher severity.

---

## Journal Consumption

The Journal will grow fast. These Notion views should be created on Day 1 to keep it useful for human consumption:

**Default views:**
- **Recent Highlights** — filtered to `decision-context` + `course-correction` + `risk` types, sorted by date descending. This is the "what matters" view.
- **By Feature** — grouped by Related Feature relation. Use when working on a specific feature.
- **Needs Review** — filtered to `Reviewed: unchecked`, sorted by date descending. __FILL:human_authority__'s triage view.
- **Action Required** — filtered to `Action Required: yes` + `Reviewed: unchecked`. The "what needs __FILL:human_authority__'s attention" view.
- **Full Log** — unfiltered, sorted by date descending. The complete record.

Quick session entries (one-liners) will naturally stay low-noise. Full session entries carry the detail. The `Type` field is the primary filtering mechanism across all views.

### Weekly Delta Summary

To prevent review fatigue and signal burial, generate a weekly summary during periodic maintenance:

**Format:** A single Journal entry of type `session` titled `YYYY-MM-DD Weekly delta summary` containing:
- Decisions created this week (count + list of IDs with one-line summaries)
- Decisions still unreviewed
- Risks identified
- Features that changed status
- Deferred items reactivated or cancelled
- Any integrity check warnings

**Verification note:** This summary is generated by Claude Chat and is not independently verified. It is a convenience artifact, not an audited report. __FILL:human_authority__ should spot-check it against the Action Required view periodically — if the summary says "3 decisions created" but the view shows 5, the summary generation needs debugging.

This summary is __FILL:human_authority__'s "catch-up" artifact. If __FILL:human_authority__ has been away or busy, reading the delta summary is faster than scanning the full Journal. Claude Chat generates this during periodic maintenance sessions.

---

## Worked Examples

These examples show what actual Quick and Full sessions look like end-to-end. They are reference material for onboarding and calibration — not templates to copy literally.

### Example: Quick Session

```
--- Handoff File: handoff/token-editor/from-code/2026-02-10-fix-contrast.md ---

Intent: Fix contrast issue on TokenEditor submit button (LIN-042)
Session: 20260210-X-0915

Connectivity: Git ✓ | Handoff ✓ | Notion ✓ | Linear ✓
Read handoff/from-chat/: no pending items for token-editor

Work done:
- Changed submit button background from #E0E0E0 to #1A73E8 (meets AA contrast)
- Updated hover state to #1557B0
- Verified against _ui/tokens.yaml color palette

Linear: LIN-042 status → Done, Log row appended
Journal: "2026-02-10 Fixed submit button contrast on TokenEditor, LIN-042 done"
  Type: session | Actor: claude-code | Action Required: no
```

Total overhead: ~2 minutes. One handoff file, one Linear update, one Journal line.

### Example: Full Session

```
--- Handoff File: handoff/time-tracking/from-code/2026-02-10-mvp-implementation.md ---

Intent: Implement time-tracking MVP per spec in handoff/time-tracking/from-chat/2026-02-08-spec.md
Session: 20260210-X-1030

Connectivity: Git ✓ | Handoff ✓ | Notion ✓ | Linear ✓
Current State Summary: not stale (regenerated 2026-02-08)
Read last 5 relevant Journal entries: 
  - 2026-02-08 Time tracking design session (decision-context)
  - 2026-02-09 Time tracking data model review (brainstorm)
  - 2026-02-09 Weekly delta summary (session)
Active Decisions loaded: DEC-20260208-C-a8f2 (inline timer UI), 
  DEC-20260208-C-k3m9 (store durations in seconds)
Read handoff/from-chat/: 2026-02-08-spec.md (time tracking MVP spec)

Work done:
- Created TimeTracker component (workspace archetype)
- Implemented start/stop/pause timer with seconds-precision storage
- Added TimeEntryList sub-component
- Created 3 Linear issues for follow-up: LIN-058 (export), LIN-059 (bulk edit), LIN-060 (reporting view)
- Deferred: manual time entry (DEF-20260210-X-r4w2) — spec says auto-only for MVP

Post-Session Self-Audit:
1. Decisions created: DEF-20260210-X-r4w2 (deferred manual entry). 
   Detection signal: spec explicitly says "auto-capture only for MVP."
2. Authority actions: Created 3 Linear issues (auto-create allowed). 
   No confirmation-required actions taken.
3. Contradictions: None detected.
4. CLAUDE.md: No changes needed.
5. Glossary terms: "time-entry" used — verified already in Glossary as accepted.

Linear: LIN-055 status → Done, Log row appended. LIN-058/059/060 created.
Journal: Full entry created — type: session, Action Required: no
Feature Registry: time-tracking status derived as in-progress (LIN-058/059/060 still open)
```

---

## CLAUDE.md Template

This goes in the root of every project's repo. Claude Code reads it at session start. **Bootstrap Mode fills in the placeholders automatically during Step 3.**

**This is a condensed operational checklist.** The canonical protocol definitions live in `.claude/PROTOCOL.md`. When in doubt, PROTOCOL.md is authoritative.

```markdown
## Workflow Protocol

### Session Start
1. Declare session intent (one sentence: what is this session for?)
2. Determine mode:
   - **Quick:** Bug fix, config change, single small component (<2 hours, no design decisions)
   - **Full:** New feature, design exploration, multi-component work, anything requiring decisions
3. Escalation triggers: second feature touched, design decision emerges, >2hr estimate, contradiction detected.
See .claude/PROTOCOL.md for full criteria and protocol definitions.

### Notion Access (REQUIRED)
- Project Home: [URL]
- Product Strategy — Current State Summary: [URL]
- Product Strategy — Full History: [URL]
- Feature Registry: [DB URL]
- Journal DB: [DB ID]
- Decisions DB: [DB ID]
- Deferred DB: [DB ID]
- Glossary: [URL]

### Linear Access (REQUIRED)
- Team: [name]

### GitHub Access (REQUIRED)
- Repo: [org/repo-name]
- Main branch: main
- Feature branch pattern: type/kebab-description

### Active Decisions (top 10–20)
[Maintain a short list of the most important active decisions here.]

**Refresh triggers:**
- At session end if decisions were created
- Immediately when Contradiction Protocol supersedes a listed decision
- During periodic integrity checks (catch-up only)

**How to refresh:** Query the Decisions database for `Status: active`, sorted by date descending. Replace this list with the top 10-20 most relevant (global decisions always, plus feature-relevant). If in degraded mode, append decisions from this session's handoff file with `[PENDING SYNC]` marker until backfill completes.

**For new projects:** If no decisions exist yet, leave this section as "[No decisions yet]".

- DEC-YYYYMMDD-A-XXXX: [one-line summary]
- DEC-YYYYMMDD-A-XXXX: [one-line summary]
- ...

### Standing Delegations (if any)
[List active standing delegations. Remove when expired/revoked.]

- [delegation description] — expires [date] — DEC-YYYYMMDD-A-XXXX
- ...

### Quick Session Checklist
1. Declare session intent
2. Connectivity check (Git + handoff; Notion/Linear if needed). Log failures.
3. Read handoff/from-chat/ for pending items (if empty, proceed)
4. Check relevant Linear issue(s) (if none exist, proceed)
5. If session touches UI: Read `DESIGN_ROUTER.yaml` → load referenced design files for affected surface types
6. Do the work
7. Write handoff file to `handoff/<feature>/from-code/` (create folder if new feature) or `handoff/_general/from-code/` for cross-cutting work. Even one-liner, starts with Intent:
8. Update Linear issue if one exists, or create issue if task needs tracking. Create Journal entry (even one line)

### Full Session Checklist
1. Declare session intent
2. Run full Pre-Build Connectivity Checklist. Log failures.
3. Read Project Home → current focus (if empty, note "focus not yet defined")
4. Read Product Strategy — Current State Summary (if empty/not created, note "strategy pending"; if stale, regenerate first)
5. Read last 5 relevant Journal entries filtered by feature, Action Required, type (if none exist, skip — expected for new projects)
6. Read active Decisions — global always, feature-scope when relevant (if none exist, note "first session — no prior decisions")
7. Read handoff/from-chat/ for pending specs or feedback (if empty, proceed)
8. Check Linear priorities (if no issues exist, proceed)
9. If session touches UI: Read `DESIGN_ROUTER.yaml` → load referenced design files for affected surface types
10. Do the work
11. Create Journal entry (full format)
12. Update Linear statuses + append Log rows (if issues exist); create issue if task needs tracking
13. Create Linear issues for follow-up items
14. Log decisions made (respect authority thresholds; include authority note + detection signal)
15. Save session summary to `handoff/<feature>/from-code/` (create folder if new feature) or `handoff/_general/from-code/`
16. Update Feature Registry if changed; create entry if building a new feature
17. Contradiction check if decisions were made (including CLAUDE.md update)
18. Post-Session Self-Audit (decisions + signals, authority actions, contradictions, CLAUDE.md, glossary terms)

### Workflow Invariants (Non-Negotiable)
- NEVER edit Journal entries, Decision content, or Deferred content
- NEVER delete anything in Notion or Linear
- Corrections → new Journal entry, type = course-correction
- Strategy updates → append new section + add changelog row + Journal link
- Global decisions → ALWAYS get confirmation
- Supersessions → ALWAYS use Contradiction Protocol (including CLAUDE.md update)
- Use Naming Convention for all new entries (see Glossary)
- Auto-created Decisions → ALWAYS include authority note + detection signal in Rationale
- Glossary material changes → ALWAYS create Journal entry BEFORE editing the definition
- Standing delegations → CANNOT override global-scope, supersession, or strategy gates
- Standing delegation references → ALWAYS include delegation Decision ID in authority note
- Uncertain decision detection → Journal entry (decision-context), NEVER auto-create Decision

**Conflict duty:** If the human's request would contradict an active Decision, violate a law in laws.yaml, or skip a Mandatory tier requirement, state the conflict before proceeding. Do not silently comply. Quote the specific Decision, law, or requirement being violated and ask the human to confirm, supersede, or revise.

**Quality gate duty:** Before building or modifying any UI component, read `_rules/laws.yaml` and apply the critique loop defined in `.claude/WORKFLOW.md`. No component is considered complete without scoring ≥ 3 on all five visual quality dimensions (Hierarchy, Rhythm, Density, Consistency, Craft). If a score falls below 3, redesign before proceeding. Read `config/manifest.yaml` for the product's voice and personality — the UI must reflect it.

### Linear Format
- Title: [TYPE] Description
- Description: Split format — editable Summary on top, append-only Log below the separator
- Every status change: append Log row

### Degraded Mode
If Notion/Linear unavailable: work continues, log to handoff files with [BACKFILL] prefix.
Log which tools failed and why in the handoff file.
If Git unavailable: STOP. Fix before proceeding.
Backfill: check for duplicates AND contradictions with entries created during degraded period before syncing.

### Post-Session Self-Audit (Full sessions only)
Before writing handoff file, answer:
1. Decisions created this session — list IDs + detection signals
2. Authority threshold actions — were confirmations obtained?
3. Contradictions — detected? Protocol followed?
4. CLAUDE.md — updated if needed?
5. Glossary terms — any new terms introduced? Registered?
```

---

## What Gets Logged Where

| Event | Journal | Decisions | Deferred | Linear | Feature Registry | Product Strategy |
|-------|---------|-----------|----------|--------|------------------|------------------|
| Brainstorming session | ✅ `brainstorm` | — | — | — | — | — |
| Design decision made | ✅ `decision-context` | ✅ | — | — | — | — |
| Feature postponed | ✅ | — | ✅ | — | — | — |
| Feature cancelled | ✅ | — | ✅ `cancelled` | ✅ Cancelled | (derived) | — |
| Bug found | ✅ `session` | — | — | ✅ `[FIX]` | — | — |
| Strategy shift | ✅ `decision-context` | ✅ (if structural) | — | — | — | ✅ append |
| Implementation session | ✅ `session` | if decisions made | if things deferred | ✅ status updates | (derived) | — |
| Course correction | ✅ `course-correction` | ✅ supersede if needed | — | ✅ if issue affected | — | — |
| Risk identified | ✅ `risk` | `low` confidence if decision-shaped | — | ✅ if actionable | — | — |
| Decision contradicted | ✅ | ✅ old superseded + new created | — | ✅ if affected | — | — |
| Glossary definition changed | ✅ `course-correction` (created BEFORE edit) | — | — | — | — | — |
| Integrity check completed | ✅ `session` | — | — | — | — | — |
| CLAUDE.md Active Decisions updated | ✅ `session` | — | — | — | — | — |
| Standing delegation granted/revoked | ✅ `decision-context` | ✅ `temporary` | — | — | — | — |
| Handoff folder archived | ✅ `session` | — | — | — | — | — |
| Feature Registry manual override set | ✅ | — | — | — | ✅ manual status | — |
| Action taken under standing delegation | ✅ (with delegation Decision ID) | ✅ (with delegation Decision ID) | — | ✅ if applicable | — | — |
| Backfill completed from degraded mode | ✅ `session` | — | — | — | — | — |
| Weekly delta summary generated | ✅ `session` | — | — | — | — | — |
| Degraded mode entered | ✅ `session` (when connectivity returns) | — | — | — | — | — |

---

## Planned for Later Phases (Not Day 1)

| Capability | What It Does | Why Later |
|-----------|-------------|-----------|
| Derived State Views | Auto-generated dashboards showing decision coverage, assumption density, feature progress | Needs data volume first |
| Failure-Mode Drills | Scheduled tests: "What breaks if Claude Code ignores X?" | Needs stable workflow first |

**Removed from this list:** "Automated Integrity Checks" — moved to Day 1 migration (see Integrity Checks section). The audit script is low effort and high value; deferring it was a mistake.

---

## Bootstrap Mode

Bootstrap Mode replaces a passive migration checklist with an interactive, Claude Code-driven setup process. **Claude Code is the driver.** The human copies files, answers questions, and follows instructions.

### Trigger

The human copies the starter kit files into their project repo (which is already a git repo) and tells Claude Code to initialize. The command can be natural language: "initialize project", "bootstrap", "set up this project", or similar.

Claude Code checks for a `.claude/PROJECT_INITIALIZED` marker file. If absent, Bootstrap Mode activates. **Normal Quick/Full sessions are blocked until bootstrap completes.**

### Step 1 — Product Identity

*Claude Code prompts, human answers.*

Claude Code asks the human plain-language questions about the product. The human answers conversationally. Claude Code writes the structured config files.

Questions:
- "What are we building? What does it do?"
- "What product class?" (with options from manifest.yaml: workflow_app, data_platform, creative_tool, etc.)
- "What tech stack?" (framework, persistence, auth, etc.)

If the human delegates ("you decide", "pick something reasonable"), the **Bootstrap Delegation Rule** applies (see below).

Claude Code writes: `config/manifest.yaml`, `config/tech-foundation.yaml`

### Step 2 — External Tool Setup

*Claude Code instructs, human executes.*

Claude Code presents required infrastructure as a checklist and asks the human to confirm each item. Claude Code does NOT proceed until all hard-gate items are confirmed.

Claude Code says something like:

> "Before I can set up the repo, I need you to create some things I don't have access to create myself. Here's what I need:
>
> **PROJECT MANAGEMENT (default: Notion):**
> ☐ Have you created a workspace/page for this project?
> ☐ Have you set up the workflow databases? (Journal, Decisions, Deferred, Feature Registry, Glossary, Product Strategy page, Current State Summary page — all per the database specs in this protocol)
> ☐ Can you give me the URLs/IDs for each database?
>
> **ISSUE TRACKER (default: Linear):**
> ☐ Have you created a team for this project?
> ☐ What is the team name?
>
> **PRODUCT CONTEXT:**
> ☐ Do you have a product description or brief I should read? (Upload a file or paste it — I'll use this to seed the Product Strategy and Feature Registry.)
>
> Let me know when each is done, or if you need help with any of these."

The human works through these — potentially across multiple messages. They might say "Notion is done, here are the URLs" and Claude Code acknowledges and asks about the next item. Or they might open a Claude Chat session to create the databases and come back.

**Hard gates** (Claude Code refuses to proceed):
- Project management databases with correct fields + URLs provided
- Issue tracker team/project created + name provided
- Git repo initialized (already true since human copied files in)

**Soft gates** (Claude Code warns but can proceed):
- Filtered views not yet created (UI-only, can't be automated — Claude Code lists them as a to-do for later)
- Product description not provided (Claude Code can proceed but will skip Product Strategy seeding)
- Standing delegations not yet issued (first Full session topic)

### Step 3 — Repo Initialization

*Claude Code executes.*

Once the human has confirmed all hard gates, Claude Code says "I have everything I need. Setting up the repo now." and:

- Creates `/handoff/_general/from-chat/` and `/handoff/_general/from-code/`
- Creates `CLAUDE.md` from this protocol's CLAUDE.md Template section, filling in the actual URLs/IDs/team names from Step 2
- Creates `scripts/audit-workflow.ts` (or equivalent) with all 15 integrity checks
- If a product description was provided, drafts an initial Product Strategy section and seeds the Feature Registry (written to handoff file for Claude Chat to create in the project management tool)
- Creates `.claude/PROJECT_INITIALIZED` marker file
- Commits everything to a `bootstrap` branch

### Step 4 — Verification

*Claude Code tests.*

Claude Code says "Running verification now." and:

- Runs the Pre-Build Connectivity Checklist (Git, project management tool, issue tracker, handoff folder)
- Reports results: "✓ Git connected. ✓ Journal database found. ✓ Issue tracker team found. ✓ Handoff folders exist."
- If anything fails, tells the human what to fix
- Once all checks pass: "Bootstrap complete. The project is ready. I recommend starting with a Quick session on a small task to test the full workflow loop."

### Bootstrap Delegation Rule

If the human delegates a decision during bootstrap ("you decide", "pick something reasonable", "whatever you think"), Claude Code must still **state the specific choice before writing it**. The human's delegation authorizes Claude Code to proceed without waiting for explicit confirmation, but **does not authorize silent decisions**.

Example:
> Human: "What tech stack? You decide."
> Claude Code: "For a workflow app, I'd go with React, Next.js, PostgreSQL, and session-based auth. Here's why: [one line each]. Writing this to tech-foundation.yaml now."

All bootstrap decisions are backfilled to the Decisions database once it exists (same mechanism as Degraded Mode backfill). Bootstrap is effectively the first degraded-mode session — the Decision infrastructure doesn't exist yet, so decisions are recorded locally and backfilled when the infrastructure comes online.

### Post-Bootstrap Milestones

After bootstrap completes, the following should happen in the first two weeks:

| When | What |
|------|------|
| Day 1 | Test with a real Quick session (use the Worked Examples as reference) |
| Day 1–2 | Test with a real Full session |
| Day 2 | Write first Product Strategy section + generate initial Current State Summary |
| Day 3 | Issue initial standing delegations for predictable safe zones |
| Day 3–5 | Seed Glossary with existing domain terms (all start as `accepted`) |
| Week 2 | First integrity check (audit script + human review) |
| Week 2 | First weekly delta summary |
| Week 4 | Review AI adherence calibration data (false positive/negative rates on Decisions) |

---

## Success Criteria (After 2 Weeks)

1. **No lost conversations** — every session meeting a Journal trigger condition has a Journal entry
2. **No mystery decisions** — every decision has rationale, confidence, authority note, and detection signal (if auto-created)
3. **No stale strategy** — Current State Summary always reflects current direction; staleness flag works; Full sessions regenerate when stale; summary stays under ~1,500 words
4. **No forgotten deferrals** — nothing silently dropped
5. **No context-free Code sessions** — Claude Code always reads Journal + Decisions + Handoff
6. **No silent overwrites** — Contradiction Protocol enforced, including CLAUDE.md update and backfill contradiction check
7. **No manual status management** — Linear is the source for execution status (with documented manual override exceptions + split-brain detection)
8. **Full traceability** — any artifact traces back to a decision, session, or conversation via Notion relations
9. **No ID collisions** — actor-coded IDs with random suffixes prevent duplicate Decision/Deferred IDs across actors; product IDs (`DEC-YYYYMMDD-A-XXXX`) and system IDs (`DEC-001`) coexist without confusion
10. **Consistent naming** — same term in Notion = Linear = GitHub = conversation; Glossary aliases catch informal terms
11. **No re-litigated discussions** — "Why don't we have X?" always gets an answer with history (Glossary-first search + full-text fallback + handoff file search)
12. **No disconnected sessions** — connectivity check catches issues; degraded mode handles failures gracefully; failures are logged
13. **No compliance fatigue** — Quick sessions have minimal overhead; Full sessions have appropriate overhead
14. **No backfill duplicates** — deduplication + contradiction check + duplicate detection in audit script prevents double entries from intermittent connectivity
15. **No unreviewed auto-decisions** — Reviewed checkbox + 7-day integrity check flag prevents decisions from becoming load-bearing without human validation
16. **No review fatigue** — Action Required field, weekly delta summary (with trigger), and tiered Journal views keep signal above noise
17. **Audit script runs clean** — all automatable integrity checks pass by Week 2
18. **No false-positive Decisions** — the hard stop rule for uncertain detections + calibration period keeps the Decisions database clean
19. **No scope-drifted sessions** — session intent declared at start; escalation triggers catch drift

---

## Mode Integration

This protocol integrates with the starter kit's existing mode system.

**Context loading:** The Full Session Protocol governs *what context to load* at session start. The starter kit's govern mode (`_modes/govern.md`) governs *how to make decisions within that context*. Govern mode's decision flow (check laws → check patterns → check archetype → check preset → decide) still applies during implementation work.

**Explore mode:** When Claude Chat follows `_modes/explore.md`, both the explore flow and the Chat Session Protocol apply simultaneously. Explore mode's exit criteria map to this protocol's Decision format: "Document decision" → create a Decision with Confidence, Scope, Reviewed, and Detection Signal fields. "Lock the recommendation" → `Reviewed: unchecked` (__FILL:human_authority__'s review is the lock). "Document decision in `_decisions/REGISTRY.md`" → only for *system-level* changes; product decisions go to the project management tool's Decisions database only.

**Protected files:** This protocol does not modify or override: `_rules/laws.yaml`, `SYSTEM_CONTRACT.md`, `GOVERNANCE.md`, `_ui/*`, `_quality/*`, `_critique/*`, `_model/*`, `config/*`, `_presets/*`, `_interaction/*`, `_primitives/*`, `_modes/*`.

---

## Change Log

| Version | Date | What Changed | Why |
|---------|------|--------------|-----|
| v1.1.5 | 2026-02-06 | Added quality gate duty to CLAUDE.md template — ensures laws.yaml and critique loop are applied before any UI work | UI quality enforcement |
| v1.1.4 | 2026-02-06 | External feedback additions: Decision re-validation flag in Archival Policy (90-day unreferenced decisions flagged for review); Outcome field added to Decisions database in NOTION.md; Conflict duty instruction added to CLAUDE.md Template (must state conflicts with active Decisions, laws, or Mandatory requirements before complying) | External feedback on decision lifecycle and agent behavior |
| v1.1.3 | 2026-02-06 | CLAUDE.md Template usability fixes: mode guidance clarified (Quick vs Full for "new but small" work); empty-state handling added to Full Session checklist; Linear steps updated to handle fresh projects; handoff folder structure clarified; Feature Registry step updated to include "create if new"; Active Decisions refresh mechanism documented with degraded mode handling | Fresh project simulation revealed template assumes history exists |
| v1.1.2 | 2026-02-06 | Added complete database field specifications to NOTION.md; resolved URL vs ID convention; added Expiry Date field to Decisions (for standing delegations) and Manual Status field to Feature Registry (for split-brain detection) | Bootstrap simulation revealed missing field specs |
| v1.1.1 | 2026-02-06 | Consistency fixes: Mandatory tier Journal wording (allows backfill), CLAUDE.md Template refresh triggers, Quick→Full escalation on checkpoint, Archival reversal safeguard, Full Session context-constrained loading, Audit output severity mapping | Internal contradiction review after v1.1 amendments |
| v1.1 | 2026-02-06 | Stress test amendments: Session Checkpoints (1A), Handoff-First Logging (1B), Immediate Active Decisions Refresh (2A), Cross-Actor Contradiction Check (2B), Pre-Decision Feature Check (2C), Context Budget (3A), Archival Policy (3B), Audit Severity Classification (3C) | Fixes for time pressure, parallel actors, and scale issues identified in stress testing |
| v1.0 | 2026-02-06 | Initial PROTOCOL.md — genericized from Unified Workflow System v8 + Bootstrap Mode replacing passive migration plan | DEC-001: Add workflow protocol to starter kit |

**Origin:** This protocol was developed through 8 iterations (v1–v8) of the Unified Workflow System, incorporating internal review (robustness, auditability, automation) and external review (practical viability, bottleneck risk, context window pressure, onboarding). The genericized version preserves all operational content while replacing project-specific references with configurable placeholders.
