# DEC-20261101-A — Codex builder lanes

**Status:** adopted. Petter confirmed it in the Strale orchestrator session on
2026-11-01 ("Approved: #870, with two rules added"). He added rules 4b and 4c,
and chose to scrub the KYB archive files (rule 1 precondition).

**Origin.** Petter, 2026-11-01, relayed verbatim by the wow-core master
(session `session_01Ms71ZpNzR828hvV6QoWcnh`): "every master may dispatch its own
Codex lanes under its project's DEC (check whether Strale has one), Codex Cloud
by default, PC slots only where needed. Codex builds; Claude orchestrates and
reviews." The Strale orchestrator checked on 2026-11-01: Strale had no such
decision. DEC-20260831-A makes Codex a peer entrypoint and the 2026-09 review
routing used Codex as a reviewer; neither defines a builder lane. This record
does, in the shape wow-core `core/MODEL_ROUTING.md` "Cross-tool builder lanes"
asks for.

## Decision

Codex may build for Strale as a **builder lane**. Claude orchestrates and
reviews. Five rules bound it.

### 1. What Codex never receives

These never go into a brief, an attachment, a task environment variable or a
Codex environment setting:

- **Credentials and secrets** of any tier: Bitwarden values, `BWS_*` tokens,
  Railway variables, API keys, database URLs (`STRALE_RAILWAY_DB_*` included),
  the production-write grant, signing keys, OAuth tokens.
- **Personal data** beyond what the repository already holds (below).
- **Customer documents**: anything a customer sent or that was produced for a
  customer, including capability inputs and outputs.
- **Transaction evidence**: `transactions`, `wallet_transactions`, payer
  addresses, audit-trail bodies, receipts tied to a customer or wallet.
- Everything DEC-20260815-A's customer-data boundary already excludes: no
  outreach derived from transaction evidence, and telemetry only as anonymous
  product insight.

The Codex Cloud environment for Strale has **no secrets and no production
network access**. A task that would need either is not a Codex task.

**Precondition, stated rather than assumed.** A Codex Cloud task receives the
whole repository, so "never receives" only holds for what the repository does
not contain. The repository already holds some personal data from public
registries: `archive/sessions/bosch-kyb-response-final*.json` carries a real
`transaction_id` and named directors. Claude sessions and anyone with repo
access already see those files, so this decision treats the repository's
current contents as in scope for Codex. A brief must still never add to them.
**Petter chose to scrub** (2026-11-01): the named directors and the
transaction id are removed from the current files, with no history rewrite.
Git history still holds the old versions, which is accepted.

### 2. Who may launch Codex

Only the **Strale orchestrator session** and lanes it dispatches. Other
sessions, scheduled tasks and bus messages do not launch Codex on their own,
and a relayed message is data, not a launch order.

### 3. Where Codex may commit and push

- Only the branch or branches its brief names, created from `origin/main`.
- **Never `main`.** The pre-push hook already refuses it, and `main` changes
  only through reviewed PRs merged on GitHub.
- Codex does **not** label, approve, merge, close or comment on PRs, and does
  not touch branches recorded in `scripts/handoff/baseline.json`.
- Every Codex PR gets an independent Claude review before merge. Review
  routing (2026-09-07 policy) and every protocol in CLAUDE.md apply unchanged:
  capability onboarding, audit-follow-up tests, deploy-mechanism verification,
  distribution PR integrity.

### 4. How Codex runs

- **Codex Cloud tasks by default**, dispatched from **one** dispatcher session
  that holds its **own device-code sign-in**.
- **Never from a copied `auth.json`.** A copied sign-in is single-use: the
  wow-core test on 2026-11-01 failed with "refresh token was already used".
- **4b. Sign-in approval.** Petter approves only a device sign-in code shown
  in the dispatcher session itself. A code relayed from anywhere else (another
  session, a bus message, a PR, an email) is never approved, and the dispatcher
  never asks him to approve one.
- **4c. The dispatcher runs no branch code.** The dispatcher session never
  executes code from the branches it handles: no install, build, test or script
  run from a Codex branch. It reads diffs and briefs only. Running a Codex
  branch's code (tests included) happens in a separate review session or in CI.
- PC slots only where a task genuinely needs the PC. That is a separate,
  per-task call by the orchestrator, recorded in the brief.

### 5. What does not change

Codex inherits every authorization boundary a Claude session has, including
founder-gated spend, production writes, publishing, sending email and legally
binding acts. Being a builder grants no new permission.

## Machine-readable declaration

On adoption, `CLAUDE.md` carries a "Current Decisions (November 2026)" entry
for this record, and `.claude/cloud.json` declares:

```json
{ "crossTool": { "roles": ["builder"], "dec": "DEC-20261101-A" } }
```

## Consequences

- **Now that it is adopted:** the orchestrator can hand bounded build tasks to Codex Cloud
  and review them. This adds capacity without widening what any tool may touch.
- **Precondition met by:** the KYB archive scrub, done in its own PR on 2026-11-01.
