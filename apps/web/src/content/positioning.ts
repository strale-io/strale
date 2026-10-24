// The positioning sentence and short description, as data (SITE-STRUCTURE.md,
// "Machine-readable surfaces"): page meta, llms.txt and the other machine
// surfaces read these instead of restating them. DEC-20261023-B sets the story;
// the level-1 lines are MESSAGING-LEVELS.md's, adopted by DEC-20261024-B.
// No counts here: counts are rendered from /v1/platform/facts.

export const SENTENCE = "Strale is a library of tools AI agents use and pay for per call, through one connection instead of an account with each provider.";

export const SHORT_DESCRIPTION =
  "Tools for AI agents, paid per call: web search, document reading, data checks, company records from official sources in many countries, and sanctions and adverse-media screening. Connect once over MCP, the REST API or x402.";

/** Level 1 — what the agent builder gains. */
export const L1 = {
  headline: "Give your agent a new tool without opening another provider account.",
  support: "Add tools as your agent’s work grows, through the connection you already have.",
  perCall: "Pay per call, with no subscription or contract.",
  x402: "Let your agent pay its own way: on eligible tools, an x402 wallet pays per request and nobody signs up.",
} as const;
