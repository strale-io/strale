import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("json-schema-validate", async (input: CapabilityInput) => {
  const data = input.data;
  const schema = input.schema;

  if (data === undefined) throw new Error("'data' is required.");
  if (!schema || typeof schema !== "object") throw new Error("'schema' is required. Provide a JSON Schema object.");

  const errors = validateNode(data, schema as SchemaNode, "#");

  return {
    output: {
      valid: errors.length === 0,
      error_count: errors.length,
      errors,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

interface SchemaNode {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  format?: string;
  const?: unknown;
  oneOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  allOf?: SchemaNode[];
  not?: SchemaNode;
  additionalProperties?: boolean | SchemaNode;
}

interface ValidationError {
  path: string;
  message: string;
}

function validateNode(data: unknown, schema: SchemaNode, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // const
  if ("const" in schema && data !== schema.const) {
    errors.push({ path, message: `Expected constant value ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}` });
    return errors;
  }

  // enum
  if (schema.enum && !schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(data))) {
    errors.push({ path, message: `Value must be one of: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}` });
    return errors;
  }

  // type
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getJsonType(data);
    if (!types.includes(actualType)) {
      errors.push({ path, message: `Expected type ${types.join("|")}, got ${actualType}` });
      return errors;
    }
  }

  // string validations
  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ path, message: `String length ${data.length} is less than minimum ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({ path, message: `String length ${data.length} exceeds maximum ${schema.maxLength}` });
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(data)) {
          errors.push({ path, message: `String does not match pattern: ${schema.pattern}` });
        }
      } catch { /* invalid regex in schema */ }
    }
    if (schema.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) {
      errors.push({ path, message: "Invalid email format" });
    }
    if (schema.format === "uri" && !/^https?:\/\/.+/.test(data)) {
      errors.push({ path, message: "Invalid URI format" });
    }
    if (schema.format === "date" && isNaN(Date.parse(data))) {
      errors.push({ path, message: "Invalid date format" });
    }
  }

  // number validations
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({ path, message: `Value ${data} is less than minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({ path, message: `Value ${data} exceeds maximum ${schema.maximum}` });
    }
  }

  // object validations
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) {
          errors.push({ path: `${path}/${key}`, message: `Required property '${key}' is missing` });
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateNode(obj[key], propSchema, `${path}/${key}`));
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
          errors.push({ path: `${path}/${key}`, message: `Additional property '${key}' is not allowed` });
        }
      }
    }
  }

  // array validations
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ path, message: `Array length ${data.length} is less than minimum ${schema.minItems}` });
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({ path, message: `Array length ${data.length} exceeds maximum ${schema.maxItems}` });
    }
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        errors.push(...validateNode(data[i], schema.items, `${path}/${i}`));
      }
    }
  }

  // Combinators
  if (schema.allOf) {
    for (const sub of schema.allOf) {
      errors.push(...validateNode(data, sub, path));
    }
  }
  if (schema.anyOf) {
    const anyValid = schema.anyOf.some((sub) => validateNode(data, sub, path).length === 0);
    if (!anyValid) {
      errors.push({ path, message: "Value does not match any of the anyOf schemas" });
    }
  }
  if (schema.oneOf) {
    const matchCount = schema.oneOf.filter((sub) => validateNode(data, sub, path).length === 0).length;
    if (matchCount !== 1) {
      errors.push({ path, message: `Value must match exactly one of oneOf schemas (matched ${matchCount})` });
    }
  }

  return errors;
}

function getJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}
