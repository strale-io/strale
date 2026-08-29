# 2026-08-28 — Issue #412: bounded input bytes in six x402 capabilities

Intent: implement GitHub issue #412 — eliminate unbounded buffering of caller-controlled URLs and oversized base64 in the six live x402 document/image capabilities.

## Outcome: SHIPPED and verified

- PR #425 squash-merged as `b7fcbec3`; CI green on the exact reviewed head; prod `/health` verified serving `b7fcbec3` at 16:04 CET.
- Issue #412 closed with full evidence comment. Residuals filed separately as #426.

## What changed

- `pdf-extract`, `invoice-extract`, `contract-extract`, `resume-parse` (documents, 8 MiB decoded) and `receipt-categorize`, `image-to-text` (images, 4 MiB decoded): URL fetches now stream through `readBodyWithLimit` (early content-length refusal never trusted to accept; actual byte counting; abort at cap; body cancelled on early refusal); base64 goes through a new sealed `checkedBase64` helper (normalise once, measure the normalised string, return the measured string). `image-resize` migrated to the same helper.
- Constants: `MAX_DECODED_IMAGE_BYTES` (4 MiB, pre-existing) + `MAX_DECODED_DOCUMENT_BYTES` (8 MiB, new) in `capabilities/lib/image-limits.ts` — the single authority.
- Also fixed a latent bug found during the audit: `readBodyWithLimit`'s no-stream fallback ignored `maxBytes` and silently reverted to 4 MiB.
- Refusals classify `caller_input` (floor-exempt, unbilled — asserted through `outcomeFromError`); DEC-14 no-charge ordering untouched.
- 96 discriminating tests in `input-byte-limits.test.ts` (fail-before demonstrated: 59/97 fail on un-fixed code); structural tests hold all seven files to the shared enforcement.
- The six manifests gained a `limitations` entry stating the byte limit.

## Pending operator step (needs write grant)

The prod `capability_limitations` rows for the six slugs need `onboard.ts --backfill` run with the production write credential (this session's credentials are read-only by design — `openOperatorWriteDb` refused correctly). Enforcement itself is code and live; this only affects catalog discoverability of the limit text. Note: the public `GET /v1/capabilities/:slug` currently doesn't serve limitations at all, so urgency is low.

## Follow-up issue

#426: remaining `arrayBuffer()` fetch sites (`base64-encode-url`, `c2pa-inspect`, `website-carbon-estimate`, `annual-report-extract`, Browserless-backed ones), rail-cap constant coupling, required-`maxBytes` hardening, image-branch vs Anthropic ~3.75 MiB mismatch on document capabilities, x402 base64-document 413-before-refusal shape, LLM prompt-length on `task`/`extract`.

## Process notes

- Worked in dedicated worktree `strale-wt-wp13` (removed at session end); shared checkout untouched.
- /go ran in full: typecheck, validate-capability ×6 PASS, checkReadiness ×6 ready, smoke-test (all steps pass except Step 2 live-execution, which is the pre-existing ALLOW_MATRIX paid-capability refusal from `internal_test` context — by design, PR #403), /simplify (4 agents), six-lens review (no HIGH). Adversarial review 4 rounds → PASS.
- No paid production calls were made.

---

*Redaction note (2026-08-29): this record originally named the production write-credential environment variable in prose. `scripts/guard-production-write-access.mjs` refuses any reference outside the single authority module, and its allowlist is deliberately a per-file decision rather than a standing exemption for documentation. The literal is replaced by the phrase "the production write credential"; nothing else is changed, and no credential value ever appeared here. Same precedent as the 2026-08-27 Austria record. **This is why the file could not be committed on the day it was authored** — the hygiene check reported it as an orphaned handoff without being able to say that a gate, not neglect, was holding it.*
