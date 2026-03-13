/**
 * Semantic Kernel plugin for Strale — 233 capabilities as kernel functions.
 */

import { kernelFunction } from "semantic-kernel";
import {
  StraleClient,
  type Capability,
  type StraleClientOptions,
} from "./client.js";

export type { StraleClientOptions } from "./client.js";

/** A Semantic Kernel plugin object: { name, description, functions }. */
export interface StralePluginResult {
  name: string;
  description: string;
  functions: ReturnType<typeof kernelFunction>[];
}

/**
 * Build a JSON Schema `properties` object from a capability's input_schema.
 * Falls back to a generic { task, inputs } schema when none is available.
 */
function buildParameterSchema(cap: Capability): Record<string, unknown> {
  const schema = cap.input_schema as Record<string, unknown> | null;

  if (
    schema &&
    typeof schema === "object" &&
    schema.properties &&
    typeof schema.properties === "object" &&
    Object.keys(schema.properties as object).length > 0
  ) {
    return schema;
  }

  // Generic fallback
  return {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Describe what you want this capability to do",
      },
      inputs: {
        type: "object",
        description: "Optional structured input data (key-value pairs)",
      },
    },
    required: ["task"],
  };
}

/** Check whether a schema is the generic fallback. */
function isGenericSchema(schema: Record<string, unknown>): boolean {
  const props = schema.properties as Record<string, unknown> | undefined;
  return !!props && "task" in props && Object.keys(props).length <= 2;
}

/**
 * Create the Strale plugin for Semantic Kernel.
 *
 * @example
 * ```ts
 * import { createStralePlugin } from "@strale/semantic-kernel";
 *
 * const plugin = await createStralePlugin({ apiKey: "sk_live_..." });
 * kernel.addPlugin(plugin);
 * ```
 */
export async function createStralePlugin(
  opts: StraleClientOptions & { categories?: string[] }
): Promise<StralePluginResult> {
  const client = new StraleClient(opts);
  let capabilities = await client.listCapabilities();

  if (opts.categories) {
    const catSet = new Set(opts.categories);
    capabilities = capabilities.filter((c) => catSet.has(c.category));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const functions: any[] = capabilities.map((cap) => {
    const paramSchema = buildParameterSchema(cap);
    const generic = isGenericSchema(paramSchema);
    const priceEur = (cap.price_cents / 100).toFixed(2);

    return kernelFunction(
      async (args: Record<string, unknown>) => {
        let task: string | undefined;
        let inputs: Record<string, unknown> | undefined;

        if (generic) {
          task = (args.task as string) ?? "";
          inputs = (args.inputs as Record<string, unknown>) ?? {};
        } else {
          inputs = args;
        }

        const result = await client.execute({
          capabilitySlug: cap.slug,
          task,
          inputs,
          maxPriceCents: cap.price_cents,
        });

        if (result.error_code) {
          return JSON.stringify({
            error: result.error_code,
            message: result.message,
          });
        }
        return JSON.stringify(result);
      },
      {
        name: cap.slug,
        description: `${cap.description} (Price: \u20ac${priceEur})`,
        schema: paramSchema,
      }
    );
  });

  // Meta-tools: strale_search
  functions.push(
    kernelFunction(
      async (args: Record<string, unknown>) => {
        const query = ((args.query as string) ?? "").toLowerCase();
        const category = args.category as string | undefined;
        const offset = (args.offset as number) ?? 0;
        const matches = capabilities.filter((cap) => {
          if (category && cap.category !== category) return false;
          const text =
            `${cap.slug} ${cap.name} ${cap.description} ${cap.category}`.toLowerCase();
          return text.includes(query);
        });
        const results = matches.slice(offset, offset + 20).map((cap) => ({
          slug: cap.slug,
          name: cap.name,
          description: cap.description,
          category: cap.category,
          price_cents: cap.price_cents,
        }));
        return JSON.stringify({
          total_matches: matches.length,
          offset,
          has_more: offset + results.length < matches.length,
          results,
        });
      },
      {
        name: "strale_search",
        description:
          "Search the Strale capability catalog to discover available tools. Supports pagination via the offset parameter (20 results per page).",
        schema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Keyword or phrase to search for",
            },
            category: {
              type: "string",
              description: "Filter by category slug",
            },
            offset: {
              type: "number",
              description: "Number of results to skip (for pagination). Default: 0",
            },
          },
          required: ["query"],
        },
      }
    )
  );

  // Meta-tools: strale_balance
  functions.push(
    kernelFunction(
      async () => {
        const result = await client.getBalance();
        return JSON.stringify(result);
      },
      {
        name: "strale_balance",
        description:
          "Check your Strale wallet balance. Returns balance in EUR cents.",
        schema: {
          type: "object",
          properties: {},
        },
      }
    )
  );

  return {
    name: "strale",
    description:
      "Strale capability marketplace — 233 business tools for AI agents including company data, compliance, web intelligence, and more.",
    functions,
  };
}
