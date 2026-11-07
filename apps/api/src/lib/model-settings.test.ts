import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

const { messageCreate } = vi.hoisted(() => ({ messageCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: messageCreate }; } }));

import { applyModelSettings, createAnthropicClient } from "./anthropic-client.js";
import { buildSearchRequest } from "./search/smart.js";
import { MODELS, MODEL_CANDIDATES, MODEL_PRICES } from "./models.js";

type Params = Anthropic.Messages.MessageCreateParamsNonStreaming;
const base = (extra: Partial<Params> = {}): Params => ({
  model: MODELS.capability_default.id,
  max_tokens: 100,
  messages: [{ role: "user", content: "x" }],
  ...extra,
});

describe("applyModelSettings", () => {
  it("leaves a request alone for a model with no settings (every current role)", () => {
    const params = base({ temperature: 0 });
    expect(applyModelSettings(params, undefined)).toBe(params);
    for (const entry of Object.values(MODELS)) expect("settings" in entry).toBe(false);
  });

  it("adds thinking, drops sampling and scales the budget, without mutating the caller's object", () => {
    const params = base({ temperature: 0, top_p: 0.5, top_k: 5 });
    const next = applyModelSettings(params, { thinking: { type: "disabled" }, drop_sampling: true, max_tokens_scale: 1.3 });
    expect(next).toMatchObject({ thinking: { type: "disabled" }, max_tokens: 130 });
    expect(next).not.toHaveProperty("temperature");
    expect(next).not.toHaveProperty("top_p");
    expect(next).not.toHaveProperty("top_k");
    expect(params).toMatchObject({ temperature: 0, max_tokens: 100 });
  });

  it("keeps a call's own thinking setting and rounds the budget up", () => {
    const next = applyModelSettings(base({ max_tokens: 10, thinking: { type: "adaptive" } }), { thinking: { type: "disabled" }, max_tokens_scale: 1.3 });
    expect(next.thinking).toEqual({ type: "adaptive" });
    expect(next.max_tokens).toBe(13);
  });
});

describe("the client applies the registered model's settings", () => {
  it("sends what the model's registry entry asks for", async () => {
    const entry = MODELS.capability_default as unknown as Record<string, unknown>;
    const saved = { ...entry };
    entry.settings = { drop_sampling: true, max_tokens_scale: 2 };
    try {
      messageCreate.mockResolvedValueOnce({ content: [], usage: { input_tokens: 1, output_tokens: 1 } });
      await createAnthropicClient({ apiKey: "test" }).messages.create(base({ temperature: 0 }));
      const sent = messageCreate.mock.calls[0][0] as Params;
      expect(sent.max_tokens).toBe(200);
      expect(sent).not.toHaveProperty("temperature");
    } finally {
      for (const key of Object.keys(entry)) delete entry[key];
      Object.assign(entry, saved);
    }
  });
});

describe("the capability_default candidate", () => {
  const candidate = MODEL_CANDIDATES.capability_default!;
  it("is Haiku 5.5 with the settings it needs to stand in for Haiku 4.5", () => {
    expect(candidate.entry.id).toBe(MODELS.search_rank.id);
    expect(candidate.entry.settings).toEqual({ thinking: { type: "disabled" }, drop_sampling: true, max_tokens_scale: 1.3 });
  });
  it("is priced as Haiku 5.5, including the long-prompt rate", () => {
    expect(candidate.price).toEqual(MODEL_PRICES.search_rank);
    expect(candidate.price.long_prompt?.threshold).toBe(100_000);
  });
});

describe("settings are per model id, so roles sharing an id must agree", () => {
  it("every role that uses a model id carries the same settings", () => {
    const byId = new Map<string, string>();
    for (const [role, entry] of Object.entries(MODELS)) {
      const settings = JSON.stringify((entry as { settings?: unknown }).settings ?? null);
      const seen = byId.get(entry.id);
      if (seen !== undefined) expect(settings, `${role} disagrees with another role on ${entry.id}`).toBe(seen);
      byId.set(entry.id, settings);
    }
  });

  it("search sets its own thinking, so a shared default for its model id cannot turn thinking off", () => {
    expect(buildSearchRequest("prompt", "query", 5).thinking).toEqual({ type: "adaptive" });
  });
});
