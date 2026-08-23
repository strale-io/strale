# Execution receipt, Phase 4 — post-deploy reconciliation

**Status:** `MERGED_DEPLOYED_NOT_YET_ACTIVE`. **Not** accepted, and not active: no
rail produces receipt state, so every artifact below is present and inert.

**Merged:** PR #380, squash `bd539ecf14e1643a24a655c3c86641b908192302`.
**Deployed:** `GET /health` → `{"status":"ok","commit":"bd539ecf14e1"}` — the
served artifact, not a deploy log line (DEC-20260504-C).
**Reconciled:** 2026-08-23 18:38 UTC, read-only against production.

---

## 1. Migration artifacts, by database object

Not by deploy logs. Blocks 0106, 0107 and 0108 self-verify at boot, but a block
reporting success is still a log line; these are the objects themselves.

| artifact | check | result |
|---|---|---|
| snapshot table | `to_regclass('public.execution_manifest_snapshots')` | present |
| receipt columns | `information_schema.columns` | **9 of 9** |
| CHECK constraints | `pg_constraint` where `contype='c'` | **11** (8 on `transactions`, 3 on the snapshot table) |

### Triggers — all four present and ENABLED

| trigger | table | `tgenabled` |
|---|---|---|
| `execution_manifest_snapshots_no_update` | snapshots | `O` |
| `execution_manifest_snapshots_no_delete` | snapshots | `O` |
| `execution_manifest_snapshots_no_truncate_trg` | snapshots | `O` |
| `transactions_receipt_state_transitions_trg` | transactions | `O` |

**A note on how this was read, because the first reading was wrong.** The
initial query wrapped `tgenabled` in a `CASE … THEN 'enabled' … ELSE tgenabled`,
and Postgres unified the branches to `tgenabled`'s own `"char"` type — so
`'enabled'` was silently truncated to `'e'` and `'DISABLED'` would have been
truncated to `'D'`, which is *also* the raw value for a genuinely disabled
trigger. The two states were indistinguishable in the output. Re-read with an
explicit `tgenabled::text` and separate boolean comparisons.

Eleven CHECK constraints report `convalidated = false`. That is expected and
deliberate: they were added `NOT VALID` so the boot path does not scan a
921k-row table. New writes are checked from the moment they exist.

## 2. Production carries no receipt state

| population | rows |
|---|---|
| `receipt_status IS NOT NULL` | **0** |
| `integrity_payload_version IS NOT NULL` | **0** |
| `execution_manifest_snapshots` | **0** |
| chained rows (`integrity_hash IS NOT NULL`) | 887,003 |

Every chained row is v1, because `integrity_payload_version` is NULL on all of
them and NULL *means* v1. Nothing has changed rule.

## 3. Historical v1 verification is unchanged — verified end to end

The strongest check available, and the one that matters: three chained rows
verified through the **deployed** `/v1/verify/:id`, which now selects the
payload rule via `chainVersionOf`:

| transaction | `chain_seq` | version | result |
|---|---|---|---|
| `f2c82d58…` | 22742 | NULL | `hash_valid: true` |
| `1eeed93d…` | 22741 | NULL | `hash_valid: true` |
| `012d3922…` | 22740 | NULL | `hash_valid: true` |

This is the property the whole chain-versioning design exists to protect. The
verifier changed in this deploy; the answers did not.

## 4. No rail is producing receipt state

- No file outside `lib/receipt/` and its tests imports any receipt module on
  `main` — checked against `origin/main`, not the local tree.
- `assertDeployIdentity` has **zero** callers in `index.ts`.
- The chain worker's behaviour is unchanged for any row without receipt state,
  which is every row.

So the deploy is behaviourally inert. That is a stronger statement than "nothing
calls the receipt modules": the worker *did* change, and it is inert because no
row carries the state its new branches read.

---

## Why this is not ACCEPTED

Acceptance would mean the feature works. Nothing produces a receipt yet, so
there is nothing to accept. Phase 4 delivered persistence, two authorities and
chain-v2 correctness, proven against a real database across four adversarial
review rounds — and then deliberately stopped short of wiring.

**The epoch is not yet structurally real.** A transaction inserted right now is
byte-identical to one from April: `receipt_status` NULL, `integrity_payload_version`
NULL. `chain_v2_has_receipt_state` constrains only rows that *declare* v2, so it
is vacuous for rows declaring nothing — which is all of them. That closes in
Phase 5, when every insert sets a status.

## Carried into Phase 5 as acceptance criteria

Not residual risks. Residual risks get read once; acceptance criteria get
checked:

1. `RAILWAY_GIT_COMMIT_SHA` confirmed present and full-length on **every** deploy
   path we use, including rollback and redeploy — before wiring the boot gate,
   because a non-git deploy would then refuse to boot.
2. `assertDeployIdentity()` wired before readiness/listen.
3. Receipt lifecycle wired into every rail that creates a customer transaction.
4. Every post-integration transaction explicitly gets receipt state — this is
   where the epoch becomes structurally real.
5. A `redacted` receipt-state presentation, so a digest whose committed content
   has been erased is not described as recomputable.
6. The retry sweeper, with bounded attempts, backoff, and visible terminal
   failure.
7. The `CapabilityDeclarationSource` parity guard.
8. A decision, derived from execution semantics, on `data_update_cycle_days`,
   `dataset_last_updated` and `name`.
9. A decision, with reasoning, on a FK from `transactions.receipt_manifest_digest`
   to the snapshot table.
10. Per-rail behavioural tests proving the hashed semantic result or error is
    exactly what the caller receives.

## Review record

| round | head | verdict |
|---|---|---|
| 1 | `885ca00` | FAIL — 25 attacks, **all 25 succeeded**; 6 blocking |
| 2 | `6534d1b` | FAIL — 4 blocking, incl. the repo suite red at that head |
| 3 | `7ee63a5` | FAIL — 1 blocking, introduced *by* a round-2 fix |
| 4 | `1d8cb81` | **PASS** |

The round-3 finding is the one to carry forward. Adding a column to the
transition trigger's frozen list collided with the chain worker writing exactly
that column, and **one receipt-bearing row would have halted the tamper-evident
chain for every transaction in the system, permanently** — while the full repo
suite was green. Both halves were tested; their junction was not. The lesson for
Phase 5 is direct: wiring a rail creates new junctions, and a junction is where
two correct components disagree.
