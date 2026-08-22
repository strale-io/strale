# Public copy correction — tamper-evidence claim

**Status: drafted, NOT applied.** Awaiting independent review of the wording.
Founder has approved the correction itself.

## The evidence this rests on

`/v1/verify` was exercised end-to-end against production on 2026-08-21, on three
representative records:

| Record | `verified` | `chain.length` | `truncated` | `broken_links` |
|---|---|---|---|---|
| inside the forked window (June) | **`true`** | 21 | `true` | 0 |
| after the WP7 fix | `true` | 21 | `true` | 0 |
| redacted row | `true` | 21 | `true` | 0 |

**The record inside the forked window verifies successfully.** That window is
the period in which one parent acquired 150,719 children, so ordering and
completeness cannot be evidenced for it — and the endpoint says `verified: true`
anyway.

The reason is structural, not a bug in the endpoint: it walks the chain
**backwards** via `previous_hash`. A backward walk is well-defined in a star
topology, because each row records exactly one parent no matter how many
siblings share it. Detecting a fork requires looking forward; detecting a
deletion requires knowing what should have been there. Neither is possible from
a backward walk.

It also stops at depth 21 with `truncated: true`, so it never reaches genesis.

**Conclusion:** the claim "tamper-evident" is not supported by current
production behaviour for the properties the phrase implies.

## What IS supported

A record's own content hash covers its own fields and its recorded predecessor.
Altering an individual record's content is therefore detectable — 99.7% of rows
inside the 90-day retention window verify. That property is real and working.

What is not supported: that records are in a provable order, and that none has
been deleted.

## The correction — remove, do not re-claim

Following "prefer an omission over an overstated claim", these edits remove the
security adjective rather than substituting a hedged cryptographic claim. Every
remaining word describes a mechanism, not a guarantee.

### 1. `src/pages/Methodology.tsx:239`

```diff
-Every successful transaction produces a hash-chained audit record — tamper-evident, and
-retrievable independently of the original call. It covers who processed the data, where,
-and under what basis, mapped to GDPR Articles 15, 17, and 30.
+Every successful transaction produces an audit record, retrievable independently of the
+original call. It covers who processed the data, where, and under what basis, mapped to
+GDPR Articles 15, 17, and 30.
```

### 2. `src/pages/Security.tsx:264-265`

```diff
-<h4>Tamper-evident audit records</h4>
-<p>Every transaction is linked via a hash chain, providing tamper-evident integrity for
-audit records. Per-transaction provenance includes AI model details and jurisdiction
-tracking. Compliance data is retained for 3 years (Colorado AI Act requirement).</p>
+<h4>Per-transaction audit records</h4>
+<p>Every transaction produces an audit record with per-transaction provenance, including
+AI model details and jurisdiction tracking. Compliance data is retained for 3 years
+(Colorado AI Act requirement).</p>
```

### 3. `src/pages/Privacy.tsx:328`

```diff
-controls, audit logging, and tamper-evident audit chains. Detail on
+controls and audit logging. Detail on
```

### 4. `src/components/QualityScoringSection.tsx:65`

```diff
-{ name: "Hash-chained record", desc: "Tamper-evident audit trail, retrievable per transaction" },
+{ name: "Audit record", desc: "Retrievable per transaction" },
```

### 5. `src/pages/CapabilityDetail.tsx:416` and `src/pages/SolutionDetail.tsx:192`

```diff
-If the call fails, you aren't charged. Every successful call returns a hash-chained audit
+If the call fails, you aren't charged. Every successful call returns an audit
```

### 6. `src/pages/Index.tsx:198`

```diff
-<span>HASH-CHAINED · SHAREABLE</span>
+<span>AUDIT RECORD · SHAREABLE</span>
```

### 7. `src/data/learnGuides.ts:2054` and `:2104`

```diff
-Every strale.do() call creates an immutable transaction record
+Every strale.do() call creates a durable transaction record
```

`immutable` was never true independently of this incident — records are redacted
at 90 days by design.

## Surfaces I missed, added after review

The first version edited seven frontend locations and left the identical claim
standing on every **machine-readable** surface — the ones agents and crawlers
actually read. Applying the standard to the human page and not the API is
inconsistent, so these are in scope:

### API and discovery surfaces (deploy, not release)

| Location | Claim |
|---|---|
| `apps/api/src/openapi.ts:29` | "Every call returns an audit record with **cryptographic chain hashing**." — live at `/openapi.json` |
| `apps/api/src/routes/a2a.ts:329` | same sentence — live at `/.well-known/agent-card.json` |
| `apps/api/src/routes/mcp-server-card.ts:89` | "Every call returns a **cryptographically chain-hashed** audit record." — live at `/.well-known/mcp.json` |
| `apps/api/src/routes/llms-txt.ts:34` | same sentence |
| `apps/api/src/routes/llms-txt.ts:110` | "…produces a chain-hashed audit record retrievable at `/v1/audit/{id}` **for downstream regulatory verification**" |

The last is the strongest claim anywhere on the platform: it asserts *fitness for
regulatory verification*, not merely a mechanism. It goes first.

Proposed everywhere: drop the cryptographic adjective and the regulatory-fitness
assertion — "Every call returns an audit record, retrievable at
`/v1/audit/{transactionId}`."

### Published package (requires a release, not a deploy)

`packages/mcp-server/src/tools.ts:943` — "Every call returns a chain-hashed audit
record." Shipped in `strale-mcp` on npm. Correcting it needs a version bump, so
it lands after the deploy rather than with it. Flagged rather than folded in.

### Frontend locations the first pass missed

| Location | Why it matters |
|---|---|
| `Methodology.tsx:112` | The page's **lead paragraph**: "hash-chained audit record **you can verify independently**". Without this edit the page contradicts itself — :239 would say "an audit record" while :112 still claims independent verification. This is the sentence a compliance reviewer would cite. |
| `Methodology.tsx:97`, `Security.tsx:120` | SEO **meta descriptions**, both "hash-chained audit trail(s) on every call" — what search engines and LLM crawlers index |
| `Privacy.tsx:414` | "part of a hashed integrity chain" |
| `ScoringArchitectureDiagram.tsx:19` | "hash chain" in the diagram label |

## The largest remaining overstatement is not in the copy

Worth stating plainly rather than leaving implicit: after every edit above,
`/v1/verify` still returns **`verified: true`** for records whose ordering and
completeness cannot be evidenced. The plan's own test — a claim returns only when
production behaviour supports every word — applies with full force to the word
`verified` that the API itself emits.

That is an API correction, not a copy one, and it is not in this plan. It
belongs with the checkpoint work in WP14.

## What is deliberately NOT proposed

**No replacement cryptographic claim.** Not "hash-linked", not "integrity-
checked", not a hedged version of tamper-evidence. Per the founder instruction,
a claim only returns when every word is directly supported by production
behaviour, and demonstrating that requires `/v1/verify` to detect the thing the
claim asserts. It currently cannot.

**Not proposed here:** wiring `orderingDisclosureText()` into `/v1/verify`. That
adds a *new* public statement, and the instruction is to remove first. It stays
drafted and unwired in `apps/api/src/lib/chain-integrity-windows.ts`.

## Recommendation

Apply all seven edits. They are subtractive, they need no new claim to be
verified, and they leave the true statement — that an audit record exists and is
independently retrievable — intact.

A claim can be reinstated later on evidence: it needs `/v1/verify` to detect a
fork, and a checkpoint mechanism bounding any future undetected window. Both are
WP14 candidates.
