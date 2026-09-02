# Yank list — three hollow PyPI packages

**Date**: 2026-04-22
**Scope**: three framework-named PyPI packages whose published code contains zero framework-specific integration. See `CONTAINMENT_REPORT.md` for context.

## The three packages

| Package | Version | Upload date | Last-month downloads |
|---|---|---|---|
| `pydantic-ai-strale` | 0.1.1 | 2026-03-26 | 163 |
| `google-adk-strale` | 0.1.1 | 2026-03-26 | 160 |
| `openai-agents-strale` | 0.1.1 | 2026-03-26 | 155 |

## Why these three

Each ships a generic `StraleClient` HTTP wrapper with a framework-implying name. Neither `from pydantic_ai`, `from google.adk`, nor `from openai_agents` (or `from agents`) appears in any of their module files — only inside docstrings showing aspirational usage. The package name promises framework integration the code doesn't deliver.

For `composio-strale`, `langchain-strale`, `crewai-strale`, `semantic-kernel-strale`, `n8n-nodes-strale`: verified real integrations. No action needed.

---

## Option A — Full yank (executable today)

### Via PyPI web UI (most reliable)

1. Sign in at https://pypi.org/manage/account/ as `petter_79`.
2. For each package, go to `https://pypi.org/manage/project/<pkg>/releases/` and click **Yank** on every existing release (not Delete — yanked versions stay resolvable for lockfiles but get a warning on `pip install`).
3. Optionally add a yank reason:
   > "This release does not contain the framework-specific integration its name implies. For the canonical Strale integration, use the MCP server at https://api.strale.io/mcp or the straleio SDK."

### Via `twine` (CLI, if you have an API token)

`twine` cannot yank — yanking is a PyPI web-UI action or an authenticated XML-RPC call. For scripting, use the PyPI JSON API with a token:

```bash
# Export your PyPI token with project-level permissions for each package
export PYPI_TOKEN="pypi-<token>"

# Yank each affected release
for pkg in pydantic-ai-strale google-adk-strale openai-agents-strale; do
  curl -X POST \
    -H "Authorization: token $PYPI_TOKEN" \
    -d "yanked=true&yanked_reason=Package does not implement the framework integration its name implies. Use the MCP server at https://api.strale.io/mcp instead." \
    "https://pypi.org/manage/project/$pkg/release/0.1.1/yank/"
done
```

*Note: the XML-RPC yank endpoint has been variable; the web UI is the authoritative path.*

---

## Option B — Yank + republish as rename (if keeping the code as a client library)

For each package:

1. Yank 0.1.1 on PyPI (see Option A).
2. Rename the directory: `git mv packages/pydantic-ai-strale packages/strale-client-py` (or similar).
3. Update `pyproject.toml`:
   - `name = "strale-client-py"` (or whatever you choose)
   - `description = "Plain Python HTTP client for the Strale API (not a framework integration — see strale-io/strale/tree/main/packages/langchain-strale etc. for framework-specific packages)."`
4. Rewrite the README to describe a plain client only. Remove mentions of pydantic-ai / google-adk / openai-agents.
5. Publish at 0.2.0.
6. Repeat per package.

Note: this creates three separate client-only packages (`strale-client-py-pydantic-flavored`, etc.) which is still awkward. Strongly consider **Option C instead**: just rely on the existing `straleio` SDK for Python.

---

## Option C — Yank + deprecate (recommended default)

For each package:

1. Yank 0.1.1 on PyPI (see Option A).
2. In the repo: keep the `packages/<pkg>/` directory but add a `DEPRECATED.md`:
   ```markdown
   # DEPRECATED

   This package has been yanked from PyPI.

   It did not implement the framework integration its name implied. Use
   one of the following instead:

   - **MCP server** (works with any MCP-compatible framework):
     `https://api.strale.io/mcp`
   - **Python SDK** (generic HTTP client): `pip install straleio`
   - **Framework-specific packages that are real integrations**:
     - `pip install langchain-strale`
     - `pip install crewai-strale`
     - `pip install composio-strale`
   ```
3. Update `pyproject.toml`:
   - `description = "DEPRECATED — this package has been yanked. See DEPRECATED.md."`
   - Add `classifiers = ["Development Status :: 7 - Inactive"]`
4. Commit to main. Do not re-publish.

---

## Option C — executable commands

Run these in order. Each step is stop-and-verify.

```bash
# Step 1: Yank all three packages on PyPI via the web UI (manual).
# Log into pypi.org, yank 0.1.1 of each with the reason string above.

