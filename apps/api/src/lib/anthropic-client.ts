import Anthropic from "@anthropic-ai/sdk";
import { EUR_USD_RATE } from "./currency.js";
import { log, logError } from "./log.js";
import { MODELS, type ModelEntry, type ModelRequestSettings } from "./models.js";
import { assertPaidCallAllowed } from "./paid-call-guard.js";
import { currentCallCost, withCallCost, snapshotCallCost, noteUnknownCost, recordLlmUsage, remainingCallMs, startLlmRequest } from "./call-cost.js";

/** Accounting must never replace the SDK result/error. Jobs and CLI calls
 * have no transaction, so emit a bounded standalone event instead. */
function observeCost(record: () => void): void {
  try {
    if (currentCallCost()) record();
    else withCallCost(() => {
      record();
      log.info({ label: "standalone-llm-cost", ...snapshotCallCost() }, "standalone-llm-cost");
    }, EUR_USD_RATE);
  } catch (error) {
    logError("llm-cost-record-failed", error);
  }
}

/**
 * The request a model needs, from its registry settings (models.ts). The
 * call's own `thinking` wins; sampling parameters are dropped where the model
 * rejects them; `max_tokens` grows with a costlier tokenizer.
 */
export function applyModelSettings(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  settings: ModelRequestSettings | undefined,
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  if (!settings) return params;
  const next = { ...params };
  if (settings.thinking && next.thinking === undefined) next.thinking = settings.thinking;
  if (settings.drop_sampling) {
    delete next.temperature;
    delete next.top_p;
    delete next.top_k;
  }
  if (settings.max_tokens_scale) next.max_tokens = Math.ceil(next.max_tokens * settings.max_tokens_scale);
  return next;
}

/** SDK retries are ALWAYS off. The sole retry layer is lib/retry.ts around
 * the executor (one transient retry); standalone callers make one attempt.
 * This factory instruments every nonstreaming Messages response before parsing.
 */
export function createAnthropicClient(options: ConstructorParameters<typeof Anthropic>[0] = {}): Anthropic {
  const client = new Anthropic({ ...options, timeout: remainingCallMs(options?.timeout ?? 30_000), maxRetries: 0 });
  const create = client.messages.create.bind(client.messages);
  client.messages.create = ((params: Anthropic.Messages.MessageCreateParamsNonStreaming, requestOptions?: Parameters<typeof create>[1]) => {
    const entry: ModelEntry | undefined = Object.values(MODELS).find((candidate) => candidate.id === params.model);
    if (!entry) throw new Error("Use a MODELS role for Anthropic requests");
    params = applyModelSettings(params, entry.settings);
    // Every Anthropic call bills; Strale's own test traffic may not make one
    // (lib/paid-call-guard.ts). Thrown before the request, so nothing is spent.
    assertPaidCallAllowed("anthropic");
    if (params.stream) throw new Error("Streaming cost recording is not supported");
    const timeout = remainingCallMs(Math.min(options?.timeout ?? Infinity, requestOptions?.timeout ?? options?.timeout ?? 30_000));
    const settled = startLlmRequest();
    try { return create(params, { ...requestOptions, timeout, maxRetries: 0 }).then((response) => {
      settled();
      observeCost(() => recordLlmUsage(params.model, response.usage as unknown as Record<string, unknown>));
      return response;
    }, (error: unknown) => {
      settled();
      // A timeout/disconnect can follow billable generation without a usage response.
      observeCost(() => noteUnknownCost("anthropic_failed_attempt_usage_unavailable"));
      throw error;
    }); } catch (error) {
      settled();
      observeCost(() => noteUnknownCost("anthropic_failed_attempt_usage_unavailable"));
      throw error;
    }
  }) as typeof client.messages.create;
  return client;
}
