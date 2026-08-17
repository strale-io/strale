# Draft comment for a2aproject/A2A discussion #741

> Review this before posting. Post manually at:
> https://github.com/a2aproject/A2A/discussions/741

---

We've been running a live A2A endpoint at Strale (capability marketplace — 256 capabilities, 81 solutions) and want to share some observations from the provider side that might inform the registry design.

**Agent Card URL:** `https://api.strale.io/.well-known/agent-card.json` (337 skills, public)

### Quality metadata should be a first-class registry field

Our Agent Card includes a quality score (SQS, 0-100) in each skill description because there's no structured field for it. Orchestrator agents making routing decisions need to compare capabilities on reliability, not just existence. A registry schema that supports `quality` or `reliability_score` fields per skill would let orchestrators make better decisions without parsing description strings.

### Skill-level search matters more than agent-level search

An orchestrator looking for "VAT validation in Sweden" shouldn't need to discover Strale first and then search our 337 skills. The registry should support searching across all skills from all agents — returning the specific skill ID + agent URL, not just the agent card URL. This is how package registries (npm, PyPI) work: you search for a package, not for a publisher.

### Pragmatic registration path for v1

We support the "centralized catalog first, federation later" approach from the recent implementation proposal. For commercial providers like us, the registration flow should be:

1. POST agent card URL to the registry
2. Registry fetches and validates the card
3. Skills indexed and searchable immediately
4. Periodic re-fetch to pick up changes (our card is dynamic — skill count and SQS scores update hourly)

We'd be happy to serve as a test case for the registry spec — 337 skills across 7 categories with live quality scores is a nontrivial discovery workload.
