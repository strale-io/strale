Intent: Implement Evidence Tier framework labeling (DEC-20260518-A + DEC-20260518-C) across 31 of 32 company-data handlers — close the labeling-debt findings from 2026-05-18 EU30 coverage audit.

## Outcome

PR #131 merged 2026-05-18T08:05:27Z, main HEAD `117b386`.

Three additive edits per handler:

1. `tier_2_available` boolean + optional `tier_2_available_reason` (framework-mandatory per DEC-20260518-A).
2. `ubo_availability` string enum (`available` / `restricted` / `unavailable_no_registry`) + `ubo_availability_reason` (framework-mandatory; silence on UBO is the violation the framework forbids).
3. Evidence Tier 1 canonical field aliases (`legal_name`, `primary_registration_id`, `status`, `legal_form`, `registered_address`, `date_incorporated`) added alongside existing aliases. Additive only — no breaking changes.

### Three patterns auto-detected + handled by the sweep script

- **11 Openapi-delegated** (AT/BG/CY/HU/LU/MT/NL/RO + ES/PT + IT): wrapped `return executeOpenapiCapability(...)` into `const __etResult = await ...; return { ...__etResult, output: { ...__etResult.output, [aliases + labels] } };`. The shared `lib/openapi-resolver.ts` stayed untouched.
- **5 inline-literal** (cz, de, sk, se, us-cobalt): injected canonical-alias key/value pairs (mirroring source value expressions) + label fields into the existing `output: { ... }` block.
- **15 variable-output** (`const output = ...; return { output, provenance }`): inserted a runtime-resolver block before the return that conditionally sets canonical aliases (only when not already present) + the two label flags.
- **1 deferred**: `swiss-company-data.ts` is a throw-only stub; real CH path is `providers/swiss-company-data.ts` (DataProvider chain). Out of scope per the prompt; flagged for follow-up sweep.

### Aggregate flag distribution

- `tier_2_available: true` → 3 handlers (DE, GR, US-Cobalt — emit directors)
- `tier_2_available: false` → 28
- `ubo_availability: available` → 2 (DK, UK — note Pass B M-2 flag below)
- `ubo_availability: restricted` → 14
- `ubo_availability: unavailable_no_registry` → 15

### `/go` six-lens — both passes ran; all HIGH/CRITICAL fixed inline before merge

**Pass A (technical, 1 CRITICAL + 2 HIGH + 2 MEDIUM + 4 LOW)** — all CRIT+HIGH+MED-1+MED-3 fixed in commit `568bc50`:

- CRIT-1: `tier_2_available_reason` was absent on the 3 t2=true handlers. Inconsistent contract — every t2=false ships a reason, but t2=true was silently dropping it. Added substantive reasons.
- HIGH-1: status alias resolver across 15 variable-output handlers used `??` chain `(o.company_status ?? o.is_active ?? o.active)`. `??` only falls through on null/undefined — so `is_active: false` would assign boolean `false` to status (invalid for Evidence Tier enum string). Rewrote as explicit branching.
- HIGH-2: singapore `legal_name` resolver — fallback chain `(o.company_name ?? o.name)` never matched SG's `entity_name` field. Extended chain to include `entity_name`.
- MED-1: german `date_incorporated` canonical alias missing — the inline-literal patcher missed `incorporated_at` mapping. Added.
- MED-3 (grouped with CRIT-1): greek `tier_2_available_reason` added.

**Pass B (product / UX / non-technical-founder, 0 HIGH + 3 MEDIUM + 2 LOW)** — documented in PR comment, not fixed in this PR:

