# Machine-surface claims audit — Readiness P0 (2026-08-12)

Claim-extraction pass over the surfaces machine buyers read, checked against live
production behavior. Fixes belong to P1 unless noted; this file is the evidence.

## Defects found

### 1. llms.txt documents `max_price_cents` as optional; production requires it
- **Surface:** `strale.dev/llms.txt` (static, strale-frontend `public/llms.txt`) — "max_price_cents … // Optional: budget cap".
- **Reality:** `POST /v1/do` returns 400 `"'max_price_cents' is required and must be a positive integer."` (verified live 2026-08-12, email-validate call).
- **Impact:** an agent following the doc's own example flow gets a 400 on its first call. This is the exact "first five minutes" failure the machine-legibility principle targets.
- **Fix options (P1):** correct the doc, or make the field genuinely optional (default = capability price). Making it optional is friendlier to agents but changes the documented contract — product decision, flag to Petter in the P1 batch. The doc fix is unconditional either way.
- Note: the dynamic `api.strale.io/llms.txt` does not carry the wrong claim (different content) — the static and dynamic files have drifted apart, which is itself a finding: two surfaces, one name, different content.

### 2. x402 catalog emits float-artifact prices
- **Surface:** `GET /x402/catalog` → `"price_usd": 0.21600000000000003` (sanctions-check; float multiplication artifact).
- **Impact:** machine-readable money field that isn't a clean number; violates the wire-shape rule's intent (canonical machine-readable values). Agents comparing/displaying prices inherit the artifact.
- **Fix (P1):** compute in integer micro-units or round explicitly (e.g. `Math.round(x*10000)/10000` or emit a string). Audit the same computation in `/.well-known/x402.json` and the 402 paymentRequirements themselves (settlement amounts must already be exact on-chain units — verify).

## Checked and consistent

- `agent-card.json` "295+ capabilities … 25 countries" ↔ `/v1/platform/facts` `active_visible: 295`, `company_data_active` = 25 entries. Consistent today (verify it's computed, not hardcoded, in P1).
- `api.strale.io` serves `/health` 200, llms.txt, x402 catalog — the domain llms.txt directs agents to is real.
- x402 catalog: 260 capabilities + 91 solutions = x402-enabled subset of 295 active — expected (x402_enabled flag), not drift.
- llms.txt request/response shape documentation (`inputs` plural, two-tier response) matches live behavior.
- Free-tier list: facts endpoint enumerates 11 slugs; llms.txt does not hardcode a count (good — count-free phrasing per drift rules).
- sanctions-check example price "~$0.22 at time of writing" vs actual $0.216 — hedged and pointed at the catalog; acceptable.

## Follow-ups filed for P1

1. Fix static llms.txt `max_price_cents` claim (frontend repo) + decide optional-vs-required (Petter).
2. Fix float prices in x402 catalog + verify settlement amounts unaffected.
3. Reconcile static vs dynamic llms.txt (one source of truth; static should embed a pointer, not a fork).
4. Verify agent-card counts are computed from the DB, not hardcoded.
