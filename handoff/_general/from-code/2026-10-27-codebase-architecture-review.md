Intent: independent, read-only review of Strale's code and architecture for Petter, delivered as research (`docs/research/2026-10-27-codebase-architecture-review.md`); no application code, production data or setting changed.

Mode: Full (review only). Branch `docs/codebase-architecture-review` from `origin/main` `db27bef`.

What was done:
- Six read-only evidence sweeps: architecture and money paths, deploy gap, maintainability, observability and self-healing, text drift, tests and security. The author spot-checked their claims in code, and a fresh read-only reviewer then challenged the draft. Its 13 findings were applied: a stale live example, one false claim (`lib/limitation-repair.ts` is used), an overstated pool-stall impact, CHARTER authority labels, and count corrections.
- Public GETs only to `api.strale.io` (`/health`, `/v1/capabilities`, `/v1/platform/facts`, `/openapi.json`, `/v1/public/ops/limitations/...`). No paid calls, no writes.
- Unit suite run locally at `db27bef`: 0 failures. Integration files were skipped because they need a database; CI runs them. No receipt was written, so the report states no bare counts.

Headline findings (details and evidence in the report):
- Nothing automatic verifies that a merge reached production. At about 13:30 Swedish time on 2026-10-27, `/health` served `7935b24` while `main` was at `db27bef`. By 14:11 the next merge (`28d11b2`) was served and had hidden the gap.
- CI never builds or boots the real image.
- A fresh database cannot boot: `transactions_integrity_hash_idx` is created only by block 0030, which skips itself after `drizzle-kit push`.
- The sync paid path holds a pooled connection and the wallet row lock across the vendor call. `timeout_seconds` is parsed and unused (`routes/do.ts:669`).
- No log sink, and no external dead-man check.
- 260 of 298 public tools serve limitations that differ from the manifests. This is the #756 backfill that has not run yet, and no guard compares the two.
- Guaranteed fields are never checked on real traffic.
- Per-call vendor and LLM cost are not recorded.

Open:
- Ranked action list in §10 of the report. Items needing Petter: a Railway API token for automatic redeploy (new production credential), a paid log sink (if it costs money), and publishing new package versions.
- The `db27bef` deploy failure is owned by another session. This review only maps the gap.
- The handoff gate reports three merged remote branches from other sessions (`chore/nta-env-set-in-railway`, `docs/email-phone-validation-copy`, `docs/ops-delegation`). Not deleted here, because this session did not create them.

[BACKFILL] Journal: no Notion entry written from this session.
