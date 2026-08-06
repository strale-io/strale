# Deprecation checklist — hollow framework packages

**Decision (2026-04-22)**: Yank + deprecate entirely for pydantic-ai-strale, google-adk-strale, openai-agents-strale. Point users at MCP + straleio SDK + the three real framework packages.

This checklist covers what's done (repo-side, by me) and what's still on Petter (PyPI yank + one Journal-page flag + a public-surface scan).

---

## What's done ✅

Shipping in PR #TBD on `chore/deprecate-hollow-framework-packages`:

### 1. Repo — packages deprecated in place
- `packages/pydantic-ai-strale/` — module source deleted, `DEPRECATED.md` added, README rewritten as redirect, `pyproject.toml` version-bumped to `Development Status :: 7 - Inactive`.
- `packages/google-adk-strale/` — same.
- `packages/openai-agents-strale/` — same.

Each package directory now contains: `DEPRECATED.md`, `README.md` (redirect), `LICENSE`, `pyproject.toml`. No module source, no build artifacts, nothing anyone can import.

### 2. CI guardrail — allowlist removed, permanent deprecation-aware check
- `apps/api/scripts/check-framework-packages.mjs` now skips any package with a `DEPRECATED.md` at its root.
- The 2026-05-06 allowlist deadline is gone — it doesn't apply anymore.
- Script now reads: `ok` for 4 real packages (composio-strale, crewai-strale, langchain-strale, semantic-kernel-strale), `skip` for 3 deprecated, exit 0.
- CI will fail any future hollow package (one that matches `X-strale` but has neither a framework import nor a DEPRECATED.md).

### 3. Daily digest — stopped tracking yanked packages
- `apps/api/src/lib/daily-digest/fetch-ecosystem.ts` `PYPI_PACKAGES` array: removed pydantic-ai-strale, google-adk-strale, openai-agents-strale. Only tracks the 4 real packages now.

