# Credential architecture, and the two steps only Petter can do

Companion to `docs/incidents/2026-08-22-production-authorization-failure.md`.
This is the operational half: what exists in production now, and what is
deliberately missing.

---

## 1. What was provisioned (done, permanent)

Three Postgres login roles. Before 2026-08-22 there was one.

| Role | Used by | Privileges | Can write? |
|---|---|---|---|
| `postgres` | **Railway application runtime only** | superuser, **unchanged** | yes |
| `strale_ro` | local `DATABASE_URL` — every autonomous session | `CONNECT`, `USAGE` on `public`, `SELECT` on 31 relations. No `CREATE`. Role-level `default_transaction_read_only=on`. | **no** |
| `strale_rw` | operator writes, credential supplied per-command | `SELECT/INSERT/UPDATE/DELETE` on `public`, `USAGE,SELECT` on sequences. Not table owner, no `CREATE`, no DDL. | yes, DML only |

`strale_ro` is refused twice over, independently — measured, not asserted:

```
25006  cannot execute UPDATE in a read-only transaction   <- role-level setting
42501  permission denied for table capabilities           <- still refused after
                                                             SET default_transaction_read_only = off
```

The second one is the one that matters. A session that discovers the setting and
turns it off gets nowhere, because the grants were never there.

`.env` now holds `DATABASE_URL` pointing at `strale_ro` and **no superuser
credential at all**. Retrieve the superuser URL from the Railway dashboard
(Postgres service → Variables) if administrative work is needed.

## 2. What is deliberately NOT on this machine

**No `strale_rw` password. No founder signing key.** Both were created during
provisioning and both were then destroyed, because a check at the end of the work
asked the only question that matters:

> Can an ordinary Claude Code session, with the credentials it actually receives,
> still mutate production?

With `.env.operator-write` on disk the answer was **yes** — a session reads files,
so a credential in a file is a credential the session has. The `production-authority`
gate would have been decoration. With `%USERPROFILE%\.strale-founder.key` on disk
the answer was **worse than yes**: a session could have *minted its own founder
grants*, which is precisely the property the whole model exists to deny.

An ACL does not help. The agent runs as Petter's own account, so anything that
account can read, a session can read. On a single-user machine there is no file
location that is secret from the agent. That is not a bug to engineer around; it
is the shape of the problem, and the only honest response is to keep those two
secrets somewhere the agent has no access to at all.

So the current state is **fail-closed and honest**:

- `FOUNDER_GRANT_PUBLIC_KEY_PEM` is `""`, so every founder-gated action refuses.
- No `DATABASE_URL_WRITE` exists anywhere, so every delegated write refuses too.
- Both refusals are covered by tests.

## 3. Step one — set the write password (2 minutes, Petter only)

Using the superuser URL from the Railway dashboard:

```sql
ALTER ROLE strale_rw PASSWORD '<pick one, store it in your password manager>';
```

Do **not** write it into `.env`, `.env.operator-write`, or any file in this
repository. Paste it from the password manager when a delegated write is needed:

```powershell
$env:DATABASE_URL_WRITE = 'postgresql://strale_rw:<pw>@metro.proxy.rlwy.net:51617/railway?sslmode=disable'
npx tsx apps/api/scripts/reset-circuit-breaker.ts vat-validate
$env:DATABASE_URL_WRITE = $null
```

`.env.operator-write.template` in the repo root documents this shape. The real
file is git-ignored and should stay absent.

**The trade-off, stated plainly.** This means delegated writes are no longer
unattended: a session cannot run `reset-circuit-breaker.ts` on its own any more.
Your instruction asked both for autonomous delegated writes *and* for a session
to be unable to obtain write credentials, and on a single-user machine those two
are mutually exclusive. I chose the security side because your closing review
question set that bar. If you would rather have the autonomy, put the credential
in `.env.operator-write` and accept that the honest answer to that question
becomes "yes, via a file read" — the gates still record authority and still block
undelegated purposes, but they stop being a barrier to a determined session.

