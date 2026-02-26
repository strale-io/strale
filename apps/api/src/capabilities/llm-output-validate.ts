import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("llm-output-validate", async (input: CapabilityInput) => {
  const llmOutput = ((input.llm_output as string) ?? (input.output as string) ?? (input.task as string) ?? "").trim();
  if (!llmOutput) throw new Error("'llm_output' is required.");

  const schema = input.expected_schema ?? input.schema;
  const strictMode = (input.strict_mode as boolean) ?? false;

  // Step 1: Attempt JSON parse
  let parsed: unknown = null;
  let parseError: string | null = null;
  let autoFixed = false;

  try {
    parsed = JSON.parse(llmOutput);
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);

    // Attempt auto-repair
    let repaired = llmOutput;
    // Strip markdown code blocks
    repaired = repaired.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    // Remove trailing commas before } or ]
    repaired = repaired.replace(/,\s*([}\]])/g, "$1");
    // Quote unquoted keys
    repaired = repaired.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    // Replace single quotes around values
    repaired = repaired.replace(/:\s*'([^']*)'/g, ': "$1"');
    // Fix True/False/None → true/false/null
    repaired = repaired.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null");

    try {
      parsed = JSON.parse(repaired);
      autoFixed = true;
      parseError = null;
    } catch {
      // Try extracting JSON object/array from text
      const jsonMatch = llmOutput.match(/[\[{][\s\S]*[\]}]/);
      if (jsonMatch) {
        let extracted = jsonMatch[0];
        extracted = extracted.replace(/,\s*([}\]])/g, "$1");
        try {
          parsed = JSON.parse(extracted);
          autoFixed = true;
          parseError = null;
        } catch { /* give up */ }
      }
    }
  }

  const errors: Array<{ path: string; message: string }> = [];

  // Step 2: Schema validation if schema provided
  if (parsed !== null && schema) {
    validateSchema(parsed, schema as Record<string, unknown>, "#", errors, strictMode);
  }

  const valid = parsed !== null && errors.length === 0 && parseError === null;

  const output: Record<string, unknown> = {
    valid,
    parsed_output: parsed,
    parse_error: parseError,
    auto_fixed: autoFixed,
    error_count: errors.length + (parseError ? 1 : 0),
    errors,
  };

  if (autoFixed && parsed !== null) {
    output.auto_fixed_output = JSON.stringify(parsed, null, 2);
  }

  return {
    output,
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function validateSchema(
  data: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: Array<{ path: string; message: string }>,
  strict: boolean,
): void {
  // Type check
  if (schema.type) {
    const schemaType = schema.type as string;
    const actualType = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;
    if (schemaType === "integer") {
      if (typeof data !== "number" || !Number.isInteger(data)) {
        errors.push({ path, message: `Expected integer, got ${actualType}` });
        return;
      }
    } else if (schemaType !== actualType) {
      errors.push({ path, message: `Expected type ${schemaType}, got ${actualType}` });
      return;
    }
  }

  // Required fields
  if (schema.required && Array.isArray(schema.required) && typeof data === "object" && data !== null) {
    for (const key of schema.required as string[]) {
      if (!(key in (data as Record<string, unknown>))) {
        errors.push({ path: `${path}/${key}`, message: `Required field '${key}' is missing` });
      }
    }
  }

  // Properties
  if (schema.properties && typeof data === "object" && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;

    for (const [key, propSchema] of Object.entries(props)) {
      if (key in obj) {
        validateSchema(obj[key], propSchema, `${path}/${key}`, errors, strict);
      }
    }

    // Additional properties check in strict mode
    if (strict && schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          errors.push({ path: `${path}/${key}`, message: `Unexpected additional property '${key}'` });
        }
      }
    }
  }

  // Array items
  if (schema.items && Array.isArray(data)) {
    const itemSchema = schema.items as Record<string, unknown>;
    for (let i = 0; i < data.length; i++) {
      validateSchema(data[i], itemSchema, `${path}/${i}`, errors, strict);
    }
  }

  // Enum
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!(schema.enum as unknown[]).includes(data)) {
      errors.push({ path, message: `Value must be one of: ${(schema.enum as unknown[]).join(", ")}` });
    }
  }

  // String constraints
  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < (schema.minLength as number)) {
      errors.push({ path, message: `String too short (min ${schema.minLength})` });
    }
    if (schema.maxLength !== undefined && data.length > (schema.maxLength as number)) {
      errors.push({ path, message: `String too long (max ${schema.maxLength})` });
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern as string).test(data)) {
          errors.push({ path, message: `String does not match pattern: ${schema.pattern}` });
        }
      } catch { /* invalid regex in schema */ }
    }
  }

  // Number constraints
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < (schema.minimum as number)) {
      errors.push({ path, message: `Value ${data} is below minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && data > (schema.maximum as number)) {
      errors.push({ path, message: `Value ${data} is above maximum ${schema.maximum}` });
    }
  }
}
