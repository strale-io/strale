# Public copy correction — integrity and verification claims

**Status: APPLIED, except the npm publish.** The founder approved the
correction itself (DECISION-QUEUE DQ-18 item 2); this document is the exact
surface list, and it is now the record of what was done rather than a proposal.

| section | deploy unit | state |
|---|---|---|
| §1, §2 | `strale-frontend` release | **applied** — re-verified 2026-08-25 against the live bundle at `strale.dev`: zero occurrences of `tamper`, `hash chain`, `immutab`, `cryptographically` or `verifiable` across the served SPA, and `public/llms.txt` clean |
| §3, §4 | `strale` API deploy | **applied** 2026-08-25 |
| §5 | repo commit | **applied** 2026-08-25 |
| §4 npm publish | `strale-mcp` on npm | **not done — founder-gated.** The API deploy fixes the live `/mcp` text, because `routes/mcp.ts` imports from `strale-mcp/tools`. Only the published package version trails. |

§6's "deliberately left alone" list and §7's refusal to publish any replacement
claim both stand unchanged. §8 — `/v1/verify` still returning `verified: true`
for records whose ordering cannot be evidenced — is **not** addressed by any of
this and remains WP14's.

The withdrawn vocabulary is now held by `apps/api/src/lib/withdrawn-integrity-claims.test.ts`,
so it cannot return by someone re-typing a sentence that reads well.

**Version 3.** Version 1 edited seven frontend locations. Version 2 added the
machine-readable API surfaces. Version 3 follows a second independent review
that found five further blocking problems, including a public statement that
remained *false* after every edit in version 2, a diff that did not match the
text it claimed to change, and the one artefact a compliance reviewer actually
receives — the shareable audit page and its PDF — asserting verification
unconditionally. Every surface below has been re-read in the working tree; none
is quoted from the review second-hand.

---

## The evidence this rests on

`/v1/verify` was exercised end-to-end against production, on records chosen to
span the interesting cases:

| Record | `verified` | `chain.length` | `verified_links` | `redacted_links` | `reaches_genesis` |
|---|---|---|---|---|---|
| inside the forked window (June) | **`true`** | 21 | 1 | 20 | `false` |
| second record, same window | **`true`** | 21 | 1 | 20 | `false` |
| after the WP7 fix | `true` | 21 | — | — | `false` |
| redacted row | `hash_valid: null` | 21 | — | 20 | `false` |

The fork itself, measured directly: one parent hash has **150,796 children**,
spanning `2026-05-04T13:45:41Z → 2026-08-21T12:10:16Z`. After that instant the
chain is 1:1 — the WP7 fix holds, and the window recorded in
`apps/api/src/lib/chain-integrity-windows.ts` matches production to the second.

**Records inside the forked window return `verified: true`.** Worse than the
phrase suggests: they return it on a 21-hop walk in which **one link is verified
and twenty are redacted**, so the endpoint reports success across a walk where
95% of the links carry no verifiable content at all.

This is structural, not a bug in the endpoint. It walks the chain **backwards**
via `previous_hash`, and a backward walk is well-defined in a star topology —
each row records exactly one parent no matter how many siblings share it.
Detecting a fork requires looking forward; detecting a deletion requires knowing
what should have been there. Neither is possible from a backward walk. It also
stops at depth 20 (hard cap 50) with `truncated: true`, so it never reaches
genesis.

## What is actually true

| Property | Status |
|---|---|
| A record's **content** is unaltered since hashing | **TRUE** — 99.7% of rows inside the 90-day window verify |
| Records are in a **provable order** | **FALSE** for 2026-05-04 → 2026-08-21 |
| **No record was deleted** from the chain | **FALSE** for the same window |
| An audit record **exists and is independently retrievable** | **TRUE** — `/v1/audit/:id` resolves publicly with a signed token |
| The chain is walked **to genesis** | **FALSE** — depth-capped, always truncated |
| A redacted record's hash still matches | **FALSE by design** — and correctly disclosed |

"Tamper-evident" is defensible for alteration of an individual record. It is not
defensible for ordering or deletion — and those are what most readers of "hash
chain" assume.

