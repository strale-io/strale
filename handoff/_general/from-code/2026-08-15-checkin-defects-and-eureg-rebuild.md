# Intent: pick up the morning check-in's defect list — input-contract failures, the IBAN "refusal", the stuck breaker — and fix what's real

Session 2026-08-15 afternoon. Two PRs opened, two prod DB corrections applied and
verified, one capability quarantined and rebuilt. Another session owned the
measurement-module thread in parallel (committed `a445e09` to PR #251 mid-session);
I deliberately stayed off it.

## Corrections to the morning check-in's claims

Two of its four headline findings were mis-framed — worth knowing before they get
repeated:

1. **"9 paying attempts failed on tech-stack-detect because callers couldn't tell
   what input it wanted"** — the recurring 12/day empty-input failures are
   `system@strale.internal` (negative tests doing their job). The real customer
   damage was smaller: a handful of x402 empty-input calls (Aug 10–11). The
   *defect was still real* — see below — but it's "a few paying agents", not 9/week.
2. **"We refused a request to validate a German IBAN (free capability)"** — matching
   worked fine. The rows are `failure_type=missing_fields`: the caller put the IBAN
   in the task string, never in `inputs.iban`, retried 3× over 17 minutes against a
   400 that named the missing field, and gave up. It's an error-UX defect, not a
   matching bug.

## What was actually wrong, and what shipped

### 1. Input-contract drift: manifest `anyOf` never reached prod (FIXED IN PROD)
`tech-stack-detect`, `image-to-text`, `us-company-data` all declare either/or input
contracts (`anyOf`) in their manifests that the prod DB rows lacked — so every
agent-facing surface (MCP tool schema, /v1/capabilities, x402 catalog) said
"nothing required", `{}` sailed through to the executor, and paying callers got a
runtime refusal the schema said couldn't happen. `us-company-data`'s DB
input_schema was additionally a **double-encoded JSON string** serving zero
properties. All three synced via `sync-manifest-canonical-to-db.ts` and verified on
the public API — empty-input calls now 400 **pre-charge** with the full contract in
the body. Live now, no deploy needed. (tech-stack-detect's manifest first adopted
the DB's newer description/output example so the sync couldn't regress them —
that manifest edit rides PR #252.)

Sweep note: 52 active capabilities have `required:[]` + no `anyOf`; most are
legitimately all-optional. The three above were the ones whose manifests already
declared the contract. A deeper executor-vs-schema sweep is possible follow-up.

### 2. Value-in-task hints on the /v1/do 400 path — PR #252
When a required field is missing but the caller's task text contains a
high-confidence value of that field's type (IBAN, email, URL, domain), the 400 now
shows the exact corrected call with their own value, merged over their existing
inputs. Hint only — declared contracts enforced as declared, nothing auto-executed,
nobody charged on a guess. Cross-provider review (Codex sol@high via model-os
dispatch) found 1 HIGH + 2 MEDIUM + 1 LOW — all fixed (scan cap vs regex
backtracking on the unauthenticated path, group-hint scoping, merged-inputs
example, JSON-encoded example). Four cleanup lenses ran; reuse findings applied
(bounded email/domain regexes matching domain-contact-extract's regression-tested
pattern; `unsatisfiedGroupFields` built on `branchesOf`/`requiredOf` now exported
from x402-input-validation).

### 3. eu-regulation-search: quarantined, then rebuilt — PR #254
Zero lifetime successes (6/6 failures, breaker half_open since Aug 12): the
Browserless EUR-Lex scrape's results anchor drifted, EUR-Lex now answers the
search URL with HTTP 400, and empty results were thrown as errors (feeding the
breaker — the refusal-is-not-a-fault rule again).

- **Quarantined in prod** (platform-acts-alone per DEC-20260812-A): `visible=false`,
  `x402_enabled=false`, evidence row in `health_monitor_events` (mode manual_ops).
  Verified delisted from /v1/capabilities and /x402/catalog.
- **Rebuilt on the official CELLAR SPARQL endpoint** (publications.europa.eu — no
  auth, no render, no LLM; DEC-20260813-A: official API > per-call parsing).
  Verified live: AI Act, GDPR exact hit, year filter, nonsense → valid
  `result_count: 0`. 59–380ms. Cross-provider review: 2 MEDIUM, both fixed.
- **Un-quarantine is deploy-gated** (DEC-20260504-C): prod runs the old scrape
  until #254 deploys. The exact post-deploy runbook (onboard --backfill
  --discover, sync fields, smoke-test, flip flags + promotion event) is in the
  PR body. The breaker row closes itself on first success.
- cost_class paid_prepaid → free_unlimited (vendor cost genuinely zero now);
  price_cents deliberately untouched (pricing is human-gated).

## Completed later the same session (Petter authorized merge + runbook)

- **PR #252 merged** (`bf61e63`) and **PR #254 merged** (`fdb9795`), deploy
  verified via /health SHA.
- **Deploy-gated runbook executed against `fdb9795`** — one correction to the
  runbook as written in #254: `sync-manifest-canonical-to-db` must run BEFORE
  `onboard --backfill` (the onboard authority gate correctly refuses on
  manifest-canonical drift; the sync script is the sanctioned escape hatch).
  Then: cost_class flip (manifest is the authoring surface per the gate),
  onboard `--backfill --discover --force` (Class 4 fields verified matching
  first), smoke-test 11/11, un-quarantine with promotion event.
- **Prod verified end-to-end:** /v1/do GDPR call → `32016R0679` in 556ms
  (transaction `43af866c…`) — the capability's **first production success
  ever**; breaker `closed`, `total_successes: 1`; re-listed on
  /v1/capabilities and /x402/catalog. `avg_latency_ms` corrected 35000 → 800
  (scrape-era measurement; 35000 was routing every call async).
- **PR #256** carries the pipeline's manifest rewrite (repo ↔ DB byte parity).

## Open / founder-gated

- PR #251 (check-in + dashboard + measurement docs/module) was already open and
  grew a measurement-module commit from the parallel session — not mine to close.
  (#253 agent-card storefront merged separately by that thread.)
- The initialize→list funnel investigation the morning handoff called "item 2" was
  already resolved as a measurement artifact (see docs/company/MEASUREMENT.md
  error 3); the real successor work is the measurement module in PR #251.

## Process notes

- Shared checkout bit again, mildly: HEAD moved under me mid-session (another
  session committed to the branch). All of my work went through a fresh dedicated
  worktree (`strale-wt-fix`, npm install inside it, per WORKTREES rules) — no
  collisions.
- model-os gates now require `calibre:` role declarations on Agent launches and
  block same-provider independent review; the working path for cross-provider
  review is `select.mjs --role independent-review --author-provider anthropic` →
  `dispatch.mjs --mode review` with a compact envelope. Both dispatches this
  session returned genuinely useful findings.
- `/v1/do` missing-fields 400s already carried `missing_fields`/`expected_fields`;
  failed_requests rows for them are input-shape failures, not unmet demand — worth
  remembering when reading "demand we refused" tables.