# Step 2: Add DEPRECATED.md and update pyproject for each package.
cd C:/Users/pette/Projects/strale

for pkg in pydantic-ai-strale google-adk-strale openai-agents-strale; do
  cat > "packages/$pkg/DEPRECATED.md" <<'EOF'
# DEPRECATED — yanked from PyPI on 2026-04-22

This package has been yanked. It did not implement the framework
integration its name implied.

## Canonical Strale integration paths

- **MCP server** (works with any MCP-compatible agent framework — Claude,
  Cursor, Cline, OpenAI Agents SDK, Pydantic AI, Google ADK):
  - Endpoint: https://api.strale.io/mcp
  - Discovery: https://api.strale.io/.well-known/mcp.json

- **Python SDK** (plain HTTP client):
  ```
  pip install straleio
  ```

- **Framework-specific packages that are real integrations**:
  - `pip install langchain-strale` — LangChain `BaseTool` / `BaseToolkit`
  - `pip install crewai-strale` — CrewAI `BaseTool`
  - `pip install composio-strale` — Composio custom tools
EOF
  echo "  wrote packages/$pkg/DEPRECATED.md"
done

# Step 3: mark each pyproject.toml deprecated
for pkg in pydantic-ai-strale google-adk-strale openai-agents-strale; do
  # (manual edit: update description + add Development Status :: 7 - Inactive)
  echo "  edit packages/$pkg/pyproject.toml manually"
done

# Step 4: commit on a dedicated branch
git checkout -b chore/yank-hollow-framework-packages origin/main
git add packages/pydantic-ai-strale packages/google-adk-strale packages/openai-agents-strale
git commit -m "chore(packages): deprecate three hollow framework-named packages

Yanked from PyPI on 2026-04-22 after pydantic-ai maintainer DouweM
closed pydantic/pydantic-ai#4866 with a note that the package contained
no pydantic-ai-specific code. Audit confirmed two more with the same
pattern: google-adk-strale and openai-agents-strale.

These three shipped a generic StraleClient with framework-implying
names. Neither 'from pydantic_ai', 'from google.adk', nor 'from
openai_agents' ever appeared outside docstrings. That gap is a
credibility problem regardless of how few users installed them
(combined ~480 installs in the prior month).

Deprecation path — point users to:
  - Strale MCP server (general agent integration)
  - straleio Python SDK (generic HTTP client)
  - The three REAL framework packages (langchain-strale, crewai-strale,
    composio-strale)

See CONTAINMENT_REPORT.md for the full incident writeup and the new
apps/api/scripts/check-framework-packages.mjs CI guard that prevents
re-occurrence."

git push -u origin chore/yank-hollow-framework-packages
gh pr create --title "chore(packages): deprecate three hollow framework-named packages" ...
```

---

## Non-code follow-up (owned by Petter)

- **Update the Distribution Surfaces Notion database**: mark pydantic-ai / google-adk / openai-agents SDK rows as "deprecated — MCP only". Add a dated note linking to CONTAINMENT_REPORT.md.
- **Strale website claims**: grep strale.dev for any language that implies pydantic-ai / google-adk / openai-agents native integration. Update to "available via MCP server".
- **Twitter/X audit**: look for any past tweets that claimed these specific framework integrations. Do not delete (that's more suspicious than leaving); if anything is egregious, a correction-quote-tweet is fine.

---

## Why not "rebuild all three" (Option A × 3)?

You could ship real pydantic-ai, google-adk, and openai-agents-strale packages. Each would take ~1 day of engineering. Ongoing maintenance for 6+ framework packages is ~1 day/month forever, because every framework version bump can break one of them and nobody notices until a user files a bug.

MCP is the canonical agent integration surface in 2026. It subsumes the value of every framework-specific Python wrapper. Every framework that matters already supports MCP or will in the next six months. Keep the three real packages that exist today (langchain-strale, crewai-strale, composio-strale) as a pragmatic bridge — they already work and langchain-strale has meaningful download volume. Don't add more.

If a framework gets big enough without MCP support to justify a dedicated package (unlikely), build it at that point with a real integration from day one, under the CI guard.
