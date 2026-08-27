Intent: implement caching for competitor-compare (Petter's explicit ask) and
answer his follow-up — which other capabilities should be deterministic —
with measurement rather than reasoning from capability names.

## The determinism question, answered by experiment

I predicted the risk was concentrated in compliance-shaped capabilities.
**That prediction was wrong**, and testing it is the only reason the answer
here is right. Three capability shapes, three runs each, real prompts,
production model, at the default temperature production used until today:

| capability | shape of output | result |
|---|---|---|
| `pii-redact` | constrained extraction | **already stable** — 3/3 byte-identical redactions, identical entity sets |
| `hs-code-lookup` | classification | **already stable** — 3/3 identical code, alternatives, confidence |
| `sentiment-analyze` | label + score + prose | **verdict stable** (mixed / 0.85 every run), **score wobbled** 0.4 / 0.35 / 0.35, prose differed each run |
| `summarize` | free prose | **varied every run** — three different summaries |
| `competitor-compare` | free prose | varied (the original finding: 11/13/10/9 trust signals, 180-294 chars) |

**The rule that actually holds: variance tracks how much free-form prose the
output contains, not how consequential the capability is.** A model asked for
one right answer in a constrained shape has little room to sample; a model
asked for "2-3 paragraph strategic comparison" has enormous room.

So `pii-redact` — the one I was most worried about, live and paid on x402,
where a varying redaction would be a genuine GDPR hazard — needed nothing.
And the boundary case worth knowing is `sentiment-analyze`: its *answer* is
stable while its numeric confidence moves at the margin, so a customer
thresholding on a score could land on different sides of a boundary between
two identical calls. That is narrow but real.

**Caveat stated rather than buried:** three trials showing no variance is
absence of observed variance, not proof of determinism, and my samples were
short and clean. A longer or messier input has more room to diverge.

## The line to apply for the remaining pass

- **temperature 0** where the capability answers a question *about* a given
  input and a caller expects the same input to give the same answer:
  extraction, classification, analysis, translation, summarisation, review,
  explanation.
- **leave unset** where the capability *creates* new content and variety is a
  feature: `fake-data-generate` (identical fake data would be a regression),
  `blog-post-outline`, `social-post-generate`, `email-draft`, and the code
  scaffolding generators.

Priority order by measured impact, not by name: the prose-heavy ones first
(`summarize`, `competitor-compare` done, the `*-analyze` and `*-review`
family), then the label+score ones for the margin wobble, then the constrained
ones last since they are already effectively stable.

## Shipped

- **#397** temperature 0 on `competitor-compare` — merged `cc63428`, deployed.
- **#400** 24h result cache — merged `f992fd5`, deployed and serving.

`ResultCache` generalises the inline Map+TTL pattern `vat-validate.ts` already
had. Two load-bearing choices: `get()` cannot return a value without also
returning when it was ORIGINALLY computed (that feeds `provenance.fetched_at`,
so a hit never claims it fetched the sites just now), and the key is
order-sensitive (the output labels one site `company_a`, so serving a flipped
pair would attribute every finding to the wrong company). A hit still bills,
matching `vat-validate`; the caller gains an instant answer plus `cache_hit` /
`cache_age_hours` so reuse is disclosed. 11 tests with an injected clock, four
mutations CAUGHT through `mutation-test.mjs`.

## unverified: the cache is NOT confirmed working in production

The deploy is confirmed live by served commit (`f992fd5`), and the capability
answers on the rail (`/x402/competitor-compare` returns a valid 402 quoting
$1.08). **But the cache path itself — call, repeat, observe `cache_hit: true` —
was not exercised against production**, so it is verified by unit and mutation
tests only. Recorded as `unverified:` rather than described as done.

**Why it could not be:** `STRALE_API_KEY` in the root `.env` is a **dead key**.
Its prefix is `sk_live_babb73df` and
`SELECT COUNT(*) FROM users WHERE key_prefix = 'sk_live_babb73df'` returns
**0**; a live call returns `unauthorized / Invalid API key`. The test account
it was believed to belong to (`test2@strale.io`) carries a different prefix,
`sk_live_0d56f39c`. The two drifted and nothing checked — plausibly during the
2026-08-22 credential revocation.

**This is broader than today's change.** Anything reading
`process.env.STRALE_API_KEY` — local examples, smoke-test scripts, any
authenticated end-to-end check of a paid capability — currently fails on auth
rather than on the thing it was testing, and fails in a way that looks like the
capability is broken.

**Not fixable from here.** Rotation is a production write (`hashApiKey`, update
`api_key_hash` + `key_prefix`); `DATABASE_URL` is read-only. Per CHARTER the
work product is the recommendation, not a workaround through whatever path
happens to be open. Canonical path is the key-recovery flow in
`apps/api/src/routes/auth.ts`. Needs write access or Petter.

## For the next session

1. **Rotate the test key**, then run the two-call cache check that was blocked
   today: identical input twice, expect `cache_hit: false` then `true`, and
   expect `provenance.fetched_at` on the second call to equal the first's
   rather than the hit time.
2. **The temperature pass**, using the line and the priority order above. One
   PR, per-capability judgement, not a blanket helper default.
3. `feat/phase-7a-it-stakeholders` still has no owner — third morning.
