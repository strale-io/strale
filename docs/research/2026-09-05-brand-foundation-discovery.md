---
doc_type: research
type: positioning
topic: brand-foundation-discovery
question: What product evidence, existing design work, and reference practices should inform Strale's brand and website program?
date: "2026-09-05"
status: current
sources:
  - docs/strategy/2026-08-05-direction-plan.md
  - docs/company/GOALS.md
  - docs/company/VOICE.md
  - docs/company/claims.yaml
  - design/README.md
  - design/PROVENANCE.md
  - docs/design/execution-receipt/README.md
  - apps/api/src/routes/x402-gateway-v2.ts
  - apps/api/src/lib/provenance-builder.ts
  - apps/api/src/lib/piggyback-monitor.ts
  - apps/api/src/lib/test-runner.ts
  - https://github.com/amirmushichge/brand-system-skill
  - https://brand.bang-olufsen.com/hub/3
  - https://brandstandards.hermanmiller.com/composition
  - https://brand.sinch.com/d/3B2erdjqNWPY/guidelines#/writing/the-sinch-voice
  - https://brand.trustpilot.com/d/SAqmzDjBcZUz/guidelines#/welcome/introduction
  - https://iamgloria.com/
---

# Brand foundation discovery

Research, not adopted positioning, approved public copy, or a replacement design system. Commissioned by the founder on 5 September 2026. The [program](../programs/brand-website/PROGRAM.md) is the continuation entry point. Detailed commercial evidence and the recommendation for founder discussion are in the private [assessment](https://github.com/strale-io/strale-context-archive/blob/7d3fd428a93da43a7298305cc237abd7b10af1f0/archive/sessions/2026-09-05-brand-foundation/ASSESSMENT.md).

## What was examined

Public code at `cd520460`: discovery/MCP documentation, execution and payment routes, receipt/audit/provenance construction and retrieval, test scheduler/runner, lightweight customer-output monitoring, and the business measurement modules. Read-only production aggregation used the existing external-customer filter and completed ISO weeks; no customer request or response bodies were extracted. Public catalogue and platform-facts responses were captured. Customer identifiers were replaced by within-window ranks. Detailed evidence remains in the private archive; the public receipt commits to its files by digest.

Strategy sources included the adopted August direction and its Notion decision, GOALS, claims/voice, program orientation, and the preserved August website handoff. Notion search also returned superseded compliance and dual-domain stories; these were treated as history, not silently adopted over DEC-20260812-A. The founder confirmed that the largest customer's business and motivation are unknown.

Design sources included the live homepage, current logo asset, token/provenance registers, and the preserved Round 23 typography, system-mechanics, artwork and copy specifications. Brandkit-lab's brief/brand schemas, lint emitter, product/process documents and recorded logo experiment were inspected. The listed external references were opened through web and browser tools, including the article's actual linked GitHub `SKILL.md` and `BENCHMARK.md`.

This is a discovery assessment, not a complete executor audit, a new product verification suite, a complete audiovisual review, or a visual acceptance of every historical image and logo variant.

## Findings

The [discovery evidence receipt](../../archive/receipts/2026-09-04-audit-brand-foundation-discovery.json) records SHA-256 commitments to the private measurement artifacts. Its filename follows UTC; this document follows the founder's Stockholm session date.

### Strategy needs a clear hierarchy

The live homepage and README lead with trust/quality infrastructure and compliance examples. The adopted August direction instead puts the broad library and per-call access first. The preserved website handoff leads with one connection to external tools. These are different layers of product history. A new design brief must identify the chosen promise, the concrete customer jobs illustrating it, and the evidence supporting each claim.

The August plan's inference that a missing browser origin means a website is only documentation is too strong: server-to-server calls need not preserve a visitor's website journey. Payment-route adoption is likewise behaviour, not an experiment identifying the sole reason for purchase. Both should remain distinguishable from the adopted commercial direction. See the private assessment for measured purchasing patterns and candidate positioning. No strategic decision was superseded in this session.

### Inspection is valuable, but several different products are being conflated

- Provenance describes a source or processing event.
- Audit records describe a Strale execution and its metadata.
- The new execution receipt binds specified request/result/implementation information through a canonical digest and the existing integrity chain.

The [receipt rollout record](../design/execution-receipt/README.md) explicitly states that receipts are produced but not served by an endpoint. This is compatible with the existence of older audit retrieval and server-operated chain verification. It does not establish a customer-exportable independent verification product. The [receipt spec](../design/execution-receipt/PHASE-2-SPEC.md) explicitly excludes source correctness and issuer authentication from what an unsigned digest proves.

There is a concrete source-level parity gap: [the x402 route](../../apps/api/src/routes/x402-gateway-v2.ts) returns executor provenance in `_meta.provenance`, while `recordX402Transaction` does not persist that executor provenance into the dedicated transaction field. The audit builder still writes a declared `data_source`; absence of the dedicated field must not be described as absence of all source information. The [receipt settlement code](../../apps/api/src/lib/receipt/settle.ts) derives source observation from stored provenance. Scope and persistence need checking together before making stronger historical evidence claims.

None of these features traces the entire agent, explains its reasoning, or observes work performed outside Strale.

### Testing should be explained by what a check can establish

The [test runner](../../apps/api/src/lib/test-runner.ts) has schema-definition checks, known-answer assertions, negative/boundary cases, fixture and canary paths. The [scheduler](../../apps/api/src/jobs/test-scheduler.ts) and cost rules determine when those paths run. A schema-definition test does not establish that an upstream was reachable; a fixture test is not a live observation; a successful execution is not a guarantee of factual correctness.

The [lightweight monitor](../../apps/api/src/lib/piggyback-monitor.ts) checks non-null required top-level fields. It is not recursive JSON Schema validation. Its callers are in `/v1/do`, while the separate x402 route has its own outcome and audit checks. Test-record modes joined to today's suite configuration should not be presented as immutable evidence of historical network execution.

The useful next question is how well each important tool is covered on the route customers actually use. A catalogue-wide score or a large test count would obscure that. Any follow-up implementation belongs in a bounded product batch with the applicable test and review protocols.

### Many rules exist; their adoption and enforcement are incomplete

[Design provenance](../../design/PROVENANCE.md) records the live website baseline and two candidate lineages. The preserved Round 23 material already contains component geometry, responsive typography, motion timings and four atmospheric artwork roles. It would be inaccurate to say Strale has no rules for these things.

However, [the design checker](../../design/README.md) currently enforces selected internal report surfaces. The website tokens are a snapshot, not yet a website build input. The claims scanner also checks selected text files, not every rendered website page or media asset. Token compliance alone cannot enforce editorial hierarchy, useful messaging, or cohesive illustrations.

The next audit must compare actual light/dark assets and logo variants in context. Existing specification claims that an image is approved or cohesive are inputs to review, not a substitute for looking at the asset. The live homepage's density and repeated audit/trust explanations support treating page composition and editorial selection as first-class design work.

## What to take from the references

| Source inspected | Useful mechanism | Limit on the inference |
| --- | --- | --- |
| [B&O](https://brand.bang-olufsen.com/document/3#/brand-position/brand-position) | Brand position leads to voice, type, materials, imagery and applications. | Borrow a system relationship, not a luxury-product identity. |
| [Herman Miller composition](https://brandstandards.hermanmiller.com/composition), [infographics](https://brandstandards.hermanmiller.com/infographics) | Clear visual hierarchy and context-specific colour/application guidance. | A colour palette alone is insufficient; its relationships matter. |
| [Sinch voice](https://brand.sinch.com/d/3B2erdjqNWPY/guidelines#/writing/the-sinch-voice) | Voice principles accompanied by contrasting copy examples and context-sensitive tone. | The supplied site identifies itself as “Style Guide – Old”; treat it as a historical reference. |
| [Trustpilot](https://brand.trustpilot.com/d/SAqmzDjBcZUz/guidelines#/welcome/introduction) | A navigable home for writing, localisation, imagery, motion, icons and co-branding. | Module breadth was inspected, not every detailed rule. |
| [Mushich article](https://x.com/AmirMushich/status/2095182776249049456), [GitHub workflow](https://github.com/amirmushichge/brand-system-skill) | Establish an approved visual anchor, assign reference roles, critique contradictions before scaling, preserve checkpoints. | Alpha prompt workflow/manual benchmark, not executable enforcement. Adapted text requires its CC-BY-4.0 attribution. No skill was installed or made authoritative. |
| [Gloria](https://iamgloria.com/) | Prominent click-to-play product explainer and coordinated static/video identity. | Observed film focuses on customer support while the page describes a broader platform. Placement is an inspiration, not proof of conversion effectiveness. |

Brandkit-lab already models evidenced/stated/derived inputs and emits some prose/CSS lint configurations. Reuse those mechanisms selectively. Its recorded logo experiment found model aesthetic scores did not predict the founder's choices; automated conformance checks should not replace review of comparable rendered applications. These local components were inspected, not rerun or certified as ready for Strale.

## Consequence for the program

Start with positioning and the proof boundary. Develop a small set of coherent directions through identical real applications. Adopt one, then build the reusable system and website. Define the extension process for future channels instead of trying to produce every future asset before launch. Keep measured facts, model hypotheses, founder decisions, and approved brand assets distinguishable in both human and machine views.
