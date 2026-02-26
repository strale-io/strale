import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("flatten-json", async (input: CapabilityInput) => {
  const data = input.data;
  if (data === undefined || data === null) throw new Error("'data' (nested JSON object) is required.");

  const delimiter = ((input.delimiter as string) ?? ".").trim() || ".";
  const arrayHandling = ((input.array_handling as string) ?? "index").trim();

  let maxDepth = 0;

  function flatten(obj: unknown, prefix: string, depth: number): Record<string, unknown> {
    if (depth > maxDepth) maxDepth = depth;
    const result: Record<string, unknown> = {};

    if (Array.isArray(obj)) {
      if (arrayHandling === "stringify") {
        result[prefix] = JSON.stringify(obj);
      } else {
        for (let i = 0; i < obj.length; i++) {
          const key = prefix ? `${prefix}${delimiter}${i}` : String(i);
          Object.assign(result, flatten(obj[i], key, depth + 1));
        }
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const newKey = prefix ? `${prefix}${delimiter}${key}` : key;
        Object.assign(result, flatten(value, newKey, depth + 1));
      }
    } else {
      result[prefix] = obj;
    }

    return result;
  }

  const flattened = flatten(data, "", 0);

  return {
    output: {
      flattened,
      key_count: Object.keys(flattened).length,
      max_depth_found: maxDepth,
      delimiter,
      array_handling: arrayHandling,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
