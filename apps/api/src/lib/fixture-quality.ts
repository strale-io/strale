// Fixture-quality gate — rejects placeholder / schema-invalid test inputs.
//
// Used by three callers:
//   - scripts/onboard.ts           (gate at capability creation/update)
//   - scripts/validate-capability.ts (readiness check)
//   - scripts/audit-placeholder-fixtures.ts (standing sweep)
//
// Rationale: a known_answer fixture that looks like {"key":"value"} or {} passes
// schema-shape assertions but produces meaningless "passing" runs, and then leaks
// out to the public capability detail page as the official example input. Reject
// those at the boundary rather than auditing for them after the fact.

export interface FixtureQualityResult {
  ok: boolean;
  reasons: string[];
}

// Patterns that indicate a placeholder fixture rather than a real example.
// Kept narrow on purpose — we only flag things that cannot plausibly be a real
// input. Anything that could legitimately be real (e.g. a single-character
// string for a zero-arg capability) is left alone and will fail the schema
// check below if it's actually wrong.
export function isPlaceholderInput(input: unknown): { bad: boolean; reason: string } {
  if (input === undefined || input === null) {
    return { bad: true, reason: "input is null/undefined" };
  }
  const s = JSON.stringify(input);
  if (s.includes('"key":"value"') || s.includes('"key": "value"')) {
    return { bad: true, reason: "contains {key:value} placeholder" };
  }
  if (s.includes('"example_value"')) {
    return { bad: true, reason: "contains 'example_value' placeholder" };
  }
  if (s.includes('"INVALID_TEST_VALUE')) {
    // Reserved for known_bad; should never appear in known_answer inputs.
    return { bad: true, reason: "contains INVALID_TEST_VALUE sentinel" };
  }
  return { bad: false, reason: "" };
}

// Check the input against the capability's declared input_schema.required list.
// Deliberately does not perform full JSON Schema validation — just catches the
// common failure mode where required fields are absent entirely.
export function missingRequiredFields(
  input: unknown,
  inputSchema: unknown,
): string[] {
  if (!inputSchema || typeof inputSchema !== "object") return [];
  const schema = inputSchema as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  if (required.length === 0) return [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return required; // non-object input cannot satisfy any required field
  }
  const obj = input as Record<string, unknown>;
  return required.filter((key) => {
    const v = obj[key];
    return v === undefined || v === null || v === "";
  });
}

// Schema type check for the top level — if the schema says the input must be
// an object, reject bare scalars. (This is what broke invoice-validate on the
// public docs page: a string where an object was required.)
export function topLevelTypeMismatch(
  input: unknown,
  inputSchema: unknown,
): string | null {
  if (!inputSchema || typeof inputSchema !== "object") return null;
  const schema = inputSchema as Record<string, unknown>;
  if (schema.type !== "object") return null;
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return `input_schema declares type=object but fixture is ${
      Array.isArray(input) ? "array" : typeof input
    }`;
  }
  return null;
}

// Main gate. Returns { ok: false, reasons: [...] } when the fixture is unfit
// to serve as the public example input for the capability.
export function validateFixture(
  input: unknown,
  inputSchema: unknown,
): FixtureQualityResult {
  const reasons: string[] = [];

  const placeholder = isPlaceholderInput(input);
  if (placeholder.bad) reasons.push(placeholder.reason);

  const typeIssue = topLevelTypeMismatch(input, inputSchema);
  if (typeIssue) reasons.push(typeIssue);

  const missing = missingRequiredFields(input, inputSchema);
  if (missing.length > 0) {
    reasons.push(`missing required fields: ${missing.join(", ")}`);
  }

  return { ok: reasons.length === 0, reasons };
}
