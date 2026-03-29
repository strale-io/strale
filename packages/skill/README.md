# Strale Agent Skill

Agent skill file for [Strale](https://strale.dev) — teaches AI coding agents when and how to use Strale's 250+ capabilities.

## What is this?

A [SKILL.md](https://agentskills.io) file that works across Claude Code, Codex, OpenClaw, Cursor, Gemini CLI, Paperclip, and any agent supporting the universal skill format.

The MCP server (`strale-mcp`) provides the **tools**. This skill provides the **knowledge** — when to use Strale, which capabilities to pick, how to chain them for KYB workflows, and how to handle errors.

## Install

### Claude Code (personal — available in all projects)

```bash
mkdir -p ~/.claude/skills/strale
cp SKILL.md ~/.claude/skills/strale/
```

### Claude Code (project — shared via git)

```bash
mkdir -p .claude/skills/strale
cp SKILL.md .claude/skills/strale/
```

### Codex CLI

```bash
mkdir -p ~/.codex/skills/strale
cp SKILL.md ~/.codex/skills/strale/
```

### Paperclip

Reference the skill directory in your agent's adapter config:

```json
{
  "adapterConfig": {
    "args": ["--add-dir", "/path/to/strale/packages/skill"]
  }
}
```

## Used with

- [strale-mcp](https://www.npmjs.com/package/strale-mcp) — MCP server (tools)
- [straleio](https://www.npmjs.com/package/straleio) — TypeScript SDK
- [straleio](https://pypi.org/project/straleio/) — Python SDK

## Get an API key

Sign up at [strale.dev](https://strale.dev) — new accounts get €2.00 trial credits, no card required.
