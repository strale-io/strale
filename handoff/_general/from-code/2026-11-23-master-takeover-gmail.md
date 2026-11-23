Intent: take over as Strale master on account gmail for the wow-core takeover (session_01Ms71ZkQZK9DqQ5vJa1nVrW), resume from the repo and sync wow-core.

# 2026-11-23 Strale master takeover, account gmail

Session session_01Ms71Zm2azuCd9zTyGYEtHZ, started about 08:00 Swedish time.

- **Lease:** newest LEASE (2026-11-23 07:40 Swedish time, account `gmail`) names only `wow-core`. `lease --check --session <id> --parent session_01Ms71ZkQZK9DqQ5vJa1nVrW` answers active (account label match). Once the lease has a `strale` entry, check without `--parent`.
- **wow-core sync (comms profile):** run with wow-core's own `sync-to-project.ps1 -Profile comms` to c3cb9f0. Changed: `.claude/scripts/wow-hook.mjs` and `docs/FOUNDER_PROFILE.md` (outside models: any session may ask the model desk; Google AI Ultra added to the budget; hard stop 4 reworded to "no key in any prompt; customer, production data and mail only where the provider's terms fit"). wow-core's `scripts/wow-hook.test.mjs` passes 318/318 on that commit; both synced files are byte-identical to wow-core's.
- **Scheduled tasks:** none recreated. Strale keeps no Claude routines by design (`docs/company/RECURRING.yaml`).
- **Bus:** nothing new on `strale-planning` since 2026-11-06.
- **Today's daily run** already ran from the PC (PR #1103, `chore/checkin-2026-11-23`, owned by that session; not touched here). Its handoff on that branch, "Next session", is the queue this master takes up.

## Queue (from the 11-23 daily run, in its order)

1. Security: verify the x402 payment-dedup key against the Junk-folder report, before other builder work. Owner: this session.
2. weekly-drift: red four scheduled runs in a row; settle it. Owner: this session.
3. Platform guard for characters the database cannot store, in any tool's output (settle path).
4. `url-to-text` manifest PDF limitation, after #1103 merges.
5. Exercise #1100 in production with a key-holding session.
6. Inbox routine: two overdue follow-ups, DataCircle's credit request, the RIK draft.
7. Overdue weekly rows: `weekly-review`, `weekly-free-callers`, `weekly-listings`.

## Done in this session

- **Item 1, x402 payment key:** confirmed. One signed payment could be spelled several ways and got a new dedup key each time. `hashPaymentHeader` now keys on the signed object the facilitator verifies (EIP-3009 payer and nonce, or the Permit2 owner and nonce on v2; ambiguous payloads keep the old header-text key). Tests: `apps/api/src/lib/x402-payment-identity.test.ts`. Reviewed twice by separate read-only agents: the first sent it back, the second said GO; both rounds' fixes are in this change. Follow-ups the reviews raised, not in this change: payloads of an unexpected shape should be refused after verify rather than keyed on their text, `extractPayerAddress` should read the verified object, and the per-payer limits deserve a measured look. Details stay out of the public repo.
- **Item 2, weekly-drift:** the four red runs were one source down for a moment each week (a timeout, then a 503), not drift. The upstream-recordings check now retries a timeout, 5xx or 429 once after 20 s and lists a source that is down twice as unavailable without failing the run. Real changes (a different answer, 2xx to 4xx, oversize, expired recording, "fetch failed") still fail. Live run today: 32/32 without drift. Tests: `apps/api/test/record-upstream-retry.test.ts`.
- **Item 3, characters the database cannot store:** every tool result passes `getExecutor` (`apps/api/src/capabilities/index.ts`), which now removes U+0000 and unpaired surrogates from output and provenance (`apps/api/src/lib/storable-json.ts`), logs `capability-output-unstorable-chars-removed` with the slug, and records `provenance.unstorable_chars_removed`. Independent review GO; its low findings (key collision, `__proto__` key, an audit signal) are fixed here. Follow-up it raised: error messages (`transactions.error`, the fail audit, x402 solution step errors) are not cleaned yet, so a tool that throws an error quoting a NUL still fails that write.
- **Lease:** the strale entry now names this session (#7094066220); check without `--parent`. The old master's 6-hourly health check was paused by the wow-core master.
- All three are in PR #1104 with the comms sync. Its `ready-to-merge` label was refused by this session's classifier; raised as a gap on the bus.

Next authorised action: clean error messages the same way (follow-up to item 3), then queue item 4 once #1103 merges | Owner: Strale master | Blocker: #1104 label
