# Containment report — hollow framework packages

**Incident**: 2026-04-21T23:31Z, `pydantic/pydantic-ai#4866` closed by maintainer DouweM with the comment *"Shame on you"* after discovering that the published `pydantic-ai-strale` package contained zero pydantic-ai-specific code.

**Exposure is three packages, not one**: `pydantic-ai-strale` (caught), plus `google-adk-strale` and `openai-agents-strale` (same pattern, not yet publicly caught).

**Blast radius is narrow beyond those three**: zero references to the hollow packages in any open or merged distribution PR, any sibling repo, or the public docs site. Other framework packages (langchain-strale, crewai-strale, composio-strale, semantic-kernel-strale, n8n-nodes-strale) are real integrations.

---

## Phase 0 audit (performed 2026-04-22)

### 1. Inventory of framework packages in the monorepo

| Package | Published | Framework imports used | Status |
|---|---|---|---|
| `langchain-strale` | PyPI ✅ | `from langchain_core.tools import ...` in `toolkit.py` + `tools.py` | **REAL** ✅ |
| `crewai-strale` | PyPI ✅ | `from crewai.tools import BaseTool` in `toolkit.py` | **REAL** ✅ |
| `composio-strale` | PyPI ✅ | `@composio.tools.custom_tool` decorator usage (register pattern) | **REAL** ✅ |
| `semantic-kernel-strale` | npm ✅ | `import { kernelFunction } from "semantic-kernel"` in `plugin.ts` | **REAL** ✅ |
| `pydantic-ai-strale` | **PyPI ❌** | **None — `StraleClient` only, no pydantic_ai imports, no AbstractToolset subclass** | **HOLLOW — publicly caught by DouweM** |
| `google-adk-strale` | **PyPI ❌** | **None — `StraleClient` only, no google-adk imports** | **HOLLOW — not yet caught** |
| `openai-agents-strale` | **PyPI ❌** | **None — `StraleClient` + helpers, no openai-agents imports** | **HOLLOW — not yet caught** |
| `n8n-nodes-strale` (separate repo) | npm ✅ | `import { NodeOperationError } from 'n8n-workflow'` | **REAL** ✅ |

### 2. PyPI download counts for the hollow packages

| Package | Last day | Last week | Last month |
|---|---|---|---|
| `pydantic-ai-strale` | 2 | 18 | **163** |
| `google-adk-strale` | 0 | 10 | **160** |
| `openai-agents-strale` | 2 | 8 | **155** |
| (for comparison — real) `langchain-strale` | 2 | 18 | 279 |

~480 downloads of hollow packages in the last month. Every user who ran the README's import example against the published code got `ImportError`. These users are the most likely amplifiers if DouweM's comment spreads.

### 3. Distribution PR audit (zero cross-contamination)

Grep for references to the three hollow packages across every open + merged distribution PR:

| Category | PRs checked | Hits for hollow package names |
|---|---|---|
| Open distribution PRs | 13 | **0** |
| Recently-merged PRs | 8 | **0** |

Each open PR verified honest:
- `crewAIInc/crewAI-examples #358` uses `from crewai_strale import StraleToolkit` — real.
- `agno-agi/agno #7203` uses `from straleio import Strale` — real SDK.
- `langflow-ai/langflow #12678` writes the integration inline in the LangFlow repo (uses `langchain_core.tools.StructuredTool` directly).
- The 10 awesome-list / registry PRs add a catalog entry only, no code imports.

### 4. Other surface audit

- `strale-frontend` (strale.dev): zero references.
- `public/llms.txt`: zero references.
- Sibling strale-io repos (agent-skills, strale-examples, strale-beacon, n8n-nodes-strale): zero references in their code.
- `archive/` and `handoff/` within strale: zero references.

### 5. Public mentions of the DouweM incident

GitHub issues search for `StraleToolset` / `"cannot import name"` across strale-io: **zero hits**.

No evidence yet that DouweM's comment has been amplified (Twitter/Reddit/HN scan not covered by this audit — recommended as a follow-up Petter should do via search). 24–48 hour window to get ahead of it.

---

## What caused this — the shortest version

Six causes, upstream to downstream:

1. **Batch package generation.** Six framework packages were added in a single commit (`b93512f`, 2026-03-22). `StraleClient` boilerplate was applied uniformly. Framework-specific subclassing was done for three of them, skipped for the other three.
2. **Uniform README prose.** The "250+ Strale capabilities as X tools" line was swept across all six READMEs regardless of what the code shipped.
3. **PyPI publication with misleading summary.** Summary field ("Pydantic AI integration for Strale") implies the package subclasses pydantic-ai's primitives. It doesn't.
4. **Distribution PR example fabricated.** The pydantic-ai PR imported `StraleToolset` — a class that never existed in the package. Cargo-culted from the neighboring ACI.dev doc example, not extracted from the actual module.
5. **Bot reviewers don't verify imports.** Devin, CodeRabbit, gemini-code-assist flagged style and prose; none ran `python -c "from pydantic_ai_strale import StraleToolset"`.
6. **My own share** (2026-04-18 session): I edited PR #4866 to trim promotional tone per a bot finding. I did not verify the code example's imports existed in the package. Trimming the prose while leaving the fabricated import made the PR look cleaner and more plausible — widening the gap between appearance and reality.

