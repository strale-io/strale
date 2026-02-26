import { Tool } from "@langchain/core/tools";
import type { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { Strale, StraleError } from "straleio";

export interface StraleFallbackToolOptions {
  /** Strale API key (starts with sk_) */
  apiKey: string;
  /** Maximum price in EUR per call. Default: 2.00 (€2) */
  maxPrice?: number;
  /** Base URL of the Strale API */
  baseUrl?: string;
  /** Specific capability slug to always use (bypasses task matching) */
  capabilitySlug?: string;
}

export class StraleFallbackTool extends Tool {
  name = "strale_fallback";
  description =
    "Use this tool when you need real-world data you can't access directly — " +
    "company registries, invoice parsing, VAT validation, web data extraction. " +
    "Costs money per call. Describe what you need in plain language.";

  private client: Strale;
  private maxPriceCents: number;
  private capabilitySlug?: string;

  constructor(options: StraleFallbackToolOptions) {
    super();
    this.client = new Strale({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
    this.maxPriceCents = Math.round((options.maxPrice ?? 2.0) * 100);
    this.capabilitySlug = options.capabilitySlug;
  }

  protected async _call(
    input: string,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    try {
      const response = await this.client.do({
        task: this.capabilitySlug ? undefined : input,
        capability_slug: this.capabilitySlug,
        inputs: this.capabilitySlug ? { task: input } : undefined,
        max_price_cents: this.maxPriceCents,
      });

      return JSON.stringify({
        capability_used: response.capability_used,
        price_cents: response.price_cents,
        output: response.output,
        provenance: response.provenance,
      });
    } catch (err) {
      if (err instanceof StraleError) {
        return JSON.stringify({
          error: true,
          error_code: err.errorCode,
          message: err.message,
        });
      }
      throw err;
    }
  }
}
