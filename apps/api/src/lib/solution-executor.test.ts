import { describe, it, expect } from "vitest";
import { resolveInputRef } from "./solution-executor.js";

describe("resolveInputRef", () => {
  // ── $input.<field> pattern ──────────────────────────────────────────────

  it("resolves $input.<field> to caller inputs", () => {
    const result = resolveInputRef(
      "$input.org_number",
      { org_number: "5567037485" },
      [],
      {},
    );
    expect(result).toBe("5567037485");
  });

  it("resolves $input.<field> with nested field name", () => {
    const result = resolveInputRef(
      "$input.contact_email",
      { contact_email: "test@example.com" },
      [],
      {},
    );
    expect(result).toBe("test@example.com");
  });

  it("throws when $input references a missing field", () => {
    expect(() =>
      resolveInputRef("$input.missing_field", { org_number: "123" }, [], {}),
    ).toThrow("field 'missing_field' not found in solution inputs");
  });

  // ── $steps[N].<field> pattern ───────────────────────────────────────────

  it("resolves $steps[0].<field> to first step output", () => {
    const completedSteps = [{ vat_number: "SE556703748501", company_name: "Spotify AB" }];
    const result = resolveInputRef(
      "$steps[0].vat_number",
      {},
      completedSteps,
      {},
    );
    expect(result).toBe("SE556703748501");
  });

  it("resolves $steps[0].company_name to first step output", () => {
    const completedSteps = [{ company_name: "Spotify AB" }];
    const result = resolveInputRef(
      "$steps[0].company_name",
      {},
      completedSteps,
      {},
    );
    expect(result).toBe("Spotify AB");
  });

  it("returns null for $steps[N].<field> when field is missing from output", () => {
    const completedSteps = [{ company_name: "Spotify AB" }];
    const result = resolveInputRef(
      "$steps[0].nonexistent_field",
      {},
      completedSteps,
      {},
    );
    expect(result).toBeNull();
  });

  it("throws when $steps[N] references an out-of-range step", () => {
    expect(() =>
      resolveInputRef("$steps[5].field", {}, [], {}),
    ).toThrow("step 5 has not completed yet");
  });

  it("throws when $steps[N] references a step that hasn't run yet", () => {
    const completedSteps = [{ a: 1 }];
    expect(() =>
      resolveInputRef("$steps[1].field", {}, completedSteps, {}),
    ).toThrow("step 1 has not completed yet (1 steps completed so far)");
  });

  // ── $all_results pattern ────────────────────────────────────────────────

  it("resolves $all_results to aggregate of all step results", () => {
    const stepResults = {
      "swedish-company-data": { company_name: "Spotify AB" },
      "vat-validate": { valid: true },
    };
    const result = resolveInputRef("$all_results", {}, [], stepResults);
    expect(result).toEqual({
      "swedish-company-data": { company_name: "Spotify AB" },
      "vat-validate": { valid: true },
    });
  });

  // ── Literal pass-through ────────────────────────────────────────────────

  it("passes through literal string values unchanged", () => {
    expect(resolveInputRef("kyb", {}, [], {})).toBe("kyb");
    expect(resolveInputRef("invoice_fraud", {}, [], {})).toBe("invoice_fraud");
    expect(resolveInputRef("hello world", {}, [], {})).toBe("hello world");
  });

  it("passes through empty string as literal", () => {
    expect(resolveInputRef("", {}, [], {})).toBe("");
  });

  // ── kyb-essentials-se full scenario ─────────────────────────────────────

  it("resolves the full kyb-essentials-se step chain correctly", () => {
    const inputs = { org_number: "5567037485" };

    // Step 0: swedish-company-data receives $input.org_number
    const step0Input = resolveInputRef("$input.org_number", inputs, [], {});
    expect(step0Input).toBe("5567037485");

    // Step 0 completes with company data
    const step0Output = {
      company_name: "Spotify AB",
      vat_number: "SE556703748501",
      org_number: "5567037485",
    };
    const completedSteps = [step0Output];
    const stepResults: Record<string, unknown> = { "swedish-company-data": step0Output };

    // Step 1: vat-validate receives $steps[0].vat_number
    const step1Input = resolveInputRef("$steps[0].vat_number", inputs, completedSteps, stepResults);
    expect(step1Input).toBe("SE556703748501");

    // Step 2: sanctions-check receives $steps[0].company_name
    const step2Input = resolveInputRef("$steps[0].company_name", inputs, completedSteps, stepResults);
    expect(step2Input).toBe("Spotify AB");

    // Step 3: lei-lookup receives $steps[0].company_name
    const step3Input = resolveInputRef("$steps[0].company_name", inputs, completedSteps, stepResults);
    expect(step3Input).toBe("Spotify AB");
  });
});