## 4. Step two — generate the founder keypair off this machine (Petter only)

On a device no Claude session runs on — another laptop, a phone with a shell, a
VM:

```bash
node apps/api/scripts/gen-founder-keypair.mjs --generate --out ~/.strale-founder
```

Keep `~/.strale-founder.key` there. Commit only the printed public key into
`FOUNDER_GRANT_PUBLIC_KEY_PEM` in `apps/api/src/lib/production-authority.ts`.
The test asserting the constant is empty flips in that same commit, so installing
a key is visible in a diff rather than silent.

Then, to authorise one founder-gated action:

```bash
# on the machine holding the private key
node apps/api/scripts/gen-founder-keypair.mjs --sign \
  --key ~/.strale-founder.key --purpose wallet_topup --ttl 300
```

```powershell
# on this machine, for one command
$env:STRALE_FOUNDER_GRANT = 'v1.…'
$env:DATABASE_URL_WRITE   = 'postgresql://strale_rw:…'
npx tsx apps/api/scripts/topup-test.ts --user <uuid> --amount 100 --i-know-this-is-not-local
$env:STRALE_FOUNDER_GRANT = $null
$env:DATABASE_URL_WRITE   = $null
```

**Never paste a grant into a Claude prompt**, and never leave either variable set
in a shell a session inherits.

### Grant binding, verified cryptographically on 2026-08-22

Verified against a real keypair before it was destroyed — signature checks only,
no business mutation:

| Case | Result |
|---|---|
| correct purpose, in date | verifies → `FOUNDER_GATED` authority |
| different purpose | refused — *"authorises 'wallet_topup', not 'seed_sellable_solutions'"* |
| expired (1s TTL, checked at 1.5s) | refused — *"expired at …"* |
| valid grant, no write credential | refused — *"No production write credential is available"* |
| grant signed by a different key | refused — signature does not verify |
| any signing-key variable in the process | refused before verification starts |

The purpose is inside the signed bytes, so relabelling breaks the signature
rather than failing a later string compare. The signed payload is pipe-joined
while the token is dot-joined, so a signature cannot be re-segmented into a
different `(id, purpose, expiry)` triple.

## 5. STILL OPEN — stale superuser credentials in sibling worktrees

**This is why the closing review question currently answers FAIL, and it is the
last thing standing between the current state and a real boundary.**

`.env` was cleaned in the main checkout and in `strale-wt-authz`. Two other
worktrees still hold the **superuser** URL:

```
C:/Users/pette/Projects/strale-wt-checkin   docs/checkin-2026-08-22   .env: SUPERUSER
C:/Users/pette/Projects/strale-wt-ops       ops/daily-run-and-ceo-brief  .env: SUPERUSER
```

Any session on this machine can read either file and connect as `postgres`,
which bypasses `strale_ro`, `strale_rw`, the authority module and every guard in
one step. A boundary with a copy of the master key lying beside it is not a
boundary.

I did not edit them. They belong to other live sessions, and rewriting another
session's environment mid-run is the shared-checkout failure class that caused
the 2026-08-22 incident in the first place. Two ways to close it:

1. **Per-worktree (safe, no coordination):** replace the `DATABASE_URL` line in
   each with the `strale_ro` URL from the main checkout's `.env`. Do this when
   those sessions are idle. `docs/checkin-*` is a documentation branch and
   almost certainly needs no write access; `ops/daily-run-*` should be checked
   with whoever is running it.
2. **Rotate (closes every copy at once, including ones nobody remembers):**
   `ALTER ROLE postgres PASSWORD '<new>'` and update Railway's `DATABASE_URL`
   variable. This touches Railway's application credential, which the
   provisioning instruction explicitly ruled out, so it needs Petter's decision
   rather than an autonomous one.

Until one of these is done, treat the credential boundary as *designed and
provisioned but not yet effective*.

## 6. What this does not cover

The Railway runtime still connects as `postgres`, deliberately — the application
must keep its write capability. The boundary protects **operator and session
access**, not the application. A defect in application code can still write,
exactly as before.
