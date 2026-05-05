# Distribution PR status — strale-io upstream pipeline

**Snapshot date**: 2026-04-18
**Scope**: all open PRs authored by `petterlindstrom79` on public GitHub repos *outside* `strale-io/*`. Read-only — no comments, closes, or pushes during the snapshot.

---

## Executive summary

**20 open distribution PRs.**

| State | Count | What it means |
|---|---|---|
| NEEDS AUTHOR ACTION | 1 | Maintainer has requested changes Petter must address |
| CI RED (real failures) | 1 | Petter must push a fix commit |
| AWAITING REVIEW | 18 | Waiting on a maintainer; nothing Petter can do except patience (or a polite ping once a PR passes ~3 weeks) |
| STALE (>30d no activity) | 0 | — |
| MERGED / CLOSED recently | 13 (last 60d) | See tail of this doc |

**Two items need Petter's attention in the next 48 hours**:

1. **Pipedream #20584** — maintainer tested the PR and hit an internal server error when `dry_run=false`. Petter has pushed partial fixes; the ISE is still live per michelle0927's 2026-04-17 ping. Plus branch is now in merge conflict (DIRTY). Highest unblock value in the queue — Pipedream is a major agent platform.

2. **LangFlow #12678** — 7 real CI failures (Ruff style, component-index update, backend unit tests py3.10 group 4, two Playwright shards, coverage merge, and the umbrella "CI Success"). Petter already rebased 2026-04-17 per Notion's LangFlow component page; the Ruff one is likely trivial, the test failures need investigation.

Everything else is patience. A handful of PRs are crossing the 2–3 week mark with no maintainer action — those are candidates for a polite ping (see "Recommendations" at the end).

---

## Priority actions

Ordered by "potential unblock value if resolved this week". Platform reach × review-state leverage.

### 1. Pipedream #20584 — fix ISE + rebase
- **Repo**: `PipedreamHQ/pipedream`
- **State**: NEEDS AUTHOR ACTION (CHANGES_REQUESTED + CONFLICTING)
- **What the maintainer said** (michelle0927, 2026-04-17): *"please see my previous review comment. The internal server errors will need to be resolved before this can be merged."* Earlier: "when Dry Run is set to `false`, I'm getting an internal server error."
- **Action**: reproduce the ISE, fix it, rebase onto `main` to clear the CONFLICTING state, push. CodeRabbit's lint-style comments were already addressed in commit `d3b8507` per Petter's own reply.
- **Why it matters**: Pipedream is in the top tier of agent/automation platforms. Merging unlocks "Strale" appearing in Pipedream's component catalog. Notion notes the base integration (Apr 15) is already live; this PR adds the 10 pre-built actions on top.

### 2. LangFlow #12678 — fix 7 CI failures
- **Repo**: `langflow-ai/langflow`
- **State**: CI RED (89 passes, 7 fails, 0 pending)
- **What's failing**: Ruff Style (3.13), Update Component Index, Backend Tests py3.10 Group 4, Playwright Shards 24/70 and 54/70, Frontend Coverage Merge, CI Success umbrella.
- **Action**: start with Ruff — trivial fix and will often make the umbrella green. Then look at Update Component Index (likely a convention for new components under `src/lfx/src/lfx/components/strale/`). Backend/Playwright failures may or may not be PR-specific; try a rebase first.
- **Why it matters**: Same tier as Pipedream. LangFlow is the canonical LangChain-aligned GUI. Notion confirms the PR was rebased 2026-04-17 but the CI has regressed since.

