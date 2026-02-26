import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("openapi-validate", async (input: CapabilityInput) => {
  const spec = ((input.spec as string) ?? (input.task as string) ?? "").trim();
  if (!spec) throw new Error("'spec' (OpenAPI JSON or YAML string) is required.");

  // Try to parse as JSON first
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(spec);
  } catch {
    // Basic YAML parsing for key fields
    parsed = {};
    const lines = spec.split("\n");
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)/);
      if (match) parsed[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    if (!parsed.openapi && !parsed.swagger) {
      throw new Error("Could not parse spec as JSON or YAML. Please provide valid OpenAPI spec.");
    }
  }

  const errors: Array<{ path: string; message: string; severity: string }> = [];
  const warnings: Array<{ path: string; message: string }> = [];

  // Detect version
  const version = (parsed.openapi as string) ?? (parsed.swagger as string) ?? "unknown";
  const isV3 = version.startsWith("3");

  // Check required top-level fields
  if (!parsed.openapi && !parsed.swagger) {
    errors.push({ path: "/", message: "Missing 'openapi' or 'swagger' version field", severity: "error" });
  }
  if (!parsed.info) {
    errors.push({ path: "/info", message: "Missing required 'info' object", severity: "error" });
  } else {
    const info = parsed.info as Record<string, unknown>;
    if (!info.title) errors.push({ path: "/info/title", message: "Missing required 'info.title'", severity: "error" });
    if (!info.version) errors.push({ path: "/info/version", message: "Missing required 'info.version'", severity: "error" });
  }

  if (!parsed.paths && isV3) {
    errors.push({ path: "/paths", message: "Missing 'paths' object", severity: "error" });
  }

  // Count endpoints and schemas
  let endpointCount = 0;
  let schemaCount = 0;

  if (parsed.paths && typeof parsed.paths === "object") {
    const paths = parsed.paths as Record<string, Record<string, unknown>>;
    for (const [path, methods] of Object.entries(paths)) {
      if (typeof methods !== "object" || methods === null) continue;
      for (const [method, operation] of Object.entries(methods)) {
        if (!["get", "post", "put", "patch", "delete", "options", "head"].includes(method)) continue;
        endpointCount++;
        const op = operation as Record<string, unknown>;

        // Check each operation
        if (!op.responses) {
          warnings.push({ path: `${path}.${method}`, message: "Missing 'responses' object" });
        }
        if (!op.operationId) {
          warnings.push({ path: `${path}.${method}`, message: "Missing 'operationId' (recommended)" });
        }
        if (!op.summary && !op.description) {
          warnings.push({ path: `${path}.${method}`, message: "Missing 'summary' or 'description'" });
        }
      }
    }
  }

  // Count schemas
  if (isV3 && parsed.components && typeof parsed.components === "object") {
    const components = parsed.components as Record<string, unknown>;
    if (components.schemas && typeof components.schemas === "object") {
      schemaCount = Object.keys(components.schemas as Record<string, unknown>).length;
    }
  } else if (parsed.definitions && typeof parsed.definitions === "object") {
    schemaCount = Object.keys(parsed.definitions as Record<string, unknown>).length;
  }

  // Check servers (v3)
  if (isV3 && !parsed.servers) {
    warnings.push({ path: "/servers", message: "No 'servers' defined — consumers won't know the base URL" });
  }

  return {
    output: {
      valid: errors.length === 0,
      version_detected: version,
      errors,
      warnings,
      endpoint_count: endpointCount,
      schema_count: schemaCount,
      error_count: errors.length,
      warning_count: warnings.length,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
