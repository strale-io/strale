# Strale Spike Correlation Analysis v2
**Date:** 2026-04-08 (UTC)
**Window:** 60 days (2026-02-08 to 2026-04-08)
**Filter:** Real users only (excludes system@strale.internal)

## Headline Summary

| Metric | Value |
|--------|-------|
| Peak traffic day | **Apr 4: 247 calls, 40 IPs** |
| Second peak | **Apr 3: 150 calls, 30 IPs** |
| Peak signup day | **Mar 31: 6 signups** (3 external + 3 internal) |
| Merged PRs in window | **9** |
| Dev.to articles in window | **15** |
| X threads posted | **3+** (Mar 30, Apr 2, Apr 4) |
| Reddit posts/comments | **9+** (6 axios threads Apr 2, r/mcp Mar 31, r/AI_Agents Apr 4, r/LangChain Apr 4) |
| Contamination rate (v1 audit) | 99.1% — all analysis uses real-user-only data |

### Strongest correlations found

| Spike | Most likely cause | Confidence |
|-------|------------------|------------|
| Apr 3-4 (247+150 calls) | Distribution cluster: 6 Reddit comments in high-traffic axios threads (Apr 2) + X engagement (562 views, Apr 2) + awesome-x402 merge (Apr 3) + dev.to articles (Apr 1-4) | **MEDIUM-HIGH** |
| Mar 30-31 (3 external signups) | Distribution sprint: 3 PR merges (Mar 30) + X thread (Mar 30) + dev.to article (Mar 30) + r/mcp post (Mar 31) | **MEDIUM** |
| Activation failure (6 signups, 0 calls) | Post-signup experience broken — no guided first-call flow | **HIGH** |

---
## Task 1: 60-Day Daily Activity Timeline

### Top 5 days by call volume

| Day | Calls | Anon IPs | Auth users | Free | Paid | Signups |
|-----|-------|----------|-----------|------|------|---------|
| **Apr 4** | **247** | 40 | 0 | 247 | 0 | 0 |
| **Apr 3** | **152** | 30 | 1 | 145 | 7 | 0 |
| Feb 26 | 116 | 0 | 6 | 11 | 105 | 5 |
| Mar 30 | 114 | 1 | 1 | 21 | 93 | 0 |
| **Apr 5** | **79** | 24 | 0 | 79 | 0 | 0 |

Note: Feb 26 and Mar 30 are mostly authenticated test traffic (Petter + test accounts). Apr 3-5 is the only genuine external spike.

### Top signup days (external only)

| Day | External signups | Emails |
|-----|-----------------|--------|
| **Mar 31** | **3** | raul.valdes@retailpivot.com, astoncermott8177@outlook.com, akunmyid@gmail.com |
| Mar 30 | 1 | seronwind@gmail.com |
| Mar 20 | 1 | mkamranawan891@gmail.com |
| Apr 6 | 1 | sanket@activepieces.com |

### April 3-4 spike shape

| Day | Calls | IPs | Shape |
|-----|-------|-----|-------|
| Apr 1 | 5 | 2 | Baseline |
| Apr 2 | 27 | 15 | 5x jump — first signal |
| **Apr 3** | **150** | **30** | Spike starts |
| **Apr 4** | **247** | **40** | Peak |
| Apr 5 | 79 | 24 | Decay (CORS broken since Apr 1) |
| Apr 6 | 76 | 9 | Flat (CORS still broken) |
| Apr 7 | 69 | 17 | Post-CORS-fix, partly NovaFi burst |

The spike is a 2-day cluster (Apr 3-4) with a 1-day leading edge (Apr 2). The decay coincides with the CORS bug that blocked all browser users from ~Apr 1 onwards. **The CORS bug may have truncated the spike early.**

### User agent breakdown (Apr 3-4)

| UA type | Calls | Distinct IPs |
|---------|-------|-------------|
| node | ~340 | ~48 |
| browser | ~13 | ~8 |
| null | ~44 | — |
| curl | ~2 | ~2 |

85% programmatic — developers using strale-mcp or SDK, not the website sandbox.

---
## Task 2: Repository Activity

| Day | Commits | Notable |
|-----|---------|---------|
| Mar 30 | 24 | Distribution sprint + web3 capabilities |
| Mar 31 | 14 | Distribution strategy session |
| Apr 1 | 15 | Free-tier improvements, content strategy |
| Apr 2 | 12 | Content execution session |
| Apr 3 | 8 | Distribution surfaces audit |
| **Apr 4** | **2** | **Lowest commits = highest traffic** |
| Apr 5 | 14 | CORS fix, rate limit work |

