# Phase 5, criterion 1 — is `RAILWAY_GIT_COMMIT_SHA` present and full-length on every deploy path?

This gates criterion 2. Wiring `assertDeployIdentity()` on an unverified
assumption would let a deploy path we actually use refuse to boot.

**Answer: yes on every path we use — and the audit found a path we used six
times that carries no commit at all.** The refusal is still correct, and is
wired unweakened, because of what a refused boot actually costs (§3).

## 1. Method

Railway CLI, authenticated as `petter@strale.io`, project `Strale`,
environment `production`, service `strale`. Read-only.

`railway variables` does **not** list `RAILWAY_GIT_COMMIT_SHA`. That is not
evidence of absence — it is deployment-scoped, injected per deployment by the
git integration, not a service variable. `railway run` confirms this from the
other side: it injects service variables only, and reports the SHA unset
locally while the deployed process demonstrably has one (`/health` serves 12
characters of it). Neither command can answer the question; deployment metadata
can.

```
railway deployment list --limit 1000 --json
```

1000 deployments, `2026-03-09` → `2026-08-23`. Every deployment's `meta`
carries `commitHash`, `reason`, and `repo`.

## 2. Result

| deploy path (`meta.reason`) | deployments | with a full 40-hex `commitHash` |
|---|---|---|
| `deploy` | 975 | 969 |
| `redeploy` | 25 | **25** |

- **994 of 1000** carry a full 40-lowercase-hex commit. Length histogram is
  bimodal and degenerate: `{40: 994, 0: 6}`. Nothing is ever truncated — there
  is no 7-, 8- or 12-character case to defend against. The regex in
  `deploy-identity.ts` matches what the platform actually emits.
- **`redeploy` is directly sampled, 25 times, and is 25 for 25.** This is the
  path the criterion was most concerned about, and it is not an inference.
- Railway expresses **rollback as a redeploy of a prior deployment**: no
  distinct `rollback` reason appears in 1000 deployments, and a redeploy
  inherits the original deployment's `meta`. So the rollback path is covered by
  the redeploy evidence rather than assumed to be.

### The six that carry nothing

| created | status | reason | repo | commitHash |
|---|---|---|---|---|
| 2026-04-06T16:25:12Z | REMOVED | deploy | `null` | `null` |
| 2026-04-05T18:51:43Z | REMOVED | deploy | `null` | `null` |
| 2026-04-05T15:16:52Z | REMOVED | deploy | `null` | `null` |
| 2026-04-05T15:10:23Z | REMOVED | deploy | `null` | `null` |
| 2026-04-05T14:10:49Z | FAILED | deploy | `null` | `null` |
| 2026-04-05T13:55:02Z | FAILED | deploy | `null` | `null` |

`repo: null` — these did not originate from a git commit. They are CLI upload
deploys (`railway up` / `railway deployment up`), all on 2026-04-05/06. Four
reached `REMOVED`, which means they **succeeded and served production** until a
later deploy replaced them.

So the hypothetical in the Phase 4 review is not hypothetical. A deploy path
with no commit identity exists, is one CLI command away, and has carried
production traffic. Had the gate been wired then, those four would have refused
to boot.

## 3. Why the refusal is still wired, unweakened

Because a refused boot does not take production down. Verified from the
platform, not assumed:

- The service has a deploy healthcheck — `Path: /health/deep`,
  `Retry window: 20s`, read from the build log of the current deployment
  (`09d666c8`). A process that throws before `listen` never answers it.
- A failed healthcheck **fails the deploy, and Railway does not cut over**: the
  previous good deployment keeps serving. Independently confirmed on 2026-08-18
  (three consecutive `FAILED` deploys for ~40 minutes with production healthy)
  and 2026-08-23.
- A failed boot also emails two recipients via `alerting-sent`.

So the worst case of wiring the refusal is: **a CLI deploy does not go live,
production keeps serving the previous commit, and someone is emailed.** That is
the correct outcome. A CLI-uploaded build has no commit identity, so every
receipt it produced would record an implementation nobody can look up — which is
the failure the gate exists to prevent, and it would be silent.

The refusal is therefore not weakened. What it gets instead is an error message
that names this specific cause and its fix, so the operator is not left
guessing why a `railway up` will not start.

## 4. Consequences recorded elsewhere

**A stale comment in `index.ts` is now false and was corrected in this PR.** It
read "The Railway service currently has `healthcheckPath: null` (verified
2026-07-02), so nothing kills a slow boot", and then warned that if a
healthcheck were ever configured its timeout must exceed
`STARTUP_DB_RETRY_BUDGET_MS`. A healthcheck **has** since been configured, and
its 20s retry window is far below the 600s startup DB retry budget — so that
warning is live, not hypothetical: a deploy during database degradation is
killed at 20s and the budget never applies.

That is a **pre-existing** platform/config mismatch, not something this PR
introduces, and fixing it means changing the Railway healthcheck window rather
than the code. It is recorded here and left alone deliberately. What this PR
does check is that it adds no measurable boot time: `assertDeployIdentity()` is
a synchronous environment read and one regex, executed before any I/O.
