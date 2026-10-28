// T14 model registry — the only place an AI model id lives.
// Spec: archive/sessions/2026-09-02-t14-cheap-extras-plan.md (part B).
//
// Every capability, embeddings call, and digest job imports a ROLE from
// MODELS rather than writing a model-id string literal. The id is
// unchanged from what each site called before this registry existed —
// this is a pure refactor, not a model change — but the id now has one
// home, a recorded pin date, and (where one exists) a decision reference.
//
// apps/api/scripts/check-model-literals.mjs fails CI on any literal
// matching the vendor-id shape outside this file and outside *.test.ts.
//
// Roles are named by WHAT they're for, not by vendor/tier, so a future
// model swap (or vendor swap) only ever touches this file.
import { createHash } from "node:crypto";

export interface ModelEntry {
  /** Exact id passed to the vendor SDK/API. */
  id: string;
  /** Calendar date this id first appeared in the codebase (git blame/log -S), or the date it was pinned here if newly introduced. */
  pinned_at: string;
  /** DEC id that named this model choice, or "unrecorded" when no decision record ties the choice — most of these were picked as "cheapest capable model per task" (docs/company/BUDGET.md standing rule #1), not through a formal decision. */
  decision: string;
  /** What this role is used for. */
  purpose: string;
}

export const MODELS = {
  /**
   * The default model for AI-generation / extraction / classification
   * capabilities (transparency_tag ai_generated or mixed) — roughly 90
   * executor files: summarizers, code generators, extractors, classifiers.
   * Also used for the CEO dashboard's plain-English commit rewrite.
   */
  capability_default: {
    id: "claude-haiku-4-5-20251001",
    pinned_at: "2026-02-26",
    decision: "unrecorded",
    purpose: "Default model for AI-generation/extraction/classification capabilities — cheapest capable model per task (BUDGET.md standing rule #1).",
  },

  /**
   * The higher-reasoning model for capabilities that synthesize
   * structured findings into a narrative and need more judgement than
   * the default tier — currently risk-narrative-generate only.
   *
   * Cert-audit Y-10 (model pinning for replay determinism): this stays
   * on the `claude-sonnet-4-6` MOVING ALIAS, not a dated snapshot,
   * because as of 2026-04-30 Anthropic's GET /v1/models endpoint only
   * publishes the alias for Sonnet 4.6 — no dated snapshot
   * ("claude-sonnet-4-6-YYYYMMDD") exists yet. Setting this to a
   * fabricated snapshot id would 404 every call. The capability records
   * `provenance.model_resolved` (the snapshot Anthropic actually
   * resolved to per call) so replay evidence doesn't depend on this
   * field alone. When Anthropic publishes a dated snapshot, update the
   * id here.
   */
  capability_reasoning: {
    id: "claude-sonnet-4-6",
    pinned_at: "2026-04-10",
    decision: "unrecorded",
    purpose: "Higher-reasoning model for structured-findings-to-narrative synthesis (risk-narrative-generate). Alias, not a dated snapshot — see comment above.",
  },

  search_rank: {
    id: "claude-haiku-5-5",
    pinned_at: "2026-10-26",
    decision: "DEC-20261026-A",
    purpose: "Ranks catalogue items against a natural-language search query for POST /v1/suggest.",
  },

  /** Model used by the daily CEO/ops digest's synthesis step. */
  digest: {
    id: "claude-sonnet-4-20250514",
    pinned_at: "2026-04-01",
    decision: "unrecorded",
    purpose: "Synthesizes the daily digest narrative from the day's operating signals (apps/api/src/lib/daily-digest/analyze.ts).",
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelRole = keyof typeof MODELS;

/**
 * sha256 hex digest of a system-prompt string. Capabilities that build a
 * system prompt add this to their provenance object (alongside the model
 * id already recorded there) so a specific transaction's prompt lineage is
 * reconstructible without storing the prompt text itself in every row.
 */
export function promptDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** USD per million tokens, standard global API (not batch). Source read 2026-10-27. */
interface TokenPrice {
  input: number; output: number; cache_write_5m: number; cache_write_1h: number; cache_read: number;
  pinned_at: string; source: string;
  long_prompt?: { threshold: number; input: number; output: number; cache_write_5m: number; cache_write_1h: number; cache_read: number };
}
const PRICE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const MODEL_PRICES: Record<ModelRole, TokenPrice> = {
  capability_default: { input: 1, output: 5, cache_write_5m: 1.25, cache_write_1h: 2, cache_read: 0.10, pinned_at: "2026-10-27", source: PRICE_SOURCE },
  capability_reasoning: { input: 3, output: 15, cache_write_5m: 3.75, cache_write_1h: 6, cache_read: 0.30, pinned_at: "2026-10-27", source: PRICE_SOURCE },
  digest: { input: 3, output: 15, cache_write_5m: 3.75, cache_write_1h: 6, cache_read: 0.30, pinned_at: "2026-10-27", source: PRICE_SOURCE },
  search_rank: { input: 0.10, output: 0.50, cache_write_5m: 0.125, cache_write_1h: 0.20, cache_read: 0.01, pinned_at: "2026-10-27", source: PRICE_SOURCE,
    long_prompt: { threshold: 100_000, input: 0.50, output: 2.50, cache_write_5m: 0.625, cache_write_1h: 1, cache_read: 0.05 } },
};