---

## Disposition recommendations (Petter's call)

For each of the three hollow packages, one of three options. My recommendation by default is **Option C + keep three real packages**, but call the shot per-package.

### Option A — Build real integration

Write a proper `StraleToolset` (pydantic-ai) / ADK-equivalent / OpenAI-Agents SDK-equivalent subclass. Publish at 0.2.0. Keep PyPI name. Cost: ~1 day engineering per package.

### Option B — Rename + rescope

Yank the framework-named version. Republish under a non-framework name (e.g. `strale-client-python` — or just use the existing `straleio` SDK which is already real). Update the README to describe a plain HTTP client. Cost: ~2 hours per package.

### Option C — Deprecate entirely

Yank from PyPI. Add a `DEPRECATED.md` to the package directory pointing users to:
1. The Strale MCP server at `https://api.strale.io/mcp` — the general integration surface.
2. The `straleio` SDK for Python.
3. The three real framework packages (`langchain-strale`, `crewai-strale`, `composio-strale`) for the frameworks that have them.

Cost: ~30 min per package. Simplifies the surface area and makes the MCP server the canonical integration path.

### Why I'd default to C

- **Maintenance load**: 6+ framework packages means 6+ code paths, 6+ readme files, 6+ versions to keep accurate. Three already drifted hollow. Without the CI guardrail (which we now have), this will happen again.
- **MCP is already honest**: the Strale MCP server provides general agent integration. Every framework that matters (Claude, Cursor, Cline, OpenAI Agents SDK, Pydantic AI, Google ADK) either supports MCP natively or is adding support. Framework-specific Python wrappers are decreasingly useful.
- **Brand recovery**: a clean "we removed three packages that didn't meet our own standards" post is a stronger brand moment than a six-pack of thin wrappers. Honesty > surface area.

### What to do about pydantic-ai specifically

Regardless of which option, **do not reply to DouweM this week**. A response while the comment is still sharp escalates the conversation. If you want to re-enter pydantic-ai's ecosystem long-term, the path is:
1. Yank/fix the package as part of Option A, B, or C today.
2. Three to six months from now, if you've shipped a real `StraleToolset`, submit it to pydantic-ai via a different channel (e.g., as a linked toolset in the docs, via an issue asking for review, via Kludex directly).
3. Do not re-open or comment on PR #4866. It is closed and should stay closed.

---

## Structural guardrails (shipped in this session)

The remediation is partly code — see the following files committed alongside this report:

1. **`apps/api/scripts/check-framework-packages.mjs`** — CI check. For every `packages/X-strale/` directory, asserts that at least one top-level import (or register-pattern call for composio) from the framework exists. Runs in CI on every PR. Currently **FAILS** on pydantic-ai-strale, google-adk-strale, openai-agents-strale; will unblock once those are fixed or removed.
2. **`CLAUDE.md`** — new rule under Governance: agents editing third-party distribution PRs must `gh api` the referenced package's source tree and verify every imported symbol exists before touching the PR body.
3. **`DISTRIBUTION_PR_PREFLIGHT.md`** — checklist for humans opening a new distribution PR. Every PR that cites a `*-strale` package must paste the output of `python -c "$(extract_from_pr)"` proving the imports resolve.

---

## Execution checklist (what Petter needs to do)

**Immediate (today)**:
- [ ] Decide Option A / B / C per package (3 decisions).
- [ ] For each package: yank current PyPI version via `twine` or PyPI web UI.
- [ ] If Option A or B: publish replacement.
- [ ] If Option C: add `DEPRECATED.md` to package dir; update `pyproject.toml` to mark the project as deprecated; commit.
- [ ] Scan Twitter/X, HN, Reddit, and Discord for "pydantic-ai-strale" / "StraleToolset" / "Strale shame" mentions.

**This week**:
- [ ] CI: wire `check-framework-packages.mjs` into the existing `.github/workflows/ci.yml` between typecheck and test.
- [ ] Notion: add a Journal entry documenting the incident and the remediation. Tag as `course-correction`.
- [ ] Review remaining open distribution PRs (LangFlow, the registries) with fresh eyes using the new pre-flight checklist.
- [ ] Backfill a real `StraleToolset` for pydantic-ai if you picked Option A — takes ~1 day.

**Ongoing**:
- [ ] Quarterly: run `check-framework-packages.mjs` against every published `*-strale` package (PyPI + npm). Any drift = yank.
- [ ] No new framework-named package ships without a PR review that includes running the pre-flight checklist.
