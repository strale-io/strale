# Distribution PR pre-flight checklist

**Use this before opening any PR to a third-party repo that references a Strale package or integration.** Every item must be verified and checked off. The checklist exists because on 2026-04-21 a pydantic-ai PR was closed by the maintainer with "Shame on you" after he discovered the PR's code example imported a class that didn't exist in the published package. See `CONTAINMENT_REPORT.md`.

---

## Required verifications (all four must pass)

### 1. Every import in every code example resolves against the published package

For each `from X import Y` or `import X` statement in the PR's code examples (including README / docs / inline comments), run:

```bash
python -c "from X import Y"     # Python
node -e "const {Y} = require('X'); console.log(typeof Y)"    # Node / npm
```

Against the **currently-published** version of `X` on PyPI / npm. Not the latest commit on main, not a wishful future version — the version a user will actually get with `pip install X` right now.

If any import fails, the PR is **not ready**. Fix the package first (publish the missing symbol), then open the PR.

Checkbox:
- [ ] Every import in every code example resolves against the published package version.

### 2. The Strale package cited (if any) is on the APPROVED list

**Approved** (verified real integrations, as of 2026-04-22):
- `langchain-strale` — subclasses LangChain `BaseTool` / `BaseToolkit`
- `crewai-strale` — subclasses CrewAI `BaseTool`
- `composio-strale` — uses `@composio.tools.custom_tool` decorator
- `semantic-kernel-strale` (npm) — uses `semantic-kernel`'s `kernelFunction`
- `n8n-nodes-strale` (separate repo) — uses n8n's `INodeType` / `n8n-workflow`
- `straleio` — generic Python SDK; does not claim any framework integration
- `@strale/sdk` (npm) — generic TypeScript SDK

**Deprecated / yanked** (do NOT reference in new PRs):
- `pydantic-ai-strale` — yanked 2026-04-22
- `google-adk-strale` — yanked 2026-04-22
- `openai-agents-strale` — yanked 2026-04-22

**Not yet published but claimed elsewhere** (do NOT reference unless you've just published them yourself and verified):
- Anything else.

Checkbox:
- [ ] Every `*-strale` package referenced is on the approved list above.

### 3. The description text matches what the code does

PR body and any description-style text (PyPI summary, README opening paragraph, the paragraph in docs/toolsets.md) must describe what the code actually does, not what would be nice if it did.

Forbidden language in description text without evidence in the code:

| Phrase | Only OK if |
|---|---|
| "integration for X" | the package subclasses at least one X primitive or uses X's canonical extension API |
| "X tools" / "X toolset" | the package exposes a class that X's own runtime can auto-discover as a toolset |
| "quality-scored" | the quality data is actually queried at runtime, not just mentioned in READMEs |
| "auto-registered with X" | the package actually auto-registers (via entry point, plugin, or explicit register call) |
| "drop-in" | the example in the README actually works on a stock install with no custom glue |

Checkbox:
- [ ] Every description-style claim has a matching evidence point in the code.

### 4. Match the neighbor

If the target repo has existing third-party entries of the same kind (other toolsets in `docs/toolsets.md`, other components in `packages/components/nodes/tools/`, other plugins in the marketplace directory), read the **two nearest neighbors** and match their tone, structure, and length. If the neighbors are 5-sentence matter-of-fact paragraphs, your entry is a 5-sentence matter-of-fact paragraph. No "250+", no "quality-scored", no "trust layer".

Checkbox:
- [ ] Read the two nearest neighbors. Entry matches their tone and length.

---

## Optional but strongly recommended

- **Run the package's README example end-to-end** on a clean virtualenv before opening the PR. `pip install <pkg>`, paste the README example into `example.py`, `python example.py`. If it errors, fix the package.
- **Ask one human** outside your own workflow to skim the PR body and say what they expect the code to do. If their mental model diverges from what the package ships, the description is promising too much.

---

## The AI-agent-session corollary

When an AI agent (Claude Code session, Cursor, etc.) edits a PR that already exists — trimming prose per a bot finding, rebasing, rewording — the agent MUST run verification (1) above before touching the PR body. Polishing the language while leaving a fabricated import in place makes the PR **more dangerous** (cleaner-looking, harder to spot the gap). See the CLAUDE.md rule under Governance.

---

## History

- **2026-04-21** — pydantic-ai #4866 closed ("Shame on you") because the code example imported `StraleToolset`, which never existed in the published `pydantic-ai-strale` 0.1.1. Two other packages had the same pattern. This checklist was written 2026-04-22 to make that specific class of incident impossible to repeat.
