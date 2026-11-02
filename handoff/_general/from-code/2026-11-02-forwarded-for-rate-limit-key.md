Intent: Verify whether a client can dodge Strale's per-IP rate limits by forging X-Forwarded-For behind Railway (finding 6 of the ops-read endpoint review; Petter asked for it to be done in this session, 2026-11-02).

[BACKFILL] Cloud session; no Notion write was made.

## Finding

- `rateLimitIp` (`apps/api/src/lib/rate-limit.ts`) keys on the first `X-Forwarded-For` entry. It falls back to `CF-Connecting-IP`, then `X-Real-IP`.
- In a local harness, rotating the first XFF entry gives a fresh bucket every time. The question is what Railway's edge does with a client-sent header.
- Production probe on 2026-11-02, against `GET https://api.strale.io/llms.txt` (120/min per IP):
  - five series of 16 requests: no header (control), distinct forged XFF, distinct forged XFF with a junk first entry, distinct `X-Real-IP`, and distinct `CF-Connecting-IP`;
  - at most 1 of 16 responses per forged series showed a fresh bucket, against 2 of 16 in the control.
- If a forged value were the key, every response would show a fresh bucket (`x-ratelimit-remaining: 119`). The remaining noise comes from several egress IPs and several API instances.
- Evidence: `archive/receipts/2026-11-02-audit-forwarded-for-rate-limit-key.json`.
- Conclusion: client-supplied values do not become the rate-limit key in production today.
- Railway's forum has contradicting staff answers on strip vs append, so this is a measured fact, not a documented guarantee.

## Delivered

- The comment in `rate-limit.ts` now cites the receipt instead of asserting the fact. It says to re-run the probe after any Railway networking change. No code change.

## Next

- Next authorised action: none required. Re-run the probe (series of distinct forged headers against a rate-limited public path, compare with a control series) after any Railway networking change | Owner: whoever changes Railway networking | Blocker: none.
