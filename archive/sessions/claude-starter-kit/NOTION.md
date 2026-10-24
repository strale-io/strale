# Notion Project Context

> Where to find authoritative project information in Notion.

## Workspace Structure

The Notion workspace is organised into 8 sections under Project Home (`31167c87-082c-81fb-96da-d3188d34aa72`):

| # | Section | Page ID | Contains |
|---|---|---|---|
| 1 | 🏠 Start Here | `33c67c87-082c-81a3-ae03` | Overview + navigation |
| 2 | 🎯 Strategy | `33c67c87-082c-81ea-9e1f` | What Strale is, problem, opportunity, competitive landscape, business model |
| 3 | 🛠️ Products | `33c67c87-082c-8140-bacd` | SQS, Audit Trail, Discovery, Capabilities & solutions, **Feature Registry DB** |
| 4 | ✅ To-do & Build Plan | `33c67c87-082c-81c3-a72b` | **To-do DB**, **Deferred DB** |
| 5 | 📣 Go-to-market | `33c67c87-082c-81a2-b04c` | Distribution surfaces, activation funnel, brand & voice, social media, **Social Media Posts DB** |
| 6 | 🔧 Internals | `33c67c87-082c-81ad-8f95` | Testing system, testing rules, onboarding pipeline, bug fix framework, tech stack |
| 7 | 📓 Journal | `33c67c87-082c-8188-9876` | **Journal DB** |
| 8 | ⚙️ How we work | `33c67c87-082c-8143-8b9b` | Working rules, workspace governance, **Decisions DB**, **Glossary DB** |

Governance rules: see "How we work > How this workspace works" (`33c67c87-082c-81ea-8417`).

---

## Database Field Specifications

These are the exact fields required for the project databases. Field names must match exactly — the audit checks and protocol references depend on them.

**URL vs ID Convention:**
- **Pages**: Full Notion URL or page ID (UUID)
- **Databases**: Database ID only (32-character hex string)

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

---

## Context Loading Order

When starting work on a session, check these Notion sources as needed:

| Need | Where |
|------|-------|
| What Strale is building and why | 🎯 Strategy section |
| Product details (SQS, Audit Trail, Discovery) | 🛠️ Products section |
| Current work items | ✅ To-do & Build Plan |
| Distribution and marketing status | 📣 Go-to-market section |
| Testing, onboarding, infrastructure | 🔧 Internals section |
| Past decisions | Decisions DB (under ⚙️ How we work) |
| Session history and brainstorms | Journal DB (under 📓 Journal) |
| Deferred items | Deferred DB (under ✅ To-do & Build Plan) |
| Domain terminology | Glossary DB (under ⚙️ How we work) |
| Feature catalogue | Feature Registry DB (under 🛠️ Products) |
| Workspace governance rules | How this workspace works (under ⚙️ How we work) |

---

## Updating Notion from Sessions

After significant work, follow these logging rules:

1. **Log the session** in Journal DB (Type = session)
2. **Document decisions** in Decisions DB (DEC-YYYYMMDD-X format, with rationale)
3. **Capture deferred items** in Deferred DB (with Why populated)
4. **Update Feature Registry** if feature status changed
5. **Register new terms** in Glossary if domain terms were introduced
6. **Update section pages** if strategic, product, or operational content changed
