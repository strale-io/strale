---
doc_type: research
type: product
topic: claude-connector-directory-requirements
question: What does Anthropic's Claude connector directory require of a remote MCP server today, and where does Strale's connector stand against each requirement?
date: "2026-10-29"
status: current
sources:
  - https://claude.com/docs/connectors/directory.md
  - https://claude.com/docs/connectors/building/submission.md
  - https://claude.com/docs/connectors/building/review-criteria.md
  - https://claude.com/docs/connectors/building/authentication.md
  - https://claude.com/docs/connectors/building/lazy-authentication.md
  - https://claude.com/docs/connectors/building/testing.md
  - https://claude.com/docs/connectors/verification.md
  - https://claude.com/docs/directory/publish.md
  - https://claude.com/docs/connectors/building/directory-vs-custom.md
  - https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy
  - https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms
  - https://claude.ai/oauth/claude-code-client-metadata
  - docs/research/2026-10-27-distribution-strategy.md
  - apps/api/src/routes/mcp.ts
  - apps/api/src/routes/oauth.ts
  - apps/api/src/lib/oauth.ts
  - apps/api/src/lib/oauth-clients.ts
  - packages/mcp-server/src/tools.ts
decisions:
  - DEC-20261027-B
---

# Claude connector directory: requirements and Strale's position

Read on 2026-10-29 between 09:45 and 10:00 Swedish time, from the pages
listed above (fetched as Markdown from claude.com/docs; the two policy
articles from support.claude.com). This is the evidence behind distribution
track T5 (§8 D4 of the distribution strategy). It is not authority; the
submission is approved by DEC-20261027-B §9 item 2, with the terms and the
paid plan left to Petter.

## What the directory is

- One catalog for claude.ai, Desktop, mobile, Claude Code and Cowork.
- Ranking is by usage. Every listed connector is eligible for
  **Suggested Connectors**: Claude recommends it in the chat when relevant.
- A submission is scanned automatically and listed as **Community** by
  default. Anthropic may later move a widely used listing to **Verified**
  review, a functional test of each tool. No action is needed for that.
- Submissions go through the developer portal at claude.ai/directory/manage.
  Anyone on a paid Claude plan can submit; on Team or Enterprise plans, an
  Owner submits.
- Escalations go to mcp-review@anthropic.com.

## Requirements, and where Strale stands

| Requirement (source) | Strale's connector (`https://api.strale.io/mcp/connector`) |
|---|---|
| Remote server reachable over HTTPS (submission) | Yes. Streamable HTTP, stateless. |
| Every tool has a `title` and `readOnlyHint` or `destructiveHint` (submission, policy §5E) | Yes. 8 tools. `strale_execute` is marked destructive because a paid call spends from the wallet. Tested in `mcp-connector.test.ts` for both `/mcp` and `/mcp/connector`. |
| Tool names 64 characters or fewer (policy §5C) | Yes, tested. |
| Read and write split; no catch-all tool that takes an HTTP method (review criteria) | `strale_execute` runs any tool by slug, but every Strale tool is a lookup. None writes the user's data, and there is no method parameter. Risk: a reviewer may still read it as a catch-all. Its description now names the schema source and links the API docs, which the review criteria require of "custom query tools". |
| Narrow, accurate descriptions; no prompt-injection patterns (review criteria, policy §2) | Connector descriptions say what each tool does and when to use it. In connector mode, results carry no `next_steps` that tell Claude to call more tools. |
| OAuth 2.0 for authenticated services (submission, policy §5D) | Built: OAuth 2.1 authorization server at api.strale.io (see below). |
| No-auth tools may coexist ("lazy authentication") | Yes. Connect, list, search, read notes, and the free tools run without an account. A paid call or a balance read without a token gets HTTP 401 with `WWW-Authenticate` before the MCP SDK runs, which is the only signal that makes Claude show its Connect card. |
| No software that transfers money or crypto; "we do not generally allow cryptocurrency software" (policy §4A, review criteria) | The connector leaves out the on-chain counterparty tool, every `web3` tool, the crypto address validators and `crypto-price`, and offers no x402/USDC hand-off. Paid calls debit a prepaid EUR wallet that the user tops up outside Claude, which is human-in-the-loop. The broad `/mcp` server is unchanged. |
| High-risk use cases need human-in-the-loop and disclosure (policy §1A–B) | Sanctions and PEP screening may count as high-risk finance use. Listing text must say that results are screening signals for a person to review. See the listing file. |
| Do not collect conversation data beyond the tool's function (policy §1E, §1G) | Tools receive only their arguments. The funnel logs record tool names and client names, not prompts. |
| Privacy policy, support contact, documentation (policy §3A–C, submission) | Privacy policy: https://strale.dev/privacy. Docs: `docs/claude-connector.md` (public on GitHub). Support: hello@strale.io. |
| Reviewer test account with sample data (policy §3D, submission) | Not yet. It needs a funded Strale account. That is a founder act (see the founder ask). |
| At least three working example prompts (policy §3E) | In `docs/claude-connector-listing.md`. |
| Tested as a custom connector in Claude before submitting (submission, testing) | Not yet. It needs a Claude account, so Petter does it at submission time. A curl and MCP-SDK test suite covers the same paths. |
| Accept the Software Directory Terms, plus seven acknowledgements including "financial transactions" (submission step 9) | Petter, at submission (DEC-20261027-B §9 item 2). |
| Paid Claude plan (directory, publish) | Petter. |