**Inverse correlation on Apr 4:** Highest external traffic day had the fewest commits. Traffic was externally driven.

---
## Task 3: External PR & Registry Timeline

### Merged PRs (chronological)

| Created | Merged | Repository | Title |
|---------|--------|-----------|-------|
| Mar 4 | Mar 14 | thedaviddias/llms-txt-hub#695 | Add Strale to llms.txt hub |
| Mar 22 | Mar 24 | TensorBlock/awesome-mcp-servers#212 | Add Strale MCP server |
| Mar 22 | Mar 28 | rohitg00/awesome-devops-mcp-servers#83 | Add Strale MCP server |
| Mar 19 | Mar 28 | xpaysh/awesome-x402#135 | Add Strale to awesome-x402 |
| **Mar 30** | **Mar 30** | **a2aproject/A2A#1702** | **Add Strale to A2A partners** |
| **Mar 30** | **Mar 30** | **kyrolabs/awesome-agents#303** | **Add Strale to Automation** |
| **Mar 30** | **Mar 31** | **moov-io/awesome-fintech#46** | **Add Strale to Compliance** |
| **Mar 23** | **Apr 3** | **xpaysh/awesome-x402#162** | **Add Strale to ecosystem** |
| Apr 4 | Apr 6 | activepieces/activepieces#12391 | Add Strale community piece |

---
## Task 4: Content Publishing Audit

### X / Twitter (@strale_io)

| Date | Content | Engagement | Source |
|------|---------|-----------|--------|
| **Mar 30** | Web3 compliance layer thread (5 posts + reply) | Unknown | Notion SM-30 |
| **Apr 2** | Agent discovery post | **562 views, 1 RT, 1 like, 3 replies** | Journal |
| Apr 2 | Web3/x402 compliance thread | Unknown | Journal |
| Apr 2 | Audit trail thread | Unknown | Journal |
| Apr 2 | Scan teardown hook + self-reply | 36 views | Journal |
| Apr 2 | Aaron Levie (Box CEO) reply | Unknown | Journal |
| Apr 2 | Stephen Abbott Pugh multi-reply (beneficial ownership expert) | Unknown | Journal |
| **Apr 4** | "Know Your Agent" post | Reply from @rodrigo_humanos (verified) | Journal |

### Reddit

| Date | Content | Subreddit | Engagement | Source |
|------|---------|-----------|-----------|--------|
| **Mar 31** | "Google's AP2 + x402 — where does compliance fit?" | r/mcp | **784 views, 1 comment** | Notion SM-32 |
| **Apr 2** | **6 comments in axios supply chain threads** | r/webdev, r/devops, r/ClaudeAI, r/AI_Agents, r/sre, r/ClaudeCode | **Posted in threads with 3,100+ combined votes** | Journal |
| **Apr 4** | "Agent trust is getting fragmented fast" | r/AI_Agents | **621 views, 6 comments** | Journal |
| **Apr 4** | Trust boundary thread reply | r/LangChain | Engaged on hash chain architecture | Journal |

### Dev.to articles

| Date | Title | Reactions | Comments |
|------|-------|----------|----------|
| Mar 28 | Why Your AI Agent Keeps Failing in Production | 0 | 0 |
| Mar 30 | Your DeFi Agent Can't Read a Sanctions List | 0 | 0 |
| **Apr 1** | I Scanned 10 Developer Tools for Agent-Readiness | 0 | **2** |
| **Apr 2** | One API Call to Know If Your Dependency Is Safe | 0 | 0 |
| **Apr 4** | Add Counterparty Verification in 5 Minutes | 0 | 0 |
| **Apr 4** | Your DeFi Due Diligence Takes 20 API Calls | 0 | 0 |
| Apr 7 | The Agent Recommendation Layer is Frozen | 0 | 0 |

### Per-spike content correlation

**April 3-4 spike — events within ±3 days:**