### 3. pydantic-ai #4866 — polite ping + defensive edit
- **Repo**: `pydantic/pydantic-ai`
- **State**: AWAITING REVIEW (23 days old, 11 days since Petter's last ping, no maintainer re-engagement)
- **Context**: Kludex (maintainer) *did* engage — but only to joke about the Devin-AI bot reviewer (*"LOL"* / *"I guess we found out what Devin uses."*). No actionable review. DouweM asked for a CI fix on 2026-03-26 which Petter resolved next day; no further maintainer comment since.
- **Worth noting**: Devin-bot flagged *"promotional tone in third-party toolset description"* on 2026-04-03. That's the kind of note a human maintainer might quietly act on. A defensive edit to de-promote the prose before the next human looks at it is cheap insurance.
- **Action**: rebase + polite one-line ping referencing the rebase. Optionally trim the description prose by ~20%.
- **Why it matters**: pydantic-ai is the pydantic-aligned agent framework with real adoption in the typed-Python community.

### 4. LangChain docs #3445 — polite ping
- **Repo**: `langchain-ai/docs`
- **State**: AWAITING REVIEW (12 days old, CI 11/11 green, no maintainer touch)
- **Context from Notion**: this is the **third rebase** of the same content (previous PRs #3341 and #3443 both closed due to upstream `packages.yml` churn). Risk is another upstream rebase making this stale again.
- **Action**: watch the upstream `packages.yml` file — rebase proactively if another change lands. A polite ping if nothing moves by next week.

### 5. Docker MCP / AWS agentcore / IBM mcp-context-forge — pipeline pings
- **PRs**: `docker/mcp-registry #2202`, `awslabs/agentcore-samples #1232`, `IBM/mcp-context-forge #3974`
- **State**: all AWAITING REVIEW, all ~17 days old with no maintainer engagement.
- **Action**: these are tier-1 agent-platform registries. One polite batched ping on each would be appropriate around day 21 (3 days from now). Big-vendor PRs need patience but also need visible life signs.

---

## Full table (grouped by distribution channel)

### Official framework integrations (7)

| PR | Repo | State | Age | Since update | CI | Action |
|---|---|---|---|---|---|---|
| [#20584](https://github.com/PipedreamHQ/pipedream/pull/20584) | PipedreamHQ/pipedream | **NEEDS ACTION** | 5d | 1d | green | Fix ISE when dry_run=false; rebase to clear DIRTY |
| [#12678](https://github.com/langflow-ai/langflow/pull/12678) | langflow-ai/langflow | **CI RED** | 5d | 1d | 89p / 7f | Fix Ruff + component-index + test failures |
| [#6209](https://github.com/FlowiseAI/Flowise/pull/6209) | FlowiseAI/Flowise | AWAITING REVIEW | 5d | 5d | none | Wait; gemini-code-assist has commented, no human yet |
| [#3445](https://github.com/langchain-ai/docs/pull/3445) | langchain-ai/docs | AWAITING REVIEW | 12d | 5d | green (11/11) | Third rebase; ping-worthy at day 21 |
| [#4866](https://github.com/pydantic/pydantic-ai/pull/4866) | pydantic/pydantic-ai | AWAITING REVIEW | 23d | 11d | green (33/33) | **Polite ping + de-promote prose** |
| [#358](https://github.com/crewAIInc/crewAI-examples/pull/358) | crewAIInc/crewAI-examples | AWAITING REVIEW | 21d | 11d | green | Wait; ping-worthy at day 28 |
| [#7203](https://github.com/agno-agi/agno/pull/7203) | agno-agi/agno | AWAITING REVIEW | 21d | 5d | green | Wait; recent activity (label bot) |

### Agent platform registries (4)

| PR | Repo | State | Age | Since update | CI | Action |
|---|---|---|---|---|---|---|
| [#2202](https://github.com/docker/mcp-registry/pull/2202) | docker/mcp-registry | AWAITING REVIEW | 17d | 11d | none | Ping-worthy day 21 |
| [#1232](https://github.com/awslabs/agentcore-samples/pull/1232) | awslabs/agentcore-samples | AWAITING REVIEW | 17d | 11d | green (1/1) | Ping-worthy day 21 |
| [#3974](https://github.com/IBM/mcp-context-forge/pull/3974) | IBM/mcp-context-forge | AWAITING REVIEW | 17d | 3d | green (1/1) | Wait |
| [#723](https://github.com/agentic-community/mcp-gateway-registry/pull/723) | agentic-community/mcp-gateway-registry | AWAITING REVIEW | 17d | 10d | unclear | Ping-worthy day 21 |

### Awesome-lists and directories (8)

| PR | Repo | State | Age | Since update | CI | Action |
|---|---|---|---|---|---|---|
| [#212](https://github.com/PatrickJS/awesome-cursorrules/pull/212) | PatrickJS/awesome-cursorrules | AWAITING REVIEW | 24d | 1d | green | MERGEABLE + CLEAN — literally ready to merge |
| [#111](https://github.com/Merit-Systems/awesome-x402/pull/111) | Merit-Systems/awesome-x402 | AWAITING REVIEW | 25d | 2d | none | Wait; recently pinged by Petter |
| [#283](https://github.com/detailobsessed/awesome-windsurf/pull/283) | detailobsessed/awesome-windsurf | AWAITING REVIEW | 24d | 10d | green | Only Devin-bot reviews; ping-worthy |
| [#3696](https://github.com/punkpeye/awesome-mcp-servers/pull/3696) | punkpeye/awesome-mcp-servers | AWAITING REVIEW | 27d | 2d | none | Wait (approaching 30d) |
| [#28](https://github.com/habitoai/awesome-mcp-servers/pull/28) | habitoai/awesome-mcp-servers | AWAITING REVIEW | 27d | 2d | green | Wait (approaching 30d) |
| [#51](https://github.com/ever-works/awesome-mcp-servers/pull/51) | ever-works/awesome-mcp-servers | AWAITING REVIEW | 27d | 2d | none | Wait (approaching 30d) |
| [#163](https://github.com/heilcheng/awesome-agent-skills/pull/163) | heilcheng/awesome-agent-skills | AWAITING REVIEW | 12d | 2d | Vercel auth fail (maintainer-side) | Wait; Vercel fail only maintainer can fix |
| [#32](https://github.com/sanjeed5/awesome-cursor-rules-mdc/pull/32) | sanjeed5/awesome-cursor-rules-mdc | AWAITING REVIEW | 24d | **17d** | green | Approaching STALE; ping-worthy |

### Other (1)

| PR | Repo | State | Age | Since update | CI | Action |
|---|---|---|---|---|---|---|
| [#1709](https://github.com/x402-foundation/x402/pull/1709) | x402-foundation/x402 | AWAITING REVIEW | **30d** | 10d | Vercel auth fail (maintainer-side) + 2 pass | Oldest open; ping-worthy. Note: Vercel "CI red" is upstream auth, not Petter's to fix. |

---

## Recently completed (last 60 days)

### Merged ✅

| PR | Repo | Merged |
|---|---|---|
| [#12391](https://github.com/activepieces/activepieces/pull/12391) | activepieces/activepieces | 2026-04-06 |
| [#46](https://github.com/moov-io/awesome-fintech/pull/46) | moov-io/awesome-fintech | 2026-03-31 |
| [#1702](https://github.com/a2aproject/A2A/pull/1702) | a2aproject/A2A | 2026-03-30 |
| [#162](https://github.com/xpaysh/awesome-x402/pull/162) | xpaysh/awesome-x402 | 2026-04-03 |
| [#83](https://github.com/rohitg00/awesome-devops-mcp-servers/pull/83) | rohitg00/awesome-devops-mcp-servers | 2026-03-28 |
| [#212](https://github.com/TensorBlock/awesome-mcp-servers/pull/212) | TensorBlock/awesome-mcp-servers | 2026-03-24 |
| [#3425](https://github.com/punkpeye/awesome-mcp-servers/pull/3425) | punkpeye/awesome-mcp-servers | 2026-04-02 |

### Closed without merge (several are supersessions)

| PR | Repo | Closed | Note |
|---|---|---|---|
| [#3443](https://github.com/langchain-ai/docs/pull/3443) | langchain-ai/docs | 2026-04-06 | Closed by upstream `packages.yml` churn → replaced by #3445 |
| [#3341](https://github.com/langchain-ai/docs/pull/3341) | langchain-ai/docs | 2026-04-05 | Closed by upstream churn → replaced by #3443 → #3445 |
| [#14](https://github.com/coinbase/x402/pull/14) | coinbase/x402 | 2026-04-03 | Closed; Coinbase's x402 repo governance rejects "ecosystem addition" PRs |
| [#303](https://github.com/kyrolabs/awesome-agents/pull/303) | kyrolabs/awesome-agents | 2026-03-30 | Closed |
| [#327](https://github.com/VoltAgent/awesome-agent-skills/pull/327) | VoltAgent/awesome-agent-skills | 2026-04-01 | Closed |
| [#1872](https://github.com/x402-foundation/x402/pull/1872) | x402-foundation/x402 | 2026-03-30 | Closed (earlier example-client attempt) |
| [#135](https://github.com/xpaysh/awesome-x402/pull/135) | xpaysh/awesome-x402 | 2026-03-28 | Superseded by #162 (merged) |
| [#1708](https://github.com/x402-foundation/x402/pull/1708) | x402-foundation/x402 | 2026-03-19 | Superseded by #1709 (current open) |
| [#105](https://github.com/heilcheng/awesome-agent-skills/pull/105) | heilcheng/awesome-agent-skills | 2026-04-06 | Superseded by #163 (current open) |
| [#3229, #3283](https://github.com/punkpeye/awesome-mcp-servers/pulls) | punkpeye/awesome-mcp-servers | 2026-03-14, 2026-03-23 | Superseded by #3425 (merged) → now #3696 |
| [#695](https://github.com/thedaviddias/llms-txt-hub/pull/695) | thedaviddias/llms-txt-hub | 2026-03-14 | Closed |

---

## Recommendations

### PRs worth pinging a reviewer on (chronological, polite)

- **pydantic-ai #4866** (23d, zero human review) — rebase first to show it's alive, then one-line *"rebased on `main`, CI green, ready when someone has a moment"*.
- **sanjeed5/awesome-cursor-rules-mdc #32** (24d, 17d since last touch) — if silent 3 more days, close it and submit somewhere else. This is the only PR approaching the 30-day stale line without reviewer engagement.
- **docker/mcp-registry #2202**, **awslabs/agentcore-samples #1232**, **agentic-community/mcp-gateway-registry #723** (all 17d, 10–11d since touch) — big-vendor registries. Send one light ping each in ~3–4 days if nothing moves.
- **detailobsessed/awesome-windsurf #283** (24d, Devin-bot-only review) — polite note that bot review is resolved, human review welcome.

### PRs that look dead and worth considering closing

None. Nothing is clearly dead. The closest candidate is `sanjeed5/awesome-cursor-rules-mdc #32` (24 days, 17 days of silence after a bot check) — but it's a small PR with no signal either way yet. Give it one more week.

### Channel-level observations

- **Coinbase x402 ecosystem is a hard no**. Multiple PRs closed: `coinbase/x402 #14`, `x402-foundation/x402 #1708` and `#1872`. The currently-open `x402-foundation/x402 #1709` is now 30 days old. Maintainers of x402 repos seem reluctant to accept ecosystem-addition PRs. Strategy pivot may be warranted: if #1709 doesn't move in another week or two, try a different placement (documentation PR, example app, blog post) rather than another ecosystem-list edit.
- **LangChain docs are a moving target** — 3 consecutive rebase-then-closed cycles due to upstream `packages.yml` churn. Watch that file's commit history; auto-rebase on every change if this becomes a pattern.
- **Awesome-list pipeline has a ~35% close-without-merge rate** (5 closed without merge out of 14 recent attempts across the awesome-* family). Normal for the category — many maintainers are slow, some repos are unmaintained. Not worth re-strategizing yet.
- **Bot-only reviews are now common** (CodeRabbit, Devin-AI, gemini-code-assist). Helpful for catching style issues ahead of human review but they don't move the review-decision needle. Treat them as free lint; don't conflate with human engagement.

### Healthy pipeline signals

- **7 merged in 30 days** across activepieces, moov-io, a2aproject, xpaysh, rohitg00, TensorBlock, punkpeye — steady wins.
- **Pipedream base integration is LIVE** (Apr 15, per Notion) — the PR under review adds depth on top of an already-shipped integration, not de-novo presence.
- **20 PRs in flight is the right order of magnitude** for a solo-founder distribution push; not so many that individual ones go unnoticed.

---

## Data sources

- `gh search prs author:petterlindstrom79 is:open --limit 100` (20 results, excluding `strale-io/*`)
- `gh search prs author:petterlindstrom79 is:closed updated:>=2026-02-18 --limit 100` (recently-closed tail)
- `gh pr view <each-pr>` with `--json mergeable,mergeStateStatus,reviewDecision,reviews,comments,statusCheckRollup,additions,deletions,files`
- `gh api repos/pydantic/pydantic-ai/pulls/4866/comments` for review-thread drill-down
- Notion Distribution Surfaces registry for LangFlow / Flowise / Windmill / LangChain context

No state-changing operations were performed on any upstream repository.