## The rule applied below

Remove the security adjective; keep the mechanism. No replacement cryptographic
claim, hedged or otherwise. Where a sentence is not merely overstated but
**false**, correct it to what production does rather than deleting the topic.

Judgement was applied, not a blanket search-and-replace. Four surfaces the
review flagged are **kept**, with reasons, in "Surfaces deliberately left
alone". Stripping true statements is not honesty, it is just less information.

---

# 1. Frontend — user-visible copy

*Deploy unit: `strale-frontend` release.*

### 1.1 `src/pages/Privacy.tsx:42-43` — **states the opposite of production behaviour**

The highest-priority edit in this document. It is not an overstatement; it is
wrong, and production says so in its own words.

```diff
 <strong>Customer-input:</strong> stored alongside the audit record under
 Art.&nbsp;30 (records of processing) for the same period as the audit
-itself; redacted in place when retention expires so the audit-chain
-integrity hash remains verifiable.
+itself; redacted in place when retention expires. The record stays
+retrievable; its content hash deliberately no longer matches, which
+/v1/verify reports as routine retention.
```

Redaction is precisely what makes the hash *not* verifiable. `/v1/verify` on a
redacted row returns `hash_valid: null` and explains: *the row's input/output/
audit_trail were zeroed by design*. The page claimed the opposite mechanism.

### 1.2 `src/pages/AuditRecord.tsx:201, 213` and `src/lib/generate-audit-pdf.ts:119, 129` — the artefact an auditor actually receives

The shareable audit page renders a green check and **"Verified compliance
record"**, with **"Integrity: {input_fingerprint}"** beneath it. The downloadable
PDF renders both lines too. The page fetches `GET /v1/audit/:id?token=` and
**never calls `/v1/verify`** — "Verified" is hardcoded, with no conditional.

Two independent problems: an unearned verdict, and a field labelled "Integrity"
that is the input fingerprint, which covers the input and says nothing about the
chain.

```diff
-<p className="text-sm font-medium text-foreground">Verified compliance record</p>
+<p className="text-sm font-medium text-foreground">Compliance record</p>
```
```diff
 <Fingerprint className="h-3 w-3" />
-Integrity: {audit.input_fingerprint}
+Input fingerprint: {audit.input_fingerprint}
```

Same two substitutions in `generate-audit-pdf.ts` (drop the `✓` with the word).

The green success styling should go with the word — a check mark is a verdict.
Left as a styling note rather than a diff, because it is a component decision.

### 1.3 `src/data/learnGuides.ts:2054` and `:2104` — **the version-2 diff did not match `:2104`**

Version 2 gave one diff for both lines. The string it matched exists only at
`:2054`; `:2104` reads differently and would have kept the word "immutable".

This is the worst line to miss. `LearnGuide.tsx:21` builds the FAQPage JSON-LD
`acceptedAnswer.text` from the first paragraph of `:2104`, so the strongest word
on the site would have survived inside `application/ld+json` structured data on
`/learn/audit-trail-compliance-agent`.

```diff
 :2054
-Every strale.do() call creates an immutable transaction record
+Every strale.do() call creates a durable transaction record
```
```diff
 :2104
-Every Strale API call creates an immutable transaction record on the server side.
+Every Strale API call creates a durable transaction record on the server side.
```

`immutable` was never true independently of this incident — records are redacted
at 90 days by design.

### 1.4 `src/components/AuditTrailSection.tsx:31, 57`

```diff
-body: "Every transaction gets a public URL your team, auditors, or regulators can verify independently. No auth required to read an audit record.",
+body: "Every transaction gets a public URL your team, auditors, or regulators can read independently. No auth required to read an audit record.",
```
```diff
-...regulation mapping — on every transaction. Independently verifiable by any third party.
+...regulation mapping — on every transaction.
```

### 1.5 `src/components/QualityScoringSection.tsx:26-27, 65, 78`