| Date | Event | Platform | Likely impact |
|------|-------|----------|--------------|
| **Apr 2** | **6 comments in axios threads (3,100+ combined votes)** | **Reddit** | **HIGHEST — single strongest candidate** |
| **Apr 2** | Agent discovery post (562 views) + Box CEO reply | X | HIGH |
| Apr 2 | Stephen Abbott Pugh multi-reply (ownership expert) | X | MEDIUM |
| **Apr 3** | awesome-x402 PR merged | GitHub | MEDIUM |
| Apr 3 | coinbase/x402 PR opened | GitHub | LOW-MEDIUM |
| Apr 1 | "Agent Readiness" article (2 comments) | dev.to | LOW |
| Apr 2 | "Dependency Safety" article | dev.to | LOW |
| Apr 4 | r/AI_Agents post (621 views) | Reddit | Same-day — effect not cause |
| Apr 4 | 2 dev.to articles | dev.to | Same-day — effect not cause |

**March 30-31 signup burst — events within ±3 days:**

| Date | Event | Platform | Likely impact |
|------|-------|----------|--------------|
| **Mar 30** | 3 PRs merged (A2A, awesome-agents, awesome-fintech) | GitHub | HIGH for signups |
| **Mar 30** | Web3 compliance X thread (5 posts) | X | MEDIUM |
| Mar 30 | DeFi sanctions dev.to article | dev.to | LOW |
| **Mar 31** | r/mcp compliance post (784 views) | Reddit | MEDIUM |
| Mar 31 | composio-strale published to PyPI | PyPI | LOW |

---
## Task 5: Other Discrete Events

### CORS bug (critical context)

The CORS bug (X-Source and X-Capability headers missing from allowHeaders) was active from ~Apr 1 through Apr 6 evening. **Every browser user who visited the sandbox during the spike saw "Connection error" and bounced.** Only programmatic users (MCP/SDK via `node`) could complete calls. The true reach of the Apr 3-4 distribution cluster is unknown — browser traffic was silently blocked.

### Manual outreach

Journal Apr 4: "37 dormant IPs from earlier days still not contacted — outreach email sequence pending." No outreach was sent during the spike window. The spike is organic.

### Commercially relevant usage clusters (Apr 4)

From the journal, three distinct usage patterns were observed on the peak day:
- **BNPL competitive research:** Systematic scraping of Klarna, Afterpay, Scalapay, ViaBill, Zip.co, BillPay.de — a fintech researcher doing competitive analysis
- **Malaysian open data:** DNS + robots + sitemap + data catalogue walk of data.gov.my
- **Nordic Ventures investigation:** email-validate + dns-lookup on nordicventures.se

These are real developers with real use cases, not random noise.

---
## Task 6: Notion Journal Entries

| Date | Title | Type | Distribution? |
|------|-------|------|--------------|
| Mar 25 | Distribution Surfaces Audit & Sprint | session | **Yes** |
| Mar 26 | Distribution 2.0 Sprint | session | **Yes** — pivot to agent-native |
| Mar 29 | Digital Distribution Deep Strategy | session | **Yes** |
| Mar 29 | Stack Overflow Q&As — Batch 1 | session | **Yes** — content drafts |
| **Mar 30** | **Distribution Sprint — 2026-03-30** | **session** | **Yes — 8 PRs, composio-strale** |
| **Mar 31** | Distribution strategy deep dive — final state | session | **Yes — composio-strale + n8n published** |
| Mar 31 | r/mcp: AP2 + x402 compliance post | published | **Yes** |
| **Apr 2** | Content strategy execution | course-correction | **Yes — 6 Reddit comments, X 562 views** |
| **Apr 2** | Reddit distribution — 6 axios comments | session | **Yes — the key event** |
| Apr 3 | Distribution Surfaces Audit | session | **Yes — 24 surfaces checked** |
| Apr 3 | Distribution Surface Scan — New Opportunities | session | **Yes** |
| **Apr 4** | Reddit/X distribution, Glama TDQS, usage milestone | session | **Yes — records spike as it happens** |

---
## Task 7: Per-Spike Narratives

### April 3-4 (247 + 150 calls, 40 + 30 IPs) — Reddit-driven distribution cluster

On April 3, anonymous free-tier traffic jumped from 27 calls (Apr 2) to 150 calls from 30 IPs — a 5.6x increase. The next day hit 247 calls from 40 IPs, the platform's all-time record. Traffic was 85% programmatic (`node` user agents), consistent with developers discovering Strale via listings and installing the MCP server or SDK.