### 4. Notion Distribution Surfaces — 4 pages updated
| Page | Update |
|---|---|
| [PyPI: pydantic-ai-strale](https://www.notion.so/33d67c87082c8107a8d1ef153d3624c0) | Status: Live → Blocked. Notes rewritten with ⛔ DEPRECATED marker and full context. Last verified: 2026-04-22. |
| [PyPI: google-adk-strale](https://www.notion.so/33d67c87082c819c894bfef9265e62ae) | Same treatment. |
| [PyPI: openai-agents-strale](https://www.notion.so/33d67c87082c81be87e9da72669dace4) | Same treatment. |
| [Pydantic AI toolsets page](https://www.notion.so/33d67c87082c81ccb248ded1e7d35dde) | Status: Pending → Blocked. Notes rewritten with ❌ CLOSED marker, DouweM's quote, and "do not re-open, do not respond" direction. |

Note: the Distribution Surfaces database doesn't have a "Deprecated" status option — only {Live, Pending, Blocked, Not started, Paused, Unverified}. "Blocked" is the closest fit. If you want a proper "Deprecated" status, add it to the database options as a separate ~30-second task.

---

## What's still on you ⚠️

### A. Yank the 3 packages on PyPI — **do this today**

PyPI yank is a web-UI action; there's no CLI path that works reliably. As `petter_79`:

1. https://pypi.org/manage/project/pydantic-ai-strale/releases/ → Yank `0.1.1` with reason:
   > *"Package did not implement the framework integration its name implied. Use the Strale MCP server at https://api.strale.io/mcp or pip install straleio."*
2. https://pypi.org/manage/project/google-adk-strale/releases/ → same.
3. https://pypi.org/manage/project/openai-agents-strale/releases/ → same.

Yank (not delete) keeps the version resolvable by existing lockfiles but marks it as discouraged in `pip install` output. Correct choice — prevents breaking any user's existing setup while stopping new installs from going here.

Once this is done, the `Blocked` status in Notion becomes literally true. Until it's done, the packages are still installable from PyPI.

### B. Flag the fabricated-import in an internal brainstorm Journal entry

Found one: **[🤝 Agent-to-Agent Field Agent — Strale as an Actor, Not Just Infrastructure](https://www.notion.so/33467c87082c81b388d6c0d433e4c1ac)** (Journal entry from 2026-03-31, type=brainstorm).

Contains two code snippets with fabricated imports:

```python
from strale import StraleInterceptor     # ← `strale` package doesn't exist (we have `straleio`); `StraleInterceptor` doesn't exist anywhere
```

```python
from crewai_strale import StraleAgent    # ← crewai-strale is real, but its __all__ is StraleClient/StraleToolkit/StraleTool/StraleSearchTool/StraleBalanceTool/StraleGenericInput. No `StraleAgent`.
```

Per the repo convention, **I can't edit Journal entries**. Options for you:

1. **Preferred**: leave the brainstorm as-is (it's your thinking-out-loud from March 31, and brainstorms are allowed to speculate) but add a one-line addendum at the top: "⚠️ 2026-04-22 update: the two code snippets below imagine classes (`StraleInterceptor`, `StraleAgent`) that do not exist in the published packages. This was a brainstorm about what could be built, not a description of shipped code."
2. **Alternative**: write a new Journal entry titled something like "2026-04-22 — containment of hollow framework packages" that references both the Distribution Surfaces updates and this March 31 brainstorm, noting the speculative imports as a lesson.

Either is fine. The important thing is there's a searchable note so a future session (agent or human) doesn't find the brainstorm and treat the snippets as implemented.

### C. Public-surface scan — Twitter/X, LinkedIn, dev.to, Reddit, blog

I only had access to the Strale monorepo + the strale-frontend clone + public Notion. I found **zero external-to-us references** to the hollow package names. But Strale has public social surfaces I can't reach:

- **Twitter/X**: search your own timeline and drafts for tweets that named `pydantic-ai-strale`, `google-adk-strale`, or `openai-agents-strale` specifically, or made claims about "full Pydantic AI integration" / "Google ADK integration" / "OpenAI Agents SDK integration." If any exist, decide whether to quote-tweet a correction, delete, or leave + let them age out. My default: leave + let age out (deletion draws attention).
- **LinkedIn**: same.
- **dev.to / Medium / Hashnode / blog**: if any post described these three as standalone framework integrations (rather than "available via MCP"), it needs a correction note.
- **Typefully queue**: check the scheduled-post queue for anything mentioning the three by name. Update or remove.
- **llms.txt** on strale.dev: grep manually for package names. I couldn't find the file — confirm it's not falsely advertising.

If anything public needs a correction, the voice to use (per the Strale social-media Notion doc): *"We had three Python packages whose names implied deeper framework integration than the code provided. We've yanked them and deprecated the names. The canonical path for every framework is our MCP server at api.strale.io/mcp."* Factual, not apologetic. Don't name DouweM or quote him.

### D. Optional — add "Deprecated" as a valid status in the Distribution Surfaces database

The database's Status field currently has options {Live, Pending, Blocked, Not started, Paused, Unverified}. Adding "Deprecated" would let future deprecated surfaces use an accurate label instead of "Blocked." ~30 seconds in the Notion UI: open the database, edit the Status select field, add "Deprecated."

After adding it, change the 3 PyPI rows from Blocked → Deprecated for accuracy. Not urgent.

### E. Monitor — public mentions of DouweM's comment

Per yesterday's recommendation: scan Twitter/X/HN/Reddit for "pydantic-ai-strale", `"StraleToolset"`, `"strale" "shame"` over the next 72 hours. If anything surfaces, the proactive-acknowledgment post becomes reasonable; my default recommendation is still silent yank + deprecate, which is what this checklist ships.

---

## What happens if you do nothing on A/B/C

- **A (PyPI yank) not done**: packages stay installable. ~480 users/month keep hitting the same ImportError they've been hitting for a month. Probability someone else does a DouweM-style public callout: non-zero and rising each week.
- **B (Journal flag) not done**: low risk unless an agent session does a Notion search hitting that page and picks up the fabricated imports as ground truth. Mitigated by the new CLAUDE.md rule (DEC-20260422-A) which requires symbol verification before touching distribution PRs — but a session could still treat the snippets as aspirational-but-implemented in its plan.
- **C (public scan) not done**: you don't know if there's public content that contradicts the Notion update. Nobody will call it out unless it surfaces in a reviewer's search, at which point you'd want to have already known about it.

None of A/B/C are show-stoppers individually. A is the most valuable and takes ~5 minutes total. B is ~1 minute. C depends on how much public content you have to scan.

---

## Inventory of what this leaves

**Real Strale framework integrations (approved list)**:
- MCP server (any framework) — `https://api.strale.io/mcp`
- `straleio` (Python SDK, generic HTTP client) — real, exports `Strale` class
- `langchain-strale` — real, subclasses LangChain primitives
- `crewai-strale` — real, subclasses CrewAI `BaseTool`
- `composio-strale` — real, uses `composio.tools.custom_tool` decorator
- `semantic-kernel-strale` (npm) — real, uses `kernelFunction`
- `n8n-nodes-strale` (separate repo) — real, uses `n8n-workflow`
- `@strale/sdk` (npm) — generic TypeScript SDK
- `strale-mcp` (npm) — MCP server

**Deprecated**:
- `pydantic-ai-strale` — forwarding to MCP + straleio
- `google-adk-strale` — forwarding to MCP + straleio
- `openai-agents-strale` — forwarding to MCP + straleio

**In flight that still claims these packages exist**: zero. Scanned every open distribution PR, every merged PR in the last 60 days, strale-frontend, all sibling repos, all tracked files in the monorepo. Containment is tight.
