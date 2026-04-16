import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch, type SafeFetchOptions } from "../lib/safe-fetch.js";

registerCapability("api-health-check", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const method = ((input.method as string) ?? "GET").toUpperCase();
  const headers = (input.headers as Record<string, string>) ?? {};
  const body = input.body;
  const expectedStatus = (input.expected_status as number) ?? undefined;
  const expectedSchema = (input.expected_schema as Record<string, unknown>) ?? undefined;
  const timeout = Math.min((input.timeout as number) ?? 10000, 30000);

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  // F-0-006: safeFetch validates + re-validates redirects + refuses
  // DNS-rebinding. The old `redirect: "follow"` path was the classic
  // SSRF bypass (validateUrl on the first URL, then follow to private IP).
  const fetchOptions: SafeFetchOptions & { body?: BodyInit; headers: Record<string, string> } = {
    method,
    headers: {
      "User-Agent": "Strale/1.0 (api-health-check; admin@strale.io)",
      ...headers,
    },
    signal: AbortSignal.timeout(timeout),
  };

  if (body && method !== "GET" && method !== "HEAD") {
    fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      (fetchOptions.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
  }

  const start = Date.now();
  let statusCode: number;
  let responseBody: unknown = null;
  let contentType: string | null = null;
  let responseHeaders: Record<string, string> = {};

  try {
    const response = await safeFetch(fullUrl, fetchOptions);
    statusCode = response.status;
    contentType = response.headers.get("content-type");
    responseHeaders = Object.fromEntries(response.headers.entries());

    const text = await response.text();
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text.slice(0, 5000);
    }
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    return {
      output: {
        url: fullUrl,
        method,
        is_healthy: false,
        error: err instanceof Error ? err.message : String(err),
        response_time_ms: responseTimeMs,
      },
      provenance: { source: "http-request", fetched_at: new Date().toISOString() },
    };
  }

  const responseTimeMs = Date.now() - start;

  // Check expected status
  let statusValid = true;
  if (expectedStatus !== undefined) {
    statusValid = statusCode === expectedStatus;
  } else {
    statusValid = statusCode >= 200 && statusCode < 400;
  }

  // Basic schema validation if provided
  let schemaValid: boolean | null = null;
  let schemaErrors: string[] = [];
  if (expectedSchema && typeof responseBody === "object" && responseBody !== null) {
    const result = basicSchemaCheck(responseBody, expectedSchema);
    schemaValid = result.valid;
    schemaErrors = result.errors;
  }

  return {
    output: {
      url: fullUrl,
      method,
      is_healthy: statusValid && (schemaValid === null || schemaValid),
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      content_type: contentType,
      status_valid: statusValid,
      expected_status: expectedStatus ?? "2xx/3xx",
      schema_valid: schemaValid,
      schema_errors: schemaErrors.length > 0 ? schemaErrors : undefined,
      response_body: responseBody,
      response_headers: responseHeaders,
    },
    provenance: { source: "http-request", fetched_at: new Date().toISOString() },
  };
});

function basicSchemaCheck(data: unknown, schema: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schema.type) {
    const actualType = Array.isArray(data) ? "array" : typeof data;
    if (actualType !== schema.type) {
      errors.push(`Expected type ${schema.type}, got ${actualType}`);
    }
  }

  if (schema.required && Array.isArray(schema.required) && typeof data === "object" && data !== null) {
    for (const key of schema.required) {
      if (!(key as string in (data as Record<string, unknown>))) {
        errors.push(`Missing required field: ${key}`);
      }
    }
  }

  if (schema.properties && typeof data === "object" && data !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
      if (key in (data as Record<string, unknown>)) {
        const val = (data as Record<string, unknown>)[key];
        if (propSchema.type) {
          const actualType = Array.isArray(val) ? "array" : val === null ? "null" : typeof val;
          if (actualType !== propSchema.type) {
            errors.push(`Field '${key}': expected ${propSchema.type}, got ${actualType}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
