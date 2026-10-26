// Editorial text for the docs pages. Facts (limits, statuses, tool names,
// package names) are read from the code by src/lib/code-facts.ts and
// src/lib/snippets.ts; this file only explains them. test/editorial.test.ts
// fails when an error code the call routes return has no entry here, or an
// entry names a code that does not exist.

export interface ErrorHelp {
  meaning: string;
  /** What the caller should do. */
  action: string;
  /** Safe to retry the same request unchanged, with the same Idempotency-Key. */
  retry: boolean;
}

export const ERROR_HELP: Record<string, ErrorHelp> = {
  invalid_request: { meaning: "The body is malformed, a required field is missing, or a value is out of range (for example max_price_cents above the hard limit).", action: "Fix the request; the message names the field.", retry: false },
  unauthorized: { meaning: "The API key is missing, wrong or revoked, on a route or tool that needs one.", action: "Send Authorization: Bearer <key>.", retry: false },
  insufficient_balance: { meaning: "The wallet balance is below the tool’s price. Nothing was charged.", action: "Top up, then call again.", retry: false },
  budget_exceeded: { meaning: "The tool or bundled check costs more than the max_price_cents you sent. Nothing was charged.", action: "Raise the cap if the price is acceptable.", retry: false },
  spend_cap_exceeded: { meaning: "The call would take the account past its hourly spend limit.", action: "Wait for the hour to roll over.", retry: true },
  no_matching_capability: { meaning: "No tool matches the capability_slug or the task you sent.", action: "Check the slug against GET /v1/capabilities.", retry: false },
  not_found: { meaning: "The tool, bundled check or transaction does not exist or is not visible.", action: "Check the identifier.", retry: false },
  idempotency_key_reused: { meaning: "This Idempotency-Key was already used for a different request.", action: "Use a new key for new work.", retry: false },
  freshness_check_failed: { meaning: "You sent require_fresh, and the tool’s reference data is older than its update cycle.", action: "Drop require_fresh or try later.", retry: false },
  latency_threshold_exceeded: { meaning: "You sent max_latency_ms, and the tool’s recent 95th-percentile latency is above it.", action: "Raise or drop max_latency_ms.", retry: false },
  rate_limited: { meaning: "Too many requests in the window, or the free daily limit is used up. When details.retry_after_seconds is present, it says when to retry.", action: "Back off and retry after that time.", retry: true },
  capability_unavailable: { meaning: "The tool is paused after repeated source failures, is not set up to run, or is not available over x402. Nothing was charged.", action: "Retry later or use another tool.", retry: true },
  execution_failed: { meaning: "The tool ran and failed, often because its source failed or refused. Nothing was charged.", action: "Read the message; retry if the source was temporarily down.", retry: true },
  timeout_exceeded: { meaning: "The tool did not answer in time. Nothing was charged.", action: "Retry with the same Idempotency-Key.", retry: true },
  transaction_finalization_failed: { meaning: "A bundled check ran but its record could not be saved. The wallet was refunded.", action: "Retry the same inputs.", retry: true },
};

/** The four ways in, in the order SITE-STRUCTURE page 10 lists them. */
export const ROUTES = [
  { id: "mcp", href: "/docs/mcp", title: "MCP", line: "Add Strale to Claude, Cursor or any MCP client. The agent searches the catalogue and calls tools itself." },
  { id: "api", href: "/docs/api", title: "REST API", line: "POST /v1/do with a tool name and inputs. One API key for every tool." },
  { id: "sdks", href: "/docs/sdks", title: "SDKs", line: "TypeScript and Python clients for the same calls, plus framework packages." },
  { id: "x402", href: "/docs/x402", title: "x402", line: "No account: pay per request in USDC from a wallet, on eligible tools." },
] as const;

/** MCP tools worth naming in the docs, with what each is for. Checked against the server's registered tools. */
export const MCP_TOOL_HELP: Record<string, string> = {
  strale_search: "Find a tool for a job, with its inputs and price.",
  strale_execute: "Call a tool by slug with inputs and a price cap.",
  strale_balance: "Read the wallet balance (needs a key).",
  strale_getting_started: "A short orientation for the agent: free tools, how to pay.",
  strale_ping: "Check the connection.",
};

/** Display names for framework packages, by package directory. A new package needs a label (test/editorial.test.ts). */
export const FRAMEWORK_LABEL: Record<string, string> = {
  "composio-strale": "Composio",
  "crewai-strale": "CrewAI",
  "langchain-strale": "LangChain",
  "semantic-kernel-strale": "Semantic Kernel",
};
