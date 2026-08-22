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

## 5. CLOSED — superuser credential rotated 2026-08-22

The boundary was designed-but-not-effective for a few hours, because copies of
the superuser credential were lying around where any session could read them.
Both halves are now closed.

**Cleanup.** The credential was found in **21 places**, not two: both sibling
worktree `.env` files, `~/.claude/settings.json` (**32** pre-approved Bash rules
with the URL inlined, one of them a `psql` command), its `.doctor-backup`, the
project `.claude/settings.json`, thirteen session transcripts and task outputs,
and two plain credential dumps in another session's temp scratch. Config entries
were removed, transcripts had the literal secret replaced with a placeholder,
dumps were deleted.

**Rotation.** Cleanup alone only makes a credential *unfindable*, never
*unusable*, and no sweep can promise it found every copy. So the password was
rotated under founder authorization:

- All five Railway variables (`strale.DATABASE_URL`, and the Postgres service's
  `DATABASE_URL`, `DATABASE_PUBLIC_URL`, `PGPASSWORD`, `POSTGRES_PASSWORD`)
  written **first** with `--skip-deploys`, so the running app was untouched and
  the database was never restarted.
- Then `ALTER ROLE postgres PASSWORD`. Postgres does not drop existing sessions
  on a password change, so the live pool kept serving.
- Then a single `strale` redeploy.
- The new password was generated in-process and handed to Railway over
  **stdin** — never on a command line, never in a file, never in a transcript.
  Automatic rollback was armed for every step after the `ALTER`; unused.

**Evidence it was non-disruptive:** `/health` returned `ok` on all 16 polls
across the cutover. Ten transactions and eleven `test_results` were written in
the four minutes spanning it. Because the old password no longer authenticates,
continued writes are themselves proof that the serving deployment is the new one.

**Evidence the old credential is dead:**

```
postgresql://postgres:<old>@metro.proxy.rlwy.net:51617/railway
  -> 28P01  password authentication failed for user "postgres"
```

Authentication attempt only; no write was attempted with it.

**Reachability after rotation:** zero files across `Projects`, `~/.claude`,
`Temp/claude` and `C:/tmp` contain the new password. All four worktree `.env`
files carry `strale_ro` only. No `DATABASE_URL`, `DATABASE_URL_WRITE`,
`PGPASSWORD`, `POSTGRES_PASSWORD` or `STRALE_FOUNDER_GRANT` in User or Machine
environment. A write attempted with the credentials a session actually holds
fails `25006`.

**Retrieving superuser access from now on:** Railway dashboard → Postgres
service → Variables. Those variables were updated as part of the cutover, so
what the dashboard shows is what works.

## 6. What this does not cover

The Railway runtime still connects as `postgres`, deliberately — the application
must keep its write capability. The boundary protects **operator and session
access**, not the application. A defect in application code can still write,
exactly as before.
