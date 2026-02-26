# Notion Project Context

> Where to find authoritative project information in Notion.

---

## Database Field Specifications

These are the exact fields required when creating project databases during Bootstrap Phase 2. Field names must match exactly — the audit checks and protocol references depend on them.

**URL vs ID Convention:** Throughout this system, use the following format:
- **Pages** (Project Home, Product Strategy, Current State Summary): Full Notion URL (e.g., `https://notion.so/workspace/Page-Name-abc123`)
- **Databases** (Journal, Decisions, Deferred, Feature Registry, Glossary): Database ID only (the 32-character hex string, e.g., `abc123def456...`). Extract from URL: `https://notion.so/workspace/abc123def456?v=xyz` → ID is `abc123def456`

This convention aligns with Notion MCP tool requirements: pages are fetched by URL, databases are queried by ID.

---

### 1. Journal Database

| Field Name | Type | Required? | Options / Target / Default | Notes |
|------------|------|-----------|---------------------------|-------|
| Title | title | Yes | Format: `YYYY-MM-DD [description]` | Notion's default title property |
| Type | select | Yes | `session`, `decision-context`, `course-correction`, `risk`, `brainstorm`, `session-checkpoint` | These are the values referenced in PROTOCOL.md |
| Actor | select | Yes | Configurable during bootstrap (e.g., `petter`, `claude-chat`, `claude-code`) | Actor codes map to these values |
| Source | select | Yes | `chat`, `code`, `manual` | |
| Session | rich_text | Yes | Format: `YYYYMMDD-A-HHMM` | Groups entries from the same session |
| Content | rich_text | Yes | — | What happened, key insights, links |
| Tags | multi_select | No | Feature names, topic labels (user-defined) | |
| Action Required | select | Yes | `yes`, `no` | Default: `no` |
| Reviewed | checkbox | Yes | — | Default: unchecked |
| Related Feature | relation | No | → Feature Registry | Notion relation field |
| Related Decisions | relation | No | → Decisions | Notion relation field |

