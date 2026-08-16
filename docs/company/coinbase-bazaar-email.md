# DO NOT SEND — the premise was wrong

**Withdrawn 2026-08-15, before sending.** Petter asked for the 41-of-334 figure
to be verified first. It did not survive verification, and neither did the
question the email was built on.

## What was wrong

**The count.** A complete walk of the index — all 14,946 entries, with the walk
asserted complete — finds **95 Strale resources, not 41**. The original 41 came
from scanning 12,000 of 15,183 entries: a floor reported as a total.

**The worked example.** The email offered `keyword-suggest` as a "not indexed"
endpoint for Coinbase to compare against an indexed one. It is indexed. So are
`tech-stack-detect`, `serp-analyze` and `uptime-check` — the four best-sellers
previously reported missing. All eight of our proven sellers are listed. Anyone
receiving this email would have found its own example false in under a minute.

**The question.** There is no anomaly to ask about. See below.

## What actually governs indexing

The Bazaar lists exactly those resources that have **settled an x402 payment in
the trailing 30 days**. Measured against production, the fit is exact in both
directions:

| window | settled | settled but NOT listed | listed but NOT settled |
|---|---|---|---|
| 28d | 93 | 4 | 2 |
| **30d** | **95** | **0** | **0** |
| 35d | 98 | 7 | 0 |

Zero exceptions at 30 days; the boundary is sharp on both sides. Not 402
challenges, not our discovery file, not registration — settlements, on a rolling
30-day window. An earlier guess that triggering a 402 challenge causes indexing
is unsupported: the four endpoints probed that day are bought regularly by our
paying customer, so their listing is explained by settlement alone.

## Why this matters more than the email did

**Bazaar presence cannot be acquired. It is earned by sales and expires when
sales stop.** Our 164 unlisted capabilities are unlisted because nobody bought
them in the last month. The "8× shelf presence" opportunity does not exist: you
cannot get shelf presence without sales, and shelf presence was the plan for
getting sales. It is circular.

So the Bazaar is a **trailing indicator of our own revenue**, not a distribution
channel we can seed. Treat its listing count as a metric, never as a lever.

## The email itself is kept below, unsent, for the record.

---

# Email to Coinbase — Bazaar indexing gap

**Status: DRAFT. Not sent.** Sending it is yours — it speaks as Moonlighter AB
to a vendor, which is outside what I do.

**Where to send it.** In order of likely success:
1. CDP Discord (`discord.gg/cdp`) → `#x402` channel — where the x402 team
   actually answers, and the fastest route for an indexing question.
2. GitHub issue on `coinbase/x402` — best if you want a public, trackable
   record. There is an existing upstream issue about mainnet extension
   handling; linking ours to it may help.
3. Email `developer-support@coinbase.com` — slowest, but paper-trailed.

I would use Discord first and open the GitHub issue only if it stalls.

**Before you send:** everything below is verifiable and I have checked each
claim myself. The one thing I could not check is whether they consider partial
indexing expected behaviour — so the email asks rather than asserts.

---

## Subject

x402 Bazaar: 41 of 334 endpoints indexed — is our challenge shape wrong, or is this expected?

## Body

Hi,

We run Strale (api.strale.io), an x402 seller on Base mainnet settling through
the CDP facilitator. Roughly 3,400 paid calls over the last 90 days, all
settling normally.

We publish 334 x402-enabled endpoints. Only 41 currently appear in the
discovery index at
`GET /platform/v2/x402/discovery/resources`. I would like to understand whether
that is expected, or whether we are doing something wrong at our end.

What I have checked already:

- Every endpoint sets `outputSchema.input.discoverable: true` in its 402
  challenge — the flag is unconditional in our gateway, not per-capability.
- I compared an indexed endpoint (`/x402/email-validate`) against a
  non-indexed one (`/x402/keyword-suggest`). The challenges are structurally
  identical: same `discoverable` flag, same `method`, populated `queryParams`
  descriptors, a description, and an output schema. I cannot see a difference
  that would explain one being indexed and the other not.
- It does not appear to track payment history: 212 of our endpoints have
  settled real x402 payments through your facilitator and are still absent
  from the index.

So my questions are:

1. What actually triggers indexing of a resource — an observed 402 challenge, a
   settlement, an explicit registration, or something else?
2. Is there a submission or refresh endpoint we should be calling, rather than
   waiting to be discovered?
3. Do listings expire? If entries age out after a period of inactivity, that
   would explain the subset we see and we would handle it differently.
4. Is this related to the known issue with v2 extensions being dropped on
   mainnet? We currently emit the v1 descriptor shape as a hedge, having
   observed that indexed entries in your catalogue use it.

Two endpoints you can compare directly, both live and both returning a 402 to
an unpaid GET:

- indexed:     https://api.strale.io/x402/email-validate?email=test@example.com
- not indexed: https://api.strale.io/x402/keyword-suggest?keyword=test

Happy to provide anything else useful — wallet address, settlement IDs, raw
challenge payloads.

Thanks,
Petter Lindström
Moonlighter AB (Strale) — petter@strale.io

---

## If they ask for specifics

- Seller wallet: `0x66D7C2F952362BFB24FD7F02a9beC9c754ea83bC`
- Network: Base mainnet (`eip155:8453`), USDC
- Facilitator: `https://api.cdp.coinbase.com/platform/v2/x402`
- Discovery file: `https://api.strale.io/.well-known/x402.json`
- Indexed count as at 2026-08-15: 41 of 334 (scanned all 15,183 index entries)

## What a good answer unlocks

Going from 41 to 334 listings is an eight-fold increase in shelf presence on
the largest venue where x402-paying agents browse — currently our only proven
customer channel. It is the single biggest distribution move available, and it
costs nothing but this conversation.
