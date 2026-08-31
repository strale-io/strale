# Strale — Technical Program and Remediation State

This is the high-level current map. Historical detail belongs in remediation docs, PRs/issues and archives.

# 1. Architecture thesis

The remediation program converged on:

> **One authority per business fact; many thin consumers.**

Repeated defects came from duplicated semantics:
- hash meanings;
- refusal matchers;
- routing statistics;
- manifest/write scope;
- stale agent-instruction copies.

Future work should consolidate authority rather than patch consumers separately.

# 2. Closed / accepted core work

Broadly closed/accepted:
- M0
- WP0–WP6
- WP7 with historical unique-index criterion formally superseded
- WP8
- WP11
- execution receipt phases 1–5
- production authorization boundary
- npm trusted publishing / MCP trust incident
- reachable dependency/supply-chain remediation
- major resource-safety family
- refusal classification consolidation
- routing estimator/async tests in #436/#438

# 3. Production authorization

Current model:
- autonomous/local DB role: read-only
- operator DML role: `strale_rw`
- production write credential: ephemeral `DATABASE_URL_WRITE`
- no standing write secret in repo/.env
- production runtime retains write access
- founder signing key intentionally absent unless explicitly activated

Lessons:
- a secret in a file is a secret the agent can read;
- same-user ACLs do not create a meaningful secret boundary;
- write authority must be ephemeral and explicit.

Preserve this model.

# 4. Package/distribution trust

npm trusted publishing is established via OIDC.

MCP incident:
- `strale-mcp@0.2.7` exposed an inappropriate internal/trust surface;
- fixed;
- `strale-mcp@0.2.8` smoke clean.

Standing rule:
- externally distributed package changes require production-contract smoke on the actual published artifact.

# 5. Execution receipt program

Implemented:
- `strale.execution.v1`
- JCS/RFC8785
- SHA-256 domain digest
- manifest digest / deploy commit identity
- immutable manifest snapshots
- explicit receipt epoch
- success/failure receipts
- v2 chain

Conceptual distinctions:
- receipt digest ≠ idempotency fingerprint
- receipt digest ≠ chain hash
- commitment ≠ external correctness proof
- no customer-facing signature/verification product yet

Receipt epoch:
2026-08-24 20:32:58.705669+00

# 6. WP10 — Durable Job Coordinator

Implemented:
- DB `job_schedule`
- code owns recurrence definition
- DB owns next-run timing
- leases
- watchdog/recovery

Historical defect:
- process boot effectively amplified schedule execution.

Final acceptance gate was deliberately dated 2026-08-30.

Before marking closed, verify the observation gate was actually run and recorded.

Do not force a restart.

# 7. WP12 — network/IP

**BLOCKED: VERIFY-IP**

Problem:
- leftmost XFF can be spoofable;
- Railway trusted-hop semantics unresolved.

Do not modify IP-based behavior until deployment semantics are established.

# 8. WP13 — dependency/supply chain

Reachability-driven remediation completed.

Key actionable paths fixed:
- `js-yaml` CPU DoS
- `sharp`/libvips reachable native-memory risk

Lesson:
- prioritize reachable dataflow, not scanner count/CVSS alone.

# 9. WP14 — legal/data policy

**BLOCKED / FOUNDER-LEGAL**

Remaining themes:
- legal text
- vendor/DPA role questions
- assent evidence
- publication approval
- VERIFY-LEGAL

Do not delegate legal judgment to autonomous coding agents.

# 10. WP15 — CI/runtime hygiene

Mostly done.

Residual:
- integration lane should create/drop its own uniquely named temporary DB rather than depend on a row-count/environment heuristic.

# 11. WP9 residual

Historical `transaction_id` linkage remains incomplete.

Do not rewrite historical facts simply to make linkage non-null.

Some solution-step fact consistency cleanup remains.

# 12. WP17 — next governance/attribution package

Receipts prove a state/manifest commitment changed.

Missing:
- who
- when
- under what authority

Recent operator-write incidents add a key requirement:
- prepared
- executed
- reconciled

must be distinct states.

A merged/closed issue must not become “accepted” while a required operator action is still unapplied.

Keep WP17 narrow.

# 13. WP16 — Discovery & Retrieval Authority

Not started.

Strategic next major product/technical program after remediation/governance residuals.

Opening phases:
- WP16.0 discovery containment
- WP16.1 frozen ~200-query benchmark

Do not change retrieval/ranking without baseline evidence.

# 14. Resource-safety family

Large sequence completed:
- x402 body cap
- 4 MiB image cap
- 8 MiB document cap
- streamed remote reads
- bounded base64
- explicit Browserless render limits
- shared `resource-limits`
- HTML fetch cap and cache byte budget
- robots/sitemap/API class limits
- AST guard
- PageSpeed report bound
- quadratic sitemap parser DoS fix
- non-2xx body drain hygiene
- refusal health-consumer alignment

Exactness:
- these bound relevant input/response materialization;
- they do not claim arbitrary downstream decoder or global concurrency memory is fully bounded.

Default posture now:
- maintain guards;
- fix concrete regressions;
- no open-ended new sweep.

# 15. Routing metadata (#436/#438)

Problems found:
- sync path has 15s transaction wall;
- previous latency metadata could be derived from polluted test timing;
- averages hid tail failures;
- null metadata routes sync;
- async path lacked direct tests.

Implemented:
- one routing policy authority
- p95 estimator from completed transactions
- minimum sample guard
- direct async tests
- one refusal matcher authority

Outstanding production reconciliation must be checked:
- page-speed-test desired `20000`
- company-news desired `28734`

PR #442 contains a guarded one-shot operator script.

Do not trust issue state; verify production.

# 16. Standing engineering rules

- money/compliance changes require discriminating regression tests;
- fail-before evidence must be real;
- absence-only guards need positive controls;
- junction tests matter;
- do not use real paid production calls just to test;
- production row = evidence of state, not policy;
- correctness of an action ≠ authority to execute;
- use dedicated worktrees;
- avoid shared-checkout branch switching;
- avoid repo-wide stash in concurrent worktree workflows;
- avoid destructive history-rewrite shortcuts that absorb unrelated changes;
- exact reviewed head needs CI evidence.
