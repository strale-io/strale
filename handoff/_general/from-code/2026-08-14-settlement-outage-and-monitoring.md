# 2026-08-14 — x402 settlement outage, monitoring rebuild, board clearance

**Intent:** clear every item that was blocked on Petter, then fix what that work uncovered.

## The incident (the important part)

**A 21-hour revenue outage, and it was nobody's code.** Coinbase's CDP x402
facilitator allows 1,000 settlements per calendar month free, then refuses with
`payment-method-required` until a card is on file (policy effective Jan 2026,
$0.001/settlement after the free tier). Strale crossed the threshold at
settlement **1,009** for August. Last successful settlement 2026-08-13 09:53
UTC; every payment after that failed at settle.

The failure mode is what made it dangerous: challenge, verify, and capability
execution all kept succeeding. Only the final settle step failed, so callers
received an error, were correctly not charged (DEC-14 ordering held), and
nothing looked broken from the inside. Real x402 volume went from ~110/day to
zero. The paying customer stopped calling and has not returned.

Found by making a real payment from the recovered April test wallet rather
than reasoning about it. Resolved by adding a card to CDP entity
`28dcd11b-8752-5835-a764-42f94af91614` (the entity owning key `strale-x402` /
`79b3a0…` — NOT the entity the portal opens by default). Both rails then
verified with real on-chain settlements: legacy `0xe910ad0c…`, v2
`0x548828e4…`.

## Monitoring rebuild (PR #213)

The outage exposed three defects, all fixed:

1. **~21h detection lag.** The only monitor watched settlement *volume* over a
   rolling 24h window, so it couldn't fire until a day of good traffic aged
   out. `settleX402Payment` now classifies the facilitator's reason and pages
   immediately on systemic classes (billing / auth / quota) with the remedy in
   the body. Per-payment failures stay quiet.
2. **Cooldown didn't survive restarts** — five identical CRITICAL pages in 90
   minutes, because `lastAlertAt` was module state and every redeploy reset it.
   New `alertOnce()` keys the cooldown in `health_monitor_events`; fails open.
3. **Alert fatigue.** The CRITICAL page arrived among INFO budget notices and
   was missed for hours. INFO is now logged for the daily digest, not emailed
   (`ALERT_INFO_EMAIL=true` restores).

Correction on record: I initially reported the tripwire had not fired. It had —
Resend confirms five CRITICAL emails delivered from 07:00 UTC. I had checked
only the last few minutes of logs.

## Board cleared (was blocked on Petter)

PyPI yanks (6 releases, 3 stub packages) · straleio 0.1.4 (PyPI) ·
straleio 0.1.3 + strale-mcp 0.2.5→0.2.6 (npm, published via granular token
after email-2FA proved unable to supply CLI OTPs) · six PRs merged (#202 #203
#204, frontend #16 #17 #18) · Glama listing claimed · CDP billing fixed.

**Glama claim root cause:** two GitHub accounts. `petterlindstrom79` (org
member, CLI identity) vs `petterlindstrom` (2018 account, browser session).
`glama.json` listed only the first; the claim silently failed. Both now listed
(PR #207). Recorded in memory — this will bite again elsewhere.

## Truth-in-public sweep (PRs #208–#211)

Chasing Glama's stale listing description found the description is *generated
from our README* — which still documented the SQS engine as live, including a
`min_sqs` API parameter deleted in May and a `/v1/quality/:slug` link that
404s. Also fixed: MCP tool descriptions promising agents an "SQS score
(0-100)" the API hasn't returned since May (while the same file's own docs said
so), and the MCP free-tier fallback listing 5 of 11 slugs.

## Corrected: the Brazil "fix" from 2026-08-13 was wrong

Yesterday I disabled six `brazilian-company-data` test suites believing our own
test load was rate-limiting the paying customer. **Disproved:** after a full day
with scheduled testing off, the failure rate is unchanged (58%, 14/24), and
every one of 36 failures in 24h is input validation — `'cnpj' is required …
Name search is not supported` — with zero HTTP 429s. Suites re-enabled, with
the disproof recorded in `health_monitor_events`.

The real cause is the **name-vs-identifier gap**: agents arrive holding a
company name; registries index identifiers. Same pattern as `us-company-data`
("No confident SEC EDGAR match for Apple"). This is the clearest revenue leak
open and is the next work item.

## Open

- Name-vs-identifier gap — Phase A (actionable errors everywhere) then Phase B
  (`company-name-resolve`, whose draft manifest carries explicit verification
  debt: per-registry scoring thresholds must be defined; result[0] is wrong).
- PR #203's five capabilities are merged but **not onboarded** — zero DB rows.
- Dark trio (google-news-search, serp-related-questions, email-auth-check)
  awaiting first green week before promotion.
- Mexico build (approved: exclude sole-trader contact fields) and the
  discoverability fix for `domain-contact-extract` (approved).
- 18 stale strale PRs + 4 frontend PRs under triage.
- Clocks: JP app ID ~Aug 20 · DK CVR nudge Aug 27 · AT/BMJ unknown ·
  x402-list.com review pending.
- Customer has not returned since the outage; they may not know it's fixed.