Within the ±3 day window, an unusually dense cluster of distribution events occurred. The **strongest single candidate** is the **6 Reddit comments posted on April 2** across axios supply chain vulnerability threads with combined existing engagement of 3,100+ upvotes (r/webdev 2.4K, r/devops 243, r/ClaudeAI 295, r/AI_Agents 26, r/sre 150, r/ClaudeCode 3). These comments led with technical insight (OSV.dev, deps.dev, OpenSSF Scorecard) without mentioning Strale — but Petter's Reddit profile links to Strale, and curious developers would follow the profile to the repo. The 24-hour delay between posting (Apr 2 midday) and spike start (Apr 3) matches Reddit's typical visibility curve for comments in established high-traffic threads.

The **second strongest candidate** is the **X engagement on April 2**, where the agent discovery post reached 562 views (best-performing tweet to date), and Stephen Abbott Pugh (beneficial ownership data expert) and Aaron Levie (Box CEO) replied — lending credibility via high-profile engagement.

Supporting events: awesome-x402 PR merged on Apr 3, coinbase/x402 PR opened on Apr 3 (generating notifications to Coinbase repo watchers), 4 dev.to articles published Apr 1-4, and 4 high-visibility registry PRs opened on Apr 1 (Docker, IBM, AWS, Agentic Community).

**Critical complication:** The CORS bug was active during the entire spike, blocking all browser-based sandbox users. The spike would likely have been significantly larger without this bug. Only MCP/SDK users could complete calls.

**Strongest contributing event type: Reddit comments in high-traffic threads.**
**Confidence: MEDIUM-HIGH.** The distribution cluster is the densest in the platform's history, the temporal correlation is strong, and the `node` UA pattern is consistent with developer discovery via profile-clicking on Reddit/GitHub.

### March 30-31 (3 external signups, minimal traffic) — Sprint-driven signup burst

On March 30, Strale executed its largest single-day distribution sprint: 8 new PRs submitted (3 merged same day: A2A partners, awesome-agents, awesome-fintech), composio-strale built, an X thread posted (Web3 compliance layer, 5 posts), and a dev.to article published. On March 31, the r/mcp post went live (784 views, 1 comment), awesome-fintech was confirmed merged, composio-strale was published to PyPI, and n8n-nodes-strale was published.

Three external users signed up: seronwind@gmail.com (Mar 30), raul.valdes@retailpivot.com (Mar 31), and astoncermott8177@outlook.com (Mar 31). All three have zero API calls ever.

Traffic was minimal: Mar 30 had only 1 anonymous IP, Mar 31 had 4 IPs. The sprint produced signups but not traffic — the opposite of the Apr 3-4 pattern. This suggests **PR merges and ecosystem listings drive signups** (developers find Strale in a list → click through → sign up) while **Reddit comments in high-traffic threads drive API usage** (developers find a relevant comment → follow the profile → install MCP → try it).

**Strongest contributing event type: PR merges into ecosystem listings.**
**Confidence: MEDIUM** for signup correlation, **HIGH** for activation failure.

### The activation gap (6 signups → 0 calls) — The real finding

This finding supersedes both spikes in strategic importance. Six real external users found Strale through the distribution strategy, signed up, received €2.00 in trial credits, and never made a single API call. The Apr 4 journal captures the diagnosis: "People are finding strale-mcp, using it, getting value, not signing up. Need to address this in the Show HN or outreach emails — friction point unknown until we talk to someone who used it without signing up."

The distribution strategy works for awareness. The funnel breaks at activation.

**Confidence: HIGH.** Direct database observation, not correlation.

---
## Data Quality Flags

1. **No referrer tracking for programmatic clients.** 85% of spike traffic sent no Origin/Referer headers. Structurally unavoidable for MCP/SDK. Add `discovery_source` parameter to MCP server initialization to capture this.

2. **No UTM tracking on signup links.** Adding `?ref=reddit-axios` or `?ref=awesome-x402` to signup URLs would enable direct attribution.

3. **CORS bug truncated the spike.** Active Apr 1-6, blocking all browser users. The true organic reach of the distribution cluster is unknown.

4. **Dev.to view counts unavailable via API.** Returns null. Manual dashboard check needed.

5. **X analytics not queryable.** Engagement numbers from manual journal observation only.

6. **Reddit engagement not systematically tracked.** The 6 axios comments' profile clicks, upvotes, and follow-on engagement are not captured.

7. **Stack Overflow and GitHub Gist publication status unknown.** Content was drafted but no evidence of posting.

8. **Recommendation: Add `discovery_source` field to users table and `source` parameter to signup URL.** This single instrumentation change would make future spike attribution 10x more actionable.
