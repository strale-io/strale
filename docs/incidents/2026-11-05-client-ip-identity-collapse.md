# INCIDENT: every anonymous API caller identified as one of two addresses

**Status:** reverted and verified (strale-io/strale#912, live as fb7c2480 by 13:56 Swedish time).
**Severity:** medium. Per-IP protections (rate limits, the free-tier monthly
allowance and the signup trial cap) were shared across all callers. No money
moved wrongly, no data was exposed, and paid API-key calls are limited per key.
**Window (Swedish time):** from the deploy of 3b13b39c (strale-io/strale#910,
merged 13:20, live by 13:25 at the latest) until the revert was live at about 13:55. That is roughly 30 to 35 minutes.

## 1. What happened

strale-io/strale#910 (cto-readiness WP12 batch 4) moved every client-IP read in
`apps/api` onto one rule: walk `X-Forwarded-For` from the right, skip non-public
hops, and take the first public address. Before it, the code took the left-most
entry.

In production `X-Forwarded-For` is `<client>, <Railway edge public IP>`. The
right-most public entry is Railway's own edge, so after the deploy every caller
was keyed on one of two edge addresses.

## 2. How it was found

The PR required a post-deploy identity check (DEC-20260504-C). From the cloud
session (egress IP changes per connection), free-tier `/v1/do` calls showed:

- **Before the deploy:** each request's `ipHash` equalled `sha256` of a real
  egress IP of the caller (b037cb7a… = 34.75.37.254, d0980acc… = 35.185.16.144,
  4359b7fa… = 35.243.167.234, 881b8c44… = 34.75.111.51).
- **After the deploy:** 9 requests from at least five distinct egress IPs
  (35.231.82.74, 34.75.37.254, 35.243.167.234, 34.75.182.51, 34.26.112.23) all
  got one of two identities, `02b796682b34490c` or `f4f82b2843b8c6f7`.

The revert was opened about six minutes after the deploy was seen.

## 3. Why the reviews did not catch it

- The evidence (`archive/receipts/2026-09-02-audit-verify-ip-proxy-hops.json`
  and its rechecks) showed that client-forged values never survive. It never
  recorded how many entries production XFF holds.
- The first independent review named exactly this gap as its medium finding.
  The fix chosen (skip private and CGNAT ranges) could not help, because
  Railway's appended hop is a public address.
- The probe's exact own-IP assertion cannot run from a cloud session whose
  egress rotates, so the only identity check ran after deploy, not before
  merge.

## 4. Effect

While the bad version was live, all anonymous callers shared:

- the per-IP rate-limit buckets;
- the monthly free-tier allowance (300 calls per IP);
- the per-IP cap on signup trial grants.

New signups in the window may have been refused the trial credit, with the cap
counting every other signup in the window. Calls with an API key are limited
per key. The x402 path uses the IP for attribution only.

**Open:** list the signups in the window whose trial was withheld (needs a
production read; this session has no database access) and restore their
credit as a refund-class action, after showing Petter the list.

## 5. Restore verification

At 13:56 Swedish time `/health` showed `fb7c24808a37`, the revert's merge
commit. Six fresh free-tier calls gave six distinct identities. Five are the
exact `sha256` of a known egress IP of this session: 881b8c44… = 34.75.111.51,
b8e21d72… = 35.231.82.74, d0980acc… = 35.185.16.144, 4359b7fa… =
35.243.167.234 and b037cb7a… = 34.75.37.254. Per-client identity is back to
the left-most rule that held before #910.

## 6. What changes

- **Done 2026-11-05:** `archive/receipts/2026-11-05-audit-xff-shape-production.json` records the shape (`<client>, <railway-edge>`; the client-supplied header is replaced). Originally planned: a receipt that records the real
  `X-Forwarded-For` entry count and order in production. Capture it with an
  echo of the raw header on a non-production Railway service behind the same
  edge, or a temporary debug log line. The rule is then written against that.
- **The identity probe must pass before merge**, from a machine with a fixed
  egress IP. A cloud session cannot be the only check.
- **`integration-db` should be a required check.** On 2026-11-05 a PR entered
  the merge queue with that job red, and had to be pulled out by hand.
