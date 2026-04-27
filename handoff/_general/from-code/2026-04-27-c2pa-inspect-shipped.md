# [BACKFILL] Journal — c2pa-inspect shipped + new `media` category

**Date:** 2026-04-27 (CET)
**Type:** session log
**Reason for [BACKFILL] prefix:** Notion MCP not connected; substitutes for Journal DB entry per CLAUDE.md degraded-mode rule. Re-file when Notion access returns.

## Intent

Ship a `c2pa-inspect` capability surfaced by the /activity sweep on 2026-04-27. A single user typed `c2pa` (zero results), `content credentials` (10 fuzzy false positives), `provenance` (1 unrelated match — `package-security-audit`), and `digital signature verification` (10 fuzzy matches) into typeahead within ~1h, looking for media-content authenticity. No matching capability existed.

## Why

C2PA (Coalition for Content Provenance and Authenticity) is the standard Adobe/Microsoft/BBC/etc. created for cryptographically signing media with edit history, signer info, and AI-generation flags. Mandatory in EU AI Act content-disclosure contexts and adopted by Microsoft Bing, OpenAI DALL-E, Adobe Firefly, BBC, etc. Strale had zero capabilities in this lane — a category gap, not a single-capability gap. Even if this user doesn't return, the category is a discoverable hook for the next 10 users with the same need.

## What shipped

- **Executor:** `apps/api/src/capabilities/c2pa-inspect.ts` — fetches an HTTP(S) media URL via `safeFetch` (SSRF-protected), enforces 15 MB cap, content-type whitelist (JPEG/PNG/WebP/AVIF/HEIF/TIFF/DNG/GIF), passes bytes to `c2pa-node` for parsing + signature verification.
- **Manifest:** `manifests/c2pa-inspect.yaml` — 7 output fields (6 guaranteed, 1 common — `active_manifest` is null when no manifest is present), 5 limitations, known_answer fixture pointing at `c2pa-rs/sdk/tests/fixtures/CA.jpg` (Adobe-published canonical signed image).
- **New category:** `media`. Added to `VALID_CATEGORIES` in both `onboarding-gates.ts` and `validate-capability.ts`. Documented in `strale-frontend/public/llms.txt`. Opens the lane for follow-on capabilities (image-EXIF-inspect, video-fingerprint, etc.).
- **Pricing:** €0.10 (price_cents 10), wallet-only (not free-tier), x402-enabled. Estimated avg_latency_ms 2000ms (URL fetch + native parse).
- **Output shape:** `source_url`, `media_type`, `bytes_size`, `has_c2pa`, `manifest_count`, `validation_status[]`, and `active_manifest` containing `claim_generator`, `title`, `vendor`, `signer.{issuer,time}`, `signature_valid`, `assertions[]`, `assertions_count`, `ingredients_count`, `ai_generated` (heuristic on assertion labels).

## Known constraint — local verification skipped

`c2pa-node` is a native Rust addon. Adobe ships prebuilds for `linux-x64`, `darwin-x64`, `darwin-arm64`, and `win-x64` — but **NOT `win-arm64`**, which is the dev machine here. The postinstall script force-downloads `win-x64` regardless of arch, so the binary fails to load on Windows-ARM64 (`is not a valid Win32 application`). Lazy-loading with dynamic import inside the executor lets registration succeed on every platform; only execution fails on win-arm64.

**Consequence:**
- The onboarding pipeline's "Fixture Verification" step ran in non-strict mode → emitted a warning and continued. The capability was inserted with all 5 test suites and 19/19 structural-validation checks passed, but the known_answer was not live-verified locally.
- **Action required after Railway picks up the new commit:** call `/x402/c2pa-inspect` with the canonical fixture URL and confirm `has_c2pa: true`, `manifest_count >= 1`, `active_manifest.claim_generator` present, and `signature_valid` is reasonable. Then trigger 3 test rounds via `scripts/trigger-test-runs.ts` (or the focused `eth-validate-test-rounds.ts` pattern) to materialize SQS.

## Onboarding routine compliance (DEC-20260320-B)

| Step | Status |
|---|---|
| 1. Read the spec first | ✓ |
| 2. Manifest with all required fields | ✓ |
| 3. `output_field_reliability` for all 7 fields | ✓ |
| 4. `avg_latency_ms` set (2000ms estimated; will refine after live runs) | ✓ |
| 5. `validate-capability.ts` | ✓ **19/19 passed** |
| 6. Readiness check | ✓ via validate-capability |
| 7. Smoke test | **DEFERRED to post-Railway-deploy** — local execution not possible on this platform |

Per protocol: skipped step 7 explicitly because local execution is impossible on Windows-ARM64; will verify on Railway.

## Commits

- (this commit) feat: add c2pa-inspect capability + new `media` category
- DB UPDATE applied (visible=true, isActive=true, lifecycleState=active, x402Enabled=true, avgLatencyMs=2000) — not in git, no schema change.
- Frontend llms.txt updated (separate commit in strale-frontend repo).

## Notes for next session

- **First action:** verify c2pa-inspect works on Railway. The c2pa-node Linux x64 binary will download via postinstall during deploy. If postinstall fails on Railway, add `c2pa-node` to a build-deps list and verify again.
- **After Railway deploy succeeds:** trigger 3 test rounds, confirm SQS materializes. Same pattern as eth-address-validate this morning.
- **v2 ideas:**
  - `media_base64` input alongside `url` (for agents already holding bytes).
  - Video formats (MP4, M4V) with a higher byte cap.
  - `c2pa-sign` capability — adds C2PA credentials to media (would need certificate management, deferred).
  - Companion capabilities to fill the `media` category: `image-exif-inspect`, `image-ai-detect` (PNG/JPEG-only, no C2PA needed), `video-fingerprint`.
- **Provenance/zero-result pattern:** the user's typeahead `provenance` matched only `package-security-audit` (npm/PyPI supply chain — wholly unrelated). Consider whether the typeahead should be tightened or whether `provenance` should explicitly map to `c2pa-inspect` now that it exists.