## Claude's OAuth client, and what the server does for it

| Claude's requirement (authentication, lazy-authentication) | Implementation |
|---|---|
| A 401 with `WWW-Authenticate: Bearer resource_metadata=...` starts sign-in; a 200 with `isError` does not | `connectorAuthGate` in `apps/api/src/routes/mcp.ts` |
| RFC 9728 protected resource metadata; `resource` equals the MCP URL exactly; first `authorization_servers` entry is used | `/.well-known/oauth-protected-resource/mcp/connector`, with `resource` `https://api.strale.io/mcp/connector` and issuer `https://api.strale.io` |
| RFC 8414 server metadata, reachable from Anthropic's egress range 160.79.104.0/21 | `/.well-known/oauth-authorization-server` |
| Client registration: CIMD when the metadata advertises `client_id_metadata_document_supported: true` and `none` auth, else DCR | Both. CIMD documents are fetched only from claude.ai and claude.com, over HTTPS, without redirects, capped at 16 KB. DCR accepts only Claude's hosted callback and loopback redirect URIs. |
| PKCE S256 on every request; advertise `code_challenge_methods_supported: ["S256"]` | S256 only; anything else is refused |
| Hosted callback `https://claude.ai/api/mcp/auth_callback`; Claude Code loopback on any port for `localhost` and `127.0.0.1` | Exact match, except loopback ignores the port |
| Token endpoint takes `application/x-www-form-urlencoded`; RFC 6749 errors, `invalid_grant` for a dead refresh token | Yes |
| Rotate refresh tokens for public clients | Yes, with reuse detection: a rotated token presented again revokes the whole grant |
| 10 s for discovery and token endpoints, 30 s for refresh | Plain database work, no upstream calls |
| Consent screen shows the redirect host; extra warning for loopback | Yes. A CIMD client is named by its host, never its self-chosen name. |
| A `client_credentials` grant isn't supported | Not offered |

**How sign-in maps to Strale accounts.** Strale has no passwords. On the
consent page the user pastes an API key once. Strale checks it and stores
nothing from it. At the code exchange the grant gets its own additional key,
"Claude connector", capped at €5 an hour. If the pasted key was already an
additional key, the grant uses that key and its own caps instead. The
access token acts as that key, so it can run tools and read the balance and
transactions. It cannot top up the wallet or manage keys, because those
need the primary key. Revoking the key ends the grant.

## Risks found while reading

1. **Shared egress IPs.** Every Claude user reaches the server from one /21.
   Anonymous free calls therefore share the per-IP monthly free allowance
   (`STATIC_FACTS.free_tier_monthly_limit`), and the MCP route's 60/min per-IP
   limit would have throttled all Claude users together. The connector now
   has its own 600/min bucket. A user with a connected account is not limited
   by the anonymous allowance, and the connector's free-tier message tells
   them to connect. Changing the anonymous allowance itself is a pricing
   decision (§9 item 5), so it is not made here.
2. **"Cryptocurrency software."** Strale's main payment rail is x402 in USDC.
   The connector never mentions it, but a reviewer looking at strale.dev
   will see it. If the listing is refused on that ground, the reply names
   the connector's crypto-free tool set.
3. **Catch-all execute tool.** If review rejects `strale_execute` as a
   catch-all, the fallback is typed per-job tools, like the narrow D7 entry
   points, for the connector.
4. **CIMD host list.** Claude's hosted-app CIMD URL is not published.
   Claude Code's is on claude.ai. If the hosted apps use another host, they
   fall back to DCR, which still works. The custom-connector test at
   submission confirms which path Claude takes.

## Open follow-ups from the independent review (2026-10-29)

Fixed before merge: separate rate-limit buckets for the OAuth endpoints and
discovery documents; a limit and a miss cache on the consent page's CIMD
fetch, with no query strings in client IDs; a reconnect replaces the earlier
connection and its key; a 30-second grace for concurrent refreshes; web3
bundles refused; a dead API key on the connector gets the reconnect
challenge. Still open, none blocking submission:

- No retention pruning yet for `oauth_tokens`, used codes or unused DCR
  clients. At launch volumes this is two token rows per connection per hour.
  Add a self-throttled pruning rule (DEC-20260504-B) before volume grows.
- OAuth use does not update `api_keys.last_used_at`, so a "Claude connector"
  key reads as unused in `GET /v1/api-keys`.
- A reconnect replaces the earlier connection only for the same client ID.
  CIMD IDs are stable, so this covers Claude; DCR clients get a new ID each
  time.

## Thresholds to measure after listing (§8 D4)

- Listed: yes or no, within **45 days** of submission.
- Weekly tool calls from Claude clients, read from `discovery_hits`
  `/mcp/connector:tools/call:*` rows, with client names from
  `/mcp/connector:initialize`: success at **≥ 20 a week by day 90**.
- Payers whose first touch is `claude-dir`: reported weekly.
- **Kill:** refused, or **under 5 calls a week 30 days after listing**. Then
  stop and record the kill.

## Evidence

Tests and the seven mutation checks on the OAuth and 401 paths:
`archive/receipts/2026-10-29-test-run-claude-connector-oauth.json`.