**Notion system fields used by audit:** `Created` timestamp, `Last Edited` timestamp (for immutability check #6)

---

### 2. Decisions Database

| Field Name | Type | Required? | Options / Target / Default | Notes |
|------------|------|-----------|---------------------------|-------|
| ID | rich_text | Yes | Format: `DEC-YYYYMMDD-A-XXXX` | Human-readable ID (Notion's internal ID is the machine key) |
| Decision | title | Yes | — | What was decided (one sentence) |
| Rationale | rich_text | Yes | — | Why this was chosen; includes authority note + detection signal for auto-created |
| Confidence | select | Yes | `high`, `medium`, `low` | |
| Scope | select | Yes | `global`, `feature`, `temporary` | |
| Status | select | Yes | `active`, `superseded`, `reversed` | Default: `active` |
| Reviewed | checkbox | Yes | — | Default: unchecked |
| Superseded By | relation | No | → Decisions (self-relation) | Link to replacement decision |
| Date | date | Yes | — | When decided |
| Source | url | No | — | Link to Journal entry or conversation |
| Related Feature | relation | No | → Feature Registry | Required for check #3 |
| Expiry Date | date | No | — | For `scope: temporary` decisions (standing delegations) |
| Outcome | rich_text | No | — | Populated retroactively after implementation. Brief note on what happened: "shipped, working well" / "shipped, caused issues" / "superseded before implementation" |

**Note on Expiry Date:** PROTOCOL.md references standing delegations with expiry dates (check #13) but doesn't explicitly list this field. Added here to support the integrity check.

---

### 3. Feature Registry Database

| Field Name | Type | Required? | Options / Target / Default | Notes |
|------------|------|-----------|---------------------------|-------|
| Feature Name | title | Yes | Format: `kebab-case` | Must match Glossary term |
| Description | rich_text | Yes | — | One-paragraph summary |
| Key Screens | rich_text | No | — | List of screens (comma-separated or bulleted) |
| Spec Link | url | No | — | Link to Notion Product Spec |
| Decisions | relation | No | → Decisions | |
| Deferred Items | relation | No | → Deferred | |
| Owner | rich_text | No | — | Who's responsible |
| Manual Status | select | No | `paused`, `cancelled` | Only for manual overrides; leave empty for derived status |

**Note on Manual Status:** PROTOCOL.md says status is derived from Linear, but manual overrides (`paused`, `cancelled`) need storage. This field is only populated when overriding derived status. Check #14 (split-brain detection) depends on this.

**Screen Sub-Entries** (can be inline in Key Screens or separate linked entries):

| Field Name | Type | Required? | Options / Target / Default | Notes |
|------------|------|-----------|---------------------------|-------|
| Screen Name | title | Yes | Format: `PascalCase` | Must match Glossary term |
| Archetype | select | Yes | `workspace`, `detail`, `overview`, `configuration`, `transient` | Maps to starter kit archetypes |
| Spec Link | url | No | — | Link to screen spec |
| Parent Feature | relation | Yes | → Feature Registry | |

---

### 4. Deferred Database

| Field Name | Type | Required? | Options / Target / Default | Notes |
|------------|------|-----------|---------------------------|-------|
| ID | rich_text | Yes | Format: `DEF-YYYYMMDD-A-XXXX` | |
| What | title | Yes | — | What was deferred |
| Why | rich_text | Yes | — | Why it was deferred |
| Planned Phase | rich_text | No | — | When it might be addressed |
| Status | select | Yes | `deferred`, `reactivated`, `cancelled` | Default: `deferred` |
| Source | url | No | — | Link to Journal entry or Decision |
| Date Deferred | date | Yes | — | When deferred |
| Cancelled Reason | rich_text | No | — | Required if status = `cancelled` |
| Related Feature | relation | No | → Feature Registry | |

---

### 5. Glossary Database

| Field Name | Type | Required? | Options / Target / Default | Notes |
|------------|------|-----------|---------------------------|-------|
| Term | title | Yes | — | The canonical name |
| Definition | rich_text | Yes | — | What it means (one sentence) |
| Aliases | rich_text | No | — | Comma-separated alternative names |
| Status | select | Yes | `proposed`, `accepted`, `deprecated` | Default: `proposed` for new terms |
| First Used | date | Yes | — | Date term entered the system |

---

### 6. Product Strategy (Page, not Database)

This is a Notion page, not a database. Structure:

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

## Change Log
| Version | Date | What Changed | Why |
|---------|------|--------------|-----|
```

---

### 7. Current State Summary (Page, not Database)

This is a derived/cached Notion page. Structure:

```
# Current State Summary
*Derived / Cached — not authoritative. See Product Strategy for source of truth.*

**Last regenerated:** YYYY-MM-DD
**Stale:** yes | no

## Current Vision
[One paragraph]

## Active Focus Areas
[Bullet list]

## Key Active Bets
[Bullet list]

## Recent Changes
[Last 2-3 updates summarized]
```

---

### 8. Project Home (Page, not Database)

This is a Notion page serving as the entry point. Should contain:
- Current focus (what's being worked on now)
- Links to all databases (Journal, Decisions, Deferred, Feature Registry, Glossary, Learning Queue)
- Links to Product Strategy and Current State Summary
- Quick reference for team members

---

### 9. Learning Queue

**Purpose:** Cross-project learning capture for the Evolution Protocol. Claude auto-populates this during critique loops, session exits, and decision entries.

**Database ID:** a469f116334f49389d28b0004b60366b
**Data Source ID:** fb486f13-b1d7-4b82-bf99-56301308cef4

| Field | Type | Description |
|-------|------|-------------|
| Learning | Title | Brief description of what was learned |
| Source Project | Select | Which project discovered this |
| Category | Select | law / invariant / pattern / dimension / gate / process / archetype |
| Decision ID | Text | Link to the project's Decision Registry entry |
| Evidence | Rich text | What happened that surfaced this learning |
| Generic Test | Checkbox | Would this help a brand new project? |
| Status | Select | captured / reviewing / approved / rejected / merged |
| Urgency | Select | next-reconciliation / when-convenient / before-next-project |
| Captured Date | Date | When Claude logged it |
| Reviewed Date | Date | When human reviewed it |

**When Claude creates entries:** Automatically, when learning detected via:
- Critique loop exit (Learning Signals section)
- Session exit (Learning Check)
- Decision Registry entry (promote: candidate)

**When to check:** During reconciliation (Claude prompts when threshold reached).

**Rule:** Claude creates entries. Human reviews during reconciliation. Never skip.

---

### Integrity Check Field Cross-Reference

| Check # | Check Name | Database | Fields Used |
|---------|------------|----------|-------------|
| 1 | Orphan (Linear → Feature Registry) | Feature Registry | Feature Name |
| 2 | Orphan (Feature Registry → Linear) | Feature Registry | Feature Name |
| 3 | Orphan (Decisions → Feature Registry) | Decisions | Related Feature |
| 4 | Decision review check | Decisions | Reviewed, Date (or Created) |
| 5 | Journal reference check | Journal | Related Decisions |
| 6 | Journal immutability check | Journal | Created, Last Edited (system fields) |
| 7 | CLAUDE.md sync check | Decisions | Status, ID |
| 8 | Handoff staleness check | — | (file system, not Notion) |
| 9 | Glossary staleness check | Glossary | Status, First Used |
| 10 | Glossary coverage check | Glossary | Term, Aliases |
| 11 | Current State Summary staleness | Current State Summary (page) | Last regenerated (in page content) |
| 12 | Feature Registry status derivation | Feature Registry | Feature Name, Manual Status |
| 13 | Standing delegation expiry | Decisions | Scope (`temporary`), Expiry Date |
| 14 | Split-brain detection | Feature Registry | Manual Status |
| 15 | Backfill duplicate check | Decisions | Date, ID (actor code), Decision |

**Fields Added Beyond PROTOCOL.md Explicit List:**
- Decisions.**Expiry Date** — Implied by standing delegation expiry check (#13) but not explicitly listed in PROTOCOL.md's Decisions field table
- Feature Registry.**Manual Status** — Implied by manual override rule and split-brain detection (#14) but not in the explicit field table

---

### Recommended Notion Views

Create these filtered views on Day 1 (see PROTOCOL.md § Journal Consumption):

**Journal views:**
- **Recent Highlights** — Type in [`decision-context`, `course-correction`, `risk`], sorted by date desc
- **By Feature** — Grouped by Related Feature
- **Needs Review** — Reviewed = unchecked, sorted by date desc
- **Action Required** — Action Required = `yes` AND Reviewed = unchecked
- **Full Log** — Unfiltered, sorted by date desc

**Decisions views:**
- **Active** — Status = `active`
- **Needs Review** — Reviewed = unchecked AND Date > 7 days ago
- **By Feature** — Grouped by Related Feature
- **Standing Delegations** — Scope = `temporary` AND Status = `active`

**Glossary views:**
- **Accepted Terms** — Status = `accepted`
- **Needs Review** — Status = `proposed` AND First Used > 30 days ago

---

**Authority:** Notion databases are the source of truth for project-specific decisions, specs, and context. This starter kit defines *how* to build; Notion defines *what* to build.

---

## Database Structure

Database definitions, required fields, relations, and filtered views are specified in `.claude/PROTOCOL.md` § Document Types.

During Bootstrap Mode (see PROTOCOL.md § Bootstrap Mode), Claude Code will instruct you to create the required databases. Once created, their URLs are recorded in the project's `CLAUDE.md`.

**Do not define database schemas here.** PROTOCOL.md is the single source of truth for workflow database structure. This file governs the *relationship* between Notion and the starter kit.

---

## How Starter Kit and Notion Relate

| Source | Defines | Authority |
|--------|---------|-----------|
| **Starter Kit** | How to build (patterns, primitives, tokens, interactions) | System-wide |
| **Notion Constitution** | What laws govern this specific product | Project-specific, overrides kit defaults |
| **Notion Product Specs** | What to build (features, screens, flows) | Project-specific |
| **Notion Design Library** | What it should look like (inspiration, benchmarks) | Project-specific |
| **Notion Decisions** | What was decided and why | Project-specific |

**Resolution order:**
```
Notion Constitution → Starter Kit Laws → Starter Kit Defaults → Notion Specs
```

---

## Conflict Resolution

When Notion content conflicts with starter kit:

| Source | Governs | Wins On |
|--------|---------|---------|
| Notion Constitution | Project-specific laws | Overrides starter kit defaults |
| Notion Product Specs | What to build | Product decisions, features, screens |
| Starter Kit | How to build | System constraints, patterns, tokens |

**Rule:** System constraints (starter kit) win unless Notion Constitution explicitly overrides them.

---

## Never Merge Notion Prose Into System Files

If Notion says something that conflicts with starter kit values:

| Notion Says | Starter Kit Has | Correct Response |
|-------------|-----------------|------------------|
| "Use purple buttons" | No purple in tokens.yaml | Ask: add purple to tokens, or change Notion? |
| "Make it feel fast" | Performance budgets in tech-foundation | Use existing budgets, don't invent new ones |
| "Simple navigation" | Navigation patterns in grammar.yaml | Apply existing patterns, don't create new ones |

**Do not:**
- Silently derive token values from Notion prose
- Invent new components because Notion described something
- Create parallel patterns to match Notion descriptions

**Instead:**
1. Check if starter kit already has what Notion describes
2. If yes, use the starter kit version
3. If no, ask human whether to extend starter kit or revise Notion

### Why This Matters

Notion is written for humans in natural language. Starter kit is written for Claude in structured formats.

Merging prose into structured files creates drift:
- "Purple-ish" in Notion becomes `#8B5CF6` in tokens — but which purple?
- "Quick" in Notion becomes `100ms` in performance — but is that what they meant?
- "Simple table" in Notion becomes a new component — but we have DataTable already

**Always prefer explicit over derived.**

---

## Context Loading Order

When starting work on a project, follow the loading order in `.claude/PROTOCOL.md` § Compliance Tiers. The tiers specify which databases and files to load based on session type (Quick vs Full).

For a summary of what to check from Notion:

| Need | Where |
|------|-------|
| Laws for this product | Constitution database |
| What to build | Product Specs database |
| Visual references | Design Library database |
| Past decisions | Decisions database |
| Unresolved questions | Deferred database |
| Session history | Journal database |
| Domain terminology | Glossary database |
| Feature status | Feature Registry database |

---

## Searching Notion

When you need project context:

1. **Use Notion search** to find relevant pages
2. **Check the AI Export Section** of specs for machine-readable data
3. **Cross-reference** with starter kit patterns
4. **If conflict**, see Conflict Resolution section above

---

## Updating Notion from Sessions

After significant work, follow the logging rules in `.claude/PROTOCOL.md` § What Gets Logged Where. Key actions:

1. **Log the session** in Journal (every session meeting a trigger condition)
2. **Document decisions** in Decisions database (with rationale, confidence, scope)
3. **Capture deferred items** in Deferred database (things skipped or postponed)
4. **Update Feature Registry** if feature status changed
5. **Register new terms** in Glossary if domain terms were introduced
