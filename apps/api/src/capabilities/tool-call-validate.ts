import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("tool-call-validate", async (input: CapabilityInput) => {
  const toolName = ((input.tool_name as string) ?? "").trim();
  const toolInput = input.tool_input;
  const expectedSchema = input.expected_schema as Record<string, unknown> | undefined;

  if (!toolName) throw new Error("'tool_name' is required.");
  if (toolInput === undefined) throw new Error("'tool_input' (JSON object) is required.");
  if (!expectedSchema) throw new Error("'expected_schema' (JSON Schema) is required.");

  const errors: Array<{ path: string; message: string; expected: string; received: string }> = [];
  const corrections: Record<string, unknown> = {};
  let correctedInput = JSON.parse(JSON.stringify(toolInput)); // deep clone

  // Validate and attempt auto-fix
  validateAndFix(correctedInput, expectedSchema, "#", errors, corrections);

  // Check required fields
  if (expectedSchema.required && Array.isArray(expectedSchema.required)) {
    const obj = toolInput as Record<string, unknown>;
    for (const key of expectedSchema.required as string[]) {
      if (!(key in obj)) {
        errors.push({
          path: `#/${key}`,
          message: `Required field '${key}' is missing`,
          expected: "present",
          received: "missing",
        });
      }
    }
  }

  const hasCorrections = Object.keys(corrections).length > 0;

  return {
    output: {
      tool_name: toolName,
      valid: errors.length === 0,
      error_count: errors.length,
      errors,
      corrected_input: hasCorrections ? correctedInput : null,
      corrections_applied: hasCorrections ? corrections : null,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function validateAndFix(
  data: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: Array<{ path: string; message: string; expected: string; received: string }>,
  corrections: Record<string, unknown>,
): void {
  if (!schema.properties || typeof data !== "object" || data === null) return;
  const obj = data as Record<string, unknown>;
  const props = schema.properties as Record<string, Record<string, unknown>>;

  for (const [key, propSchema] of Object.entries(props)) {
    if (!(key in obj)) continue;
    const value = obj[key];
    const expectedType = propSchema.type as string | undefined;
    if (!expectedType) continue;

    const actualType = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

    if (expectedType === "number" || expectedType === "integer") {
      if (typeof value === "string") {
        const num = Number(value);
        if (!isNaN(num)) {
          obj[key] = expectedType === "integer" ? Math.floor(num) : num;
          corrections[`${path}/${key}`] = `string "${value}" → number ${obj[key]}`;
          continue;
        }
      }
      if (actualType !== "number") {
        errors.push({ path: `${path}/${key}`, message: `Expected ${expectedType}`, expected: expectedType, received: actualType });
      } else if (expectedType === "integer" && !Number.isInteger(value)) {
        errors.push({ path: `${path}/${key}`, message: "Expected integer", expected: "integer", received: "float" });
      }
    } else if (expectedType === "string") {
      if (typeof value === "number" || typeof value === "boolean") {
        obj[key] = String(value);
        corrections[`${path}/${key}`] = `${actualType} ${JSON.stringify(value)} → string "${obj[key]}"`;
        continue;
      }
      if (actualType !== "string") {
        errors.push({ path: `${path}/${key}`, message: "Expected string", expected: "string", received: actualType });
      }
    } else if (expectedType === "boolean") {
      if (value === "true" || value === 1) {
        obj[key] = true;
        corrections[`${path}/${key}`] = `${actualType} ${JSON.stringify(value)} → boolean true`;
        continue;
      }
      if (value === "false" || value === 0) {
        obj[key] = false;
        corrections[`${path}/${key}`] = `${actualType} ${JSON.stringify(value)} → boolean false`;
        continue;
      }
      if (actualType !== "boolean") {
        errors.push({ path: `${path}/${key}`, message: "Expected boolean", expected: "boolean", received: actualType });
      }
    } else if (expectedType === "array") {
      if (!Array.isArray(value)) {
        // Wrap single value in array
        if (value !== null && value !== undefined) {
          obj[key] = [value];
          corrections[`${path}/${key}`] = `${actualType} wrapped in array`;
          continue;
        }
        errors.push({ path: `${path}/${key}`, message: "Expected array", expected: "array", received: actualType });
      }
    } else if (expectedType !== actualType) {
      errors.push({ path: `${path}/${key}`, message: `Expected ${expectedType}`, expected: expectedType, received: actualType });
    }

    // Enum check
    if (propSchema.enum && Array.isArray(propSchema.enum)) {
      if (!(propSchema.enum as unknown[]).includes(obj[key])) {
        errors.push({
          path: `${path}/${key}`,
          message: `Value must be one of: ${(propSchema.enum as unknown[]).join(", ")}`,
          expected: (propSchema.enum as unknown[]).join("|"),
          received: String(obj[key]),
        });
      }
    }

    // Recurse into nested objects
    if (propSchema.properties && typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
      validateAndFix(obj[key], propSchema as Record<string, unknown>, `${path}/${key}`, errors, corrections);
    }
  }
}
