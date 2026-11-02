/**
 * Random draws, UUIDv4 identifiers, bytes, shuffles and samples from node:crypto.
 * Inputs and outputs remain in the transaction record for 90 days. Do not use
 * these values as passwords, keys or session tokens; generate secrets locally.
 * Results are not publicly verifiable: there is no commit-reveal or beacon.
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { registerCapability } from "./index.js";

const count = z.number().int().min(1).max(1000).default(1);
// Scalars remove nesting entirely; send IDs/indexes to represent full objects.
const items = z.array(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).max(1000);
const MAX_ITEMS_BYTES = 64 * 1024;
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("integers"), count,
    min: z.number().int().safe(), max: z.number().int().safe(),
    unique: z.boolean().default(false) }).strict(),
  z.object({ operation: z.literal("uuid"), count }).strict(),
  z.object({ operation: z.literal("bytes"), length: z.number().int().min(1).max(1024),
    encoding: z.enum(["hex", "base64"]).default("hex") }).strict(),
  z.object({ operation: z.literal("shuffle"), items }).strict(),
  z.object({ operation: z.literal("pick"), items, k: z.number().int().min(0).max(1000) }).strict(),
]);

/** Matches the future inputRefusal(message, field, fix) helper's call shape. */
class RandomInputError extends CapabilityRefusalError {
  readonly code = "invalid_request";
  readonly details: { field: string; fix: string };
  constructor(message: string, field: string, fix: string) {
    super(message);
    this.details = { field, fix };
  }
}

function inputError(field: string, fix: string): RandomInputError {
  // Keep string-only transaction records recognizable as caller refusals too.
  return new RandomInputError(`'${field}' must be corrected: ${fix}`, field, fix);
}

function fieldInstruction(field: string): string {
  switch (field) {
    case "count": return "Send 'count' as a JSON number from 1 to 1000.";
    case "min": case "max": return `Send '${field}' as a safe JSON integer from -9007199254740991 to 9007199254740991.`;
    case "length": return "Send 'length' as a JSON integer from 1 to 1024.";
    case "k": return "Send 'k' as a JSON integer from 0 to 1000, at most items.length.";
    case "unique": return "Send 'unique' as a JSON boolean: true or false.";
    case "encoding": return "Send 'encoding' as 'hex' or 'base64'.";
    case "operation": return "Send 'operation' as 'integers', 'uuid', 'bytes', 'shuffle' or 'pick'.";
    case "items": return "Send 'items' as an array of at most 1000 scalars (string, number, boolean or null); send IDs or indexes instead of full objects.";
    case "input": return "Send a JSON object with an 'operation' and its accepted fields.";
    default: return "Send each item as a JSON scalar (string, number, boolean or null); send IDs or indexes instead of full objects.";
  }
}

function zodRefusal(issue: z.ZodIssue, input: Record<string, unknown>): RandomInputError {
  const field = issue.path.join(".") || "input";
  switch (issue.code) {
    case "unrecognized_keys": {
      const operation = String(input.operation);
      const accepted = {
        integers: "'count', 'min', 'max', 'unique'",
        uuid: "'count'", bytes: "'length', 'encoding'", shuffle: "'items'", pick: "'items', 'k'",
      }[operation];
      return inputError(issue.keys[0], `Remove ${issue.keys.map(key => `'${key}'`).join(", ")}; operation '${operation}' accepts only ${accepted}.`);
    }
    case "invalid_type":
      if (issue.received === "undefined") {
        const expected = issue.expected === "number" ? "an integer" : issue.expected === "array" ? "an array of scalars" : `a JSON ${issue.expected}`;
        return inputError(field, `Provide '${field}' as ${expected}.`);
      }
      return inputError(field, fieldInstruction(field));
    case "invalid_union_discriminator":
      return inputError("operation", fieldInstruction("operation"));
    case "invalid_union":
    case "invalid_enum_value":
    case "too_small":
    case "too_big":
    case "not_finite":
      return inputError(field, fieldInstruction(field));
    default:
      // Any future schema issue still names the field's required form, never Zod internals.
      return inputError(field, fieldInstruction(field));
  }
}

registerCapability("secure-random", async (input) => {
  // Finish all validation, including cross-field rules, before drawing anything.
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw zodRefusal(issue, input);
  }
  const parameters = parsed.data;
  if (parameters.operation === "integers") {
    const width = parameters.max - parameters.min + 1;
    if (parameters.max < parameters.min || !Number.isSafeInteger(width) || width >= 2 ** 48) {
      throw inputError("min/max", "use safe integer bounds with min <= max and an inclusive range smaller than 2^48");
    }
    if (parameters.unique && parameters.count > width) {
      throw inputError("count", "reduce count to the inclusive range size, widen min/max, or set unique to false");
    }
  }
  if (parameters.operation === "pick" && parameters.k > parameters.items.length) {
    throw inputError("k", "reduce k to at most the number of input items");
  }

  if ((parameters.operation === "shuffle" || parameters.operation === "pick") &&
      Buffer.byteLength(JSON.stringify(parameters.items), "utf8") > MAX_ITEMS_BYTES) {
    throw inputError("items", "Send at most 64 KB of items; send IDs or indexes instead of full objects");
  }

  let values: unknown[] | string;
  switch (parameters.operation) {
    case "integers": {
      const { min, max, count, unique } = parameters;
      const width = max - min + 1;
      // Sparse partial Fisher–Yates: bounded work even when count fills a range.
      const swaps = new Map<number, number>();
      values = Array.from({ length: count }, (_, i) => {
        if (!unique) return min + randomInt(width);
        const j = randomInt(i, width);
        const selected = swaps.get(j) ?? j;
        swaps.set(j, swaps.get(i) ?? i);
        return min + selected;
      });
      break;
    }
    case "uuid":
      values = Array.from({ length: parameters.count }, () => randomUUID());
      break;
    case "bytes":
      values = randomBytes(parameters.length).toString(parameters.encoding);
      break;
    case "shuffle":
    case "pick": {
      const shuffled = [...parameters.items];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      values = parameters.operation === "pick" ? shuffled.slice(0, parameters.k) : shuffled;
      break;
    }
  }
  const echoedParameters = parameters.operation === "shuffle" || parameters.operation === "pick"
    ? (({ items, ...rest }) => ({ ...rest, items_count: items.length }))(parameters)
    : parameters;
  return {
    output: { values, operation: parameters.operation, parameters: echoedParameters },
    provenance: { source: "node:crypto CSPRNG", fetched_at: new Date().toISOString(), acquisition_method: "computed" },
  };
});