```diff
-Every capability runs through an automated test suite, and every call comes back with a
-verifiable audit record — not a self-reported claim.
+Every capability runs through an automated test suite, and every call comes back with an
+audit record you can retrieve — not a self-reported claim.
```
```diff
-{ name: "Hash-chained record", desc: "Tamper-evident audit trail, retrievable per transaction" },
+{ name: "Audit record", desc: "Retrievable per transaction" },
```
```diff
-Audit records are shareable via a signed URL — no login required to verify one.
+Audit records are shareable via a signed URL — no login required to read one.
```

### 1.6 `src/pages/Methodology.tsx:112, 239`

```diff
 :112
-hash-chained audit record you can verify independently
+audit record you can retrieve independently
```
```diff
 :239
-Every successful transaction produces a hash-chained audit record — tamper-evident, and
-retrievable independently of the original call. It covers who processed the data, where,
-and under what basis, mapped to GDPR Articles 15, 17, and 30.
+Every successful transaction produces an audit record, retrievable independently of the
+original call. It covers who processed the data, where, and under what basis, mapped to
+GDPR Articles 15, 17, and 30.
```

### 1.7 `src/pages/Security.tsx:264-265`

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

### 1.8 `src/pages/Privacy.tsx:328, 414`

```diff
 :328
-controls, audit logging, and tamper-evident audit chains. Detail on
+controls and audit logging. Detail on
```
```diff
 :414
-part of a hashed integrity chain
+part of the audit record
```

### 1.9 `src/pages/CapabilityDetail.tsx:416`, `src/pages/SolutionDetail.tsx:192`

```diff
-If the call fails, you aren't charged. Every successful call returns a hash-chained audit
+If the call fails, you aren't charged. Every successful call returns an audit
```

### 1.10 `src/pages/Index.tsx:198, 327`

```diff
 :198
-<span>HASH-CHAINED · SHAREABLE</span>
+<span>AUDIT RECORD · SHAREABLE</span>
```
```diff
 :327
-that verifiable trail is what agents check before committing resources
+that audit trail is what agents check before committing resources
```

### 1.11 `src/components/ScoringArchitectureDiagram.tsx:19`

```diff
-hash chain
+audit record
```

---

# 2. Frontend — SEO and structured data

*Same deploy unit. Separated because this is what crawlers and LLMs index, and
it is invisible in a visual review of the site.*

### 2.1 `index.html:74` — JSON-LD on **every** route

```diff
 "A2A Agent Card for agent-to-agent communication",
 "x402 pay-per-request micropayments",
-"Hash-chained audit records for every call"
+"Audit records for every call"
```

This sits in `SoftwareApplication.featureList` in the static shell, so it is
served on every path regardless of which page renders.

### 2.2 `src/pages/Methodology.tsx:97`, `src/pages/Security.tsx:120` — meta descriptions

```diff
-a hash-chained audit trail on every call
+an audit trail on every call
```
```diff
-hash-chained audit trails on every call
+audit trails on every call
```

### 2.3 `src/pages/LearnGuide.tsx:21, 78` — no edit required

These build the meta description and the FAQPage JSON-LD from `learnGuides.ts`.
They are fixed by §1.3 and need no change of their own — **provided §1.3 fixes
`:2104`**, which is exactly what version 2 would have missed.

---

# 3. Backend API — live machine-readable surfaces

*Deploy unit: `strale` API deploy. These serve immediately on deploy; no
release is involved.*

### 3.1 `apps/api/src/routes/llms-txt.ts:110` — the strongest claim anywhere

```diff
-produces a chain-hashed audit record retrievable at /v1/audit/{transactionId}
-for downstream regulatory verification
+produces an audit record retrievable at /v1/audit/{transactionId}
```

It asserts *fitness for regulatory verification*, not merely a mechanism. It
goes first.

### 3.2 `apps/api/src/openapi.ts:29`, `routes/a2a.ts:329`, `routes/mcp-server-card.ts:89`, `routes/llms-txt.ts:34`

All four carry the same sentence in one of two phrasings. Live at
`/openapi.json`, `/.well-known/agent-card.json`, `/.well-known/mcp.json` and
`/llms.txt`.