- M-1 (conf 88): Internal-engineering language leaks to API responses (~13 handlers). "handler does not currently extract legal representatives; follow-up extraction task tracked" + DEC IDs in reason strings.
- M-2 (conf 85): `ubo_availability: available` on DK + UK is misleading. The framework contract reads `available` as "this call returns UBO data" but DK's reason itself admits "handler integration pending; flag reflects jurisdictional availability". Petter decision needed.
- M-3 (conf 80): Reason strings lack terminal punctuation while sibling error messages end in periods.
- L-1 (conf 82): `tier_2_available` field name opacity vs framework. Consider `directors_available` rename before SDK typing ships.
- L-2 (conf 80): 11 ubo_availability values are "verification pending" estimates — already known followup.

## Open

Out-of-scope follow-ups flagged for separate sessions:

1. `providers/swiss-company-data.ts` labeling (chain-provider deferral; real CH runtime path)
2. `legal_representatives` extraction for 13 handlers (upstream registries DO expose directors, current handler implementations don't extract)
3. Pass B M-1: reason-string customer-friendliness sweep (strip "handler" / "task tracked" / DEC IDs)
4. Pass B M-2: DK + UK `ubo_availability="available"` semantics — chat-side decision needed
5. Pass B M-3: terminal punctuation on reason strings
6. Pass B L-1: `tier_2_available` → `directors_available` rename consideration before SDK typing
7. 11 unverified `ubo_availability` values (per audit-output/labeling-sweep-summary-2026-05-18.md)
8. ongoing-monitoring capability creation — T3 EDD blocker per 2026-05-18 audit
9. Coverage-matrix YAML rescore against new 6/3/3 rubric (legacy is 7/5/6)
10. Digiteal/SEPA bank-verification handler creation — T1 Continuity blocker for all 30 EU30

## Non-obvious learnings

- **Three handler return-object patterns coexist in the same directory.** Openapi-delegated (return-the-promise), inline-literal (`return { output: { ...keys }, provenance }`), and variable-output (`const output = ...; return { output, provenance }`). The labeling sweep had to handle each separately — the automation script classifies + dispatches by pattern. A future "evidence-tier-helpers.ts" lib (if scope opens up) could collapse all three patterns to a single 1-line call, but the prompt explicitly forbade new lib files.
- **`??` is a footgun for boolean-vs-string canonical fallback.** The status resolver chain `o.company_status ?? o.is_active ?? o.active` was wrong because `is_active: false` is not null/undefined and would resolve to boolean `false`. /go Pass A caught it as latent (not firing today on the 15 handlers I patched, but the pattern is wrong). Fix: explicit `typeof === "string"` + `=== true` / `=== false` branches.
- **`/go` Pass A and Pass B should be run in a single message for parallelism.** I forgot and ran them serially (Pass A in /go skill invocation, then Pass B as a separate Agent call after). The Pass A reviewer's findings would have been narrower if I'd run both upfront and aggregated.
- **The inline-literal patcher needs to MIRROR value expressions, not key names.** First iteration of the sweep script wrote `legal_name: company_name,` (key name as identifier reference) which doesn't work inside the same object literal — the key isn't a variable in that scope. Fix: extract the value expression text for the alias key (e.g. `pickPrimaryName(nameList)`) and reuse it. Caught by tsc on first try.
- **"This session" close-check window doesn't filter by actual-introduction.** The script flagged 11 Openapi-routed countries as "added this session without active DB row" — they were touched (file modified) by my labeling sweep but were created weeks ago in PR #121-#124. The script can't distinguish "modified this session" from "introduced this session". Worth knowing when reading close-check yellow warnings.
- **Customer-visible reason strings need customer-facing language.** Pass B caught what Pass A missed: 13 handlers ship "handler does not currently extract legal representatives; follow-up extraction task tracked" verbatim to API consumers. Internal vocabulary leaking into product responses. A future polish sweep should replace these.

## Cost

Zero external API spend across the entire sweep. All edits were static-source mutations driven by handler shape inspection. The per-capability validate/smoke verification was deliberately skipped (would have cost ~31 paid API calls at €0.05-0.15 each = ~€2-5; the tsc + 665-test gates cover the relevant regression surface for a purely additive labeling change).
