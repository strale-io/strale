# Capability-evidence backfill — 2026-07-16 (agent-researched; cross-provider APPROVED 2026-07-17, see §Legitimacy review)

Trigger: the 2026-07-16 routing incident (see commit `5bfddc3`) exposed registry gaps that the
missing-data penalty now surfaces instead of silently excluding: `precision` unscored for
claude-opus-4-8 and claude-fable-5; `design-judgment`, `copywriting`, `strategic-judgment`
unscored for gpt-5.6-sol. This note is the provenance record for the backfilled scores.

Method: comparative public-evidence assessment, same standard as the 2026-07-14 "ratified
comparative benchmarks" scores — anchored against the existing scored scale (Sol precision 94,
GPT-5.5 88, Terra 89, Sonnet 87, Haiku 78; Fable strategic-judgment 98 / design-taste 98 /
copywriting 97; Opus strategic-judgment 95 / design-taste 94). Independent sources outweigh
vendor claims. Confidence recorded as **medium** (public evidence, no in-house eval yet).
Legitimacy: originally flagged for founder ratification; superseded 2026-07-17 by the
agent-owned method (provenance + cross-provider review + empirical correction — see the
§Legitimacy review at the end and MODEL-OS.md §6).

## claude-opus-4-8 · precision → 93

- Independent hands-on review: "much higher precision" vs prior Opus; follows instructions
  literally, won't silently generalize or infer unrequested work (apito.ai hands-on, 2026-07).
- Code-review precision benchmark: Opus 4.8 35.5% actionable / 26.5% full precision — ABOVE
  Fable 5 (32.8% / 19.4%) (coderabbit.ai Opus 4.8 benchmark).
- BenchLM model page (fetched 2026-07-16): GPQA Diamond 93.6, SWE-bench Verified 88.6,
  OSWorld-Verified 83.4 first-attempt; overall 84/100, verified-leaderboard #1.
- Anchor: below Sol's ratified 94 (no evidence Opus exceeds Sol on exactness; Sol leads the
  agentic-exactness suite), clearly above GPT-5.5's 88. → **93**.

## claude-fable-5 · precision → 91

- Instruction-following rank #14/79, avg 88.1 (BenchLM); "sticks closer to requirements without
  unsolicited changes when given detailed specs" (vellum/mindstudio roundups).
- BUT: below Opus on code-review precision (32.8/19.4 vs 35.5/26.5); documented failure modes —
  runs without stop conditions unless capped; can read a mistake as "intended design"
  (coderabbit Fable 5 review).
- Anchor: above GPT-5.5 (88) and Terra (89), below Opus (93). → **91**.

## gpt-5.6-sol · design-judgment → 88

- Vendor claim (openai.com GPT-5.6 launch): "step change in design judgment… tasteful,
  ergonomic, functional interfaces" from high-level direction. CONTRADICTION CHECK: independent
  reviews temper this — "Fable has better, dare I say, taste; I trust its judgment more on
  large architectural decisions and UI design" (every.to vibe check); scope failure on the
  Senior-Engineer benchmark (12.9k-line oversized system).
- Execution-design within clear constraints is genuinely strong (chose its own workable visual
  direction; inspects rendered output and fixes visual issues).
- Anchor: meaningfully below Fable design-taste 98 / Opus 94; strong-but-not-taste-lane. → **88**.
- NOTE: vocabulary carries both `design-judgment` (qualified lists, classifier) and
  `design-taste` (Fable/Opus scores) — unification is a follow-up, not done here.

## gpt-5.6-sol · copywriting → 85

- Every writing benchmark: Sol placed LAST of six models; hardest-to-read prose (highest
  Flesch-Kincaid); "missed consequential changes… blurred the mechanism" as an editor.
- Blind 64-output creative test (usenoren.ai): Fable 5 beat Sol in all eight genre comparisons
  (judge-bias caveat noted by the authors; result held across non-Claude judges for fiction).
- Strengths with scaffolding: promotional email with predefined audience/goals, fast revision
  loops, strong use of style guides/samples ("stronger than Claude models at using context like
  style guides", every.to).
- Anchor: Fable 97; capable-with-constraints but weak editorial judgment. → **85**.

## gpt-5.6-sol · strategic-judgment → 84

- "Its judgment is strongest during execution and weaker when it has to decide what the whole
  system should become"; "Sol's main weakness is fuzzy judgment… for architectural debate,
  product tradeoffs, or a plan with several defensible paths, I would still run Fable or Sonnet
  in parallel" (every.to; echoed by the review roundup).
- Vendor lists strategic analysis as an intended use; treated as aspirational vs the independent
  execution-vs-direction split.
- Anchor: Fable 98, Opus 95; Sol's gap is exactly at open-ended direction-setting. → **84**.

## Sources

- https://benchlm.ai/models/claude-opus-4-8 (fetched 2026-07-16)
- https://benchlm.ai/models/claude-fable
- https://apito.ai/en/blog/news/claude-opus-4-8-hands-on-review/
- https://www.coderabbit.ai/blog/opus-4-8-release
- https://www.coderabbit.ai/blog/fable-5-model-review
- https://openai.com/index/gpt-5-6/
- https://every.to/vibe-check/gpt-5-6-sol (fetched 2026-07-16)
- https://usenoren.ai/blog/gpt-vs-claude-writing-test
- https://benchlm.ai/blog/posts/best-llm-writing
- https://www.ai.joaoqueiros.com/blog/gpt-5-6-sol-review-roundup-codex-strengths
- https://www.vellum.ai/blog/claude-fable-5-and-mythos-5-benchmarks-explained
- https://www.mindstudio.ai/blog/claude-fable-5-vs-gpt-5-5-comparison

## Legitimacy review (2026-07-17) — replaces founder ratification

Founder direction 2026-07-17: capability scores are never a founder ask ("you know I can't give
scores per model manually"). Method ratified instead: provenance note + cross-provider review +
empirical posterior correction (MODEL-OS.md §6).

Cross-provider review: gpt-5.6-sol@high via dispatch.mjs --mode review, task
`capability-score-legitimacy-r1`, exact identity verified. **Verdict: APPROVE — all five scores
defensible as medium-confidence priors.** Reviewer's material notes: (1) conflict-of-interest
caveat stated (Sol reviewing Sol's scores; judgment unchanged, the low judgment-capability
priors stand); (2) strategic-judgment 84 is the least-secure score (evidence traces largely to
one independent review + a derivative roundup) — empirical correction matters most there;
(3) opus-vs-sol precision gap (93 vs 94) is judgmental, not benchmark-derived, within scale.
Registry labels updated accordingly.