```diff
-Every call returns an audit record with cryptographic chain hashing.
+Every call returns an audit record.
```
```diff
-Every call returns a cryptographically chain-hashed audit record.
+Every call returns an audit record.
```

### 3.3 `apps/api/src/openapi.ts:666` — **false as served**

```diff
-Verify the integrity of a transaction's audit trail by recomputing its SHA-256 hash and
-walking the hash chain backward to genesis. Public, no auth required.
+Recompute a transaction's SHA-256 content hash and walk the recorded chain backward from
+it, up to a bounded depth. Public, no auth required.
```

The endpoint does not reach genesis: default depth 20, hard cap 50. Live
response on any record: `"reaches_genesis": false, "truncated": true,
"truncated_reason": "max_depth_reached (N=20)"`. The replacement describes the
bounded walk that actually happens, which is a mechanism, not a guarantee.

### 3.4 `apps/api/src/routes/audit.ts:620`

```diff
-Transactions executed after the chain was finalised carry hash_valid: true | false on
-/v1/verify and are independently verifiable.
+Transactions executed after the chain was finalised carry hash_valid: true | false on
+/v1/verify.
```

The rest of that disclaimer is accurate and stays: it correctly tells a customer
that a pre-chain transaction is reconstructed and not hash-protected.

### 3.5 `apps/api/src/web3-assurance/methodology.ts:312, 314, 315` — a *methodology* endpoint

Live and unlisted at `/v1/web3-assurance/methodology`. Four claims in one object,
three of them false:

```diff
 audit_trail_policy: {
-  chain: "SHA-256 hash chain, per-day, anchored to GENESIS_HASH = sha256('strale-genesis-v1').",
+  chain: "Each record carries a SHA-256 content hash and a reference to the record it was written after.",
   token: "audit_url uses HMAC-SHA256(secret, `${recordId}:${expiresAt}`) signing with 90-day TTL.",
-  retention: "Indefinite for completed records.",
-  replay_capability: "Each record can be replayed to confirm the evidence trail available at the time the verdict was issued.",
+  retention: "Record metadata is retained for 3 years; record content is redacted at 90 days.",
 },
```

- *"per-day"* is false for 2026-05-04 → 2026-08-21 — 150,796 rows on one parent.
- *"anchored to GENESIS_HASH"* is unreachable by the verifier, which is
  depth-capped and always truncates.
- *"Indefinite"* contradicts the 90-day/3-year retention stated on every other
  surface.
- *"replayed"* is impossible after the 90-day content redaction, so the
  `replay_capability` key is removed rather than reworded. Nothing true replaces
  it; it should not have been there.

`audit_url` line 270 — *"sidecar URL to hash-chained audit record"* → *"sidecar
URL to the audit record"*.

---

# 4. `strale-mcp` — both a deploy surface and a package

**Version 2 misclassified this as npm-only.** `apps/api/src/routes/mcp.ts:33`
imports `from "strale-mcp/tools"`, so the production `/mcp` endpoint serves
`strale_methodology` verbatim. **A deploy fixes the live text immediately**; the
npm version bump only trails it. Deploy with §3, publish after.

`packages/mcp-server/src/tools.ts`:

```diff
 :935
-covers test cadence, audit-trail integrity, and provenance
+covers test cadence, audit records, and provenance
```
```diff
 :943
-Every call returns a chain-hashed audit record.
+Every call returns an audit record.
```
```diff
 :950-951
-...latency, price, and an integrity_hash chained to the previous transaction. Retrieve via
-/v1/audit/{transactionId} or programmatically via strale_transaction.
-The chain is independently verifiable at /v1/verify/{transactionId} — Counterparty Assurance
-and standalone capability calls both produce the same chain shape.
+...latency, price, and a content hash. Retrieve via /v1/audit/{transactionId} or
+programmatically via strale_transaction.
```

Separately, that deleted sentence names **Counterparty Assurance**, which
DEC-20260812-A retired as a product framing. Removing it closes a second drift
that has nothing to do with integrity claims.

The other nine SDK and framework packages are clean.

---

# 5. Repo and published docs

*Public on GitHub. No deploy; a commit is the release.*

### 5.1 `README.md:17`

```diff
-every call returns an audit record with cryptographic chain hashing
+every call returns an audit record
```

### 5.2 `docs/x402-listing.md:75-76` — copy for the public Coinbase x402 / Bazaar listing

```diff
-- **Auditable.** Every call returns provenance and a hash-chained audit record,
+- **Auditable.** Every call returns provenance and an audit record,
   which matters when your own customers ask where a fact came from.
```

### 5.3 `docs/dpia/sanctions-and-pep-check.md:99`, `docs/dpia/adverse-media-check.md:75`

Both list *"audit chain integrity"* and *"replay capability"* as delivered
DEC-20260428-B controls in a published DPIA — a document type whose whole purpose
is an accurate statement of controls.

```diff
-manifest per response, audit chain integrity, dispute endpoint,
-replay capability, golden test suite, per-list source citation.
+manifest per response, per-record audit hashing, dispute endpoint,
+golden test suite, per-list source citation.
```

`replay capability` is removed for the same reason as §3.5: the 90-day content
redaction makes replay impossible, so a DPIA must not list it as a control that
exists.

---

# 6. Surfaces deliberately left alone

Named explicitly so the next reviewer can disagree with a decision rather than
find a gap.

| Surface | Text | Why it stays |
|---|---|---|
| `Methodology.tsx:250-253` | "a signed link anyone can open to verify the transaction happened" | Claims existence and independent retrieval, both true. It does not claim integrity, ordering or completeness. |
| `Methodology.tsx:410` | "raw provenance and audit data are exposed per call so you can verify independently rather than trust a summary score" | About verifying *quality claims from raw data*, not chain integrity. True, and it is a disclosure of our own evaluator conflict — weakening it would be a loss. |
| `AuditTrailSection.tsx:40-41` | "Input hashing for integrity" / "You can prove what your agent sent" | The input fingerprint is really computed and stored per record, and really does let a customer confirm a stored input matches what they sent. Narrow, mechanical, supported. |
| `transactions.ts:230, 270` | legacy disclosure and redaction disclosure | Both *are* the disclosures. `:270` says the content hash no longer matches by design — that is the platform being honest, not overclaiming. |

`public/llms.txt`, `public/openapi.json`, `public/.well-known/*`, `robots.txt`,
`_headers`, `sitemap.xml`: verified clean by direct grep — no integrity, tamper,
hash-chain or immutability claim.

---

# 7. What is deliberately NOT proposed

**No replacement cryptographic claim.** Not "hash-linked", not
"integrity-checked", not a hedged tamper-evidence. A claim returns only when
every word is supported by production behaviour, and demonstrating that requires
`/v1/verify` to detect the thing the claim asserts. It currently cannot.

**Not wiring `orderingDisclosureText()` into `/v1/verify`.** That adds a *new*
public statement, and the instruction is to remove first. It stays drafted and
unwired in `apps/api/src/lib/chain-integrity-windows.ts` — its only importer is
its own test.

---

# 8. The largest remaining overstatement is not in the copy

After every edit above, `/v1/verify` still returns **`verified: true`** for
records whose ordering and completeness cannot be evidenced — including, as
measured, records where twenty of twenty-one links are redacted.

The test this whole document applies — a claim returns only when production
behaviour supports every word — applies with full force to the word `verified`
that the API itself emits. That is an API correction, not a copy one, and it is
not in this plan. It belongs with the checkpoint work in **WP14**, alongside
making `/v1/verify` able to detect a fork and bounding any future undetected
window. A claim can be reinstated on that evidence.

---

# 9. Sequencing

1. **API deploy** (§3 + §4 `tools.ts`, which serves live via `/mcp`). Fastest to
   land, and it removes the strongest claim on the platform.
2. **Frontend release** (§1 + §2). The compliance-reviewer-facing artefacts
   (§1.1, §1.2, §1.3) are the priority within it.
3. **Repo commit** (§5).
4. **npm publish** of `strale-mcp` with a version bump, trailing the deploy.

Every edit is subtractive or a correction of a false statement to what
production does. None introduces a claim that would itself need verifying.
