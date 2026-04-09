/**
 * Entity validation helpers for company data capabilities.
 * DEC-20260409-B Phase 1.
 *
 * Provides cross-validation checks between user input and fetched data:
 * - Name matching (exact/fuzzy/mismatch)
 * - Registration code matching
 * - Jurisdiction validation
 * - Address-jurisdiction consistency
 * - Validation block construction for output
 */

// ─── Name matching ──────────────────────────────────────────────────────────

/** Normalize a company name for comparison: lowercase, strip legal suffixes, collapse whitespace */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-()]/g, " ")
    .replace(/\b(gmbh|ag|se|kg|ohg|eg|e v |kgaa|ug|bv|n v |nv|sa|srl|sas|sarl|spa|lda|ab|as|oy|oyj|aps|ltd|plc|llc|inc|corp|co|uab|sia|oü|hf|ehf|tbk|bhd|pte|pty|d o o|s r o|a s|gmbh\s*&\s*co\s*kg)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize a normalized name into words */
function tokenize(name: string): Set<string> {
  return new Set(name.split(/\s+/).filter((w) => w.length > 1));
}

/** Token-set similarity ratio (Jaccard-like, 0-1) */
function tokenSetRatio(a: string, b: string): number {
  const tokensA = tokenize(normalizeName(a));
  const tokensB = tokenize(normalizeName(b));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

export type NameMatchResult = "exact" | "fuzzy" | "mismatch";

/**
 * Compare a fetched company name against the user's input.
 * - "exact": normalized names are identical
 * - "fuzzy": token-set ratio >= 0.85
 * - "mismatch": below threshold
 */
export function validateNameMatch(fetched: string, input: string): NameMatchResult {
  if (!fetched || !input) return "mismatch";

  const normFetched = normalizeName(fetched);
  const normInput = normalizeName(input);

  if (normFetched === normInput) return "exact";

  // Check if one contains the other (handles "Robert Bosch GmbH" vs "Robert Bosch")
  if (normFetched.includes(normInput) || normInput.includes(normFetched)) return "fuzzy";

  const ratio = tokenSetRatio(fetched, input);
  if (ratio >= 0.85) return "fuzzy";

  return "mismatch";
}

// ─── Code matching ──────────────────────────────────────────────────────────

/** Normalize a registration code: uppercase, strip formatting */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s\-\.]/g, "").trim();
}

/** Check if two registration codes match (normalized) */
export function validateCodeMatch(fetched: string | null, input: string | null): boolean {
  if (!fetched || !input) return true; // Can't validate if one is missing
  return normalizeCode(fetched) === normalizeCode(input);
}

// ─── Jurisdiction ───────────────────────────────────────────────────────────

/** ISO 3166-1 alpha-2 normalization */
function normalizeCountry(code: string): string {
  const c = code.toUpperCase().trim();
  // Common aliases
  if (c === "UK") return "GB";
  return c;
}

/** Check if a jurisdiction matches the expected country */
export function validateJurisdiction(fetched: string | null, expected: string | null): boolean {
  if (!fetched || !expected) return true;
  return normalizeCountry(fetched) === normalizeCountry(expected);
}

// ─── Address consistency ────────────────────────────────────────────────────

/**
 * Check if an address is consistent with the expected jurisdiction.
 * Catches bugs like GLEIF returning "DO" (Dominican Republic) for Stuttgart.
 */
export function validateAddressConsistency(
  address: { country?: string; city?: string } | string | null,
  jurisdiction: string,
): boolean {
  if (!address || !jurisdiction) return true;

  let country: string | undefined;
  if (typeof address === "string") {
    // Try to extract country code from address string (last 2-letter segment)
    const parts = address.split(",").map((p) => p.trim());
    const last = parts[parts.length - 1];
    if (last && last.length === 2) country = last;
  } else {
    country = address.country ?? undefined;
  }

  if (!country) return true;
  return normalizeCountry(country) === normalizeCountry(jurisdiction);
}

// ─── Validation block ───────────────────────────────────────────────────────

export type ValidationSeverity = "pass" | "warning" | "fail";

export interface ValidationCheck {
  check: string;
  result: ValidationSeverity;
  detail: string;
}

export interface ValidationBlock {
  valid: boolean;
  checks: ValidationCheck[];
  warnings: string[];
  failures: string[];
}

export function buildValidationBlock(checks: ValidationCheck[]): ValidationBlock {
  const warnings = checks.filter((c) => c.result === "warning").map((c) => c.detail);
  const failures = checks.filter((c) => c.result === "fail").map((c) => c.detail);

  return {
    valid: failures.length === 0,
    checks,
    warnings,
    failures,
  };
}

// ─── Convenience builder ────────────────────────────────────────────────────

/**
 * Run standard validation checks for a company data result.
 *
 * @param fetched - The output from the company data capability
 * @param input - The user's input (company_name, registration_number, etc.)
 * @param expectedJurisdiction - ISO 3166-1 alpha-2 country code
 */
export function validateCompanyResult(
  fetched: {
    company_name?: string | null;
    registration_number?: string | null;
    address?: string | null;
  },
  input: {
    company_name?: string | null;
    registration_number?: string | null;
  },
  expectedJurisdiction: string,
): ValidationBlock {
  const checks: ValidationCheck[] = [];

  // Name match
  if (fetched.company_name && input.company_name) {
    const nameResult = validateNameMatch(fetched.company_name, input.company_name);
    checks.push({
      check: "name_match",
      result: nameResult === "mismatch" && input.registration_number ? "fail" : nameResult === "mismatch" ? "warning" : "pass",
      detail: nameResult === "exact"
        ? `Name matches: "${fetched.company_name}"`
        : nameResult === "fuzzy"
          ? `Name fuzzy match: fetched "${fetched.company_name}" for input "${input.company_name}"`
          : `Name mismatch: fetched "${fetched.company_name}" but input was "${input.company_name}"`,
    });
  }

  // Code match
  if (fetched.registration_number && input.registration_number) {
    const codeMatch = validateCodeMatch(fetched.registration_number, input.registration_number);
    checks.push({
      check: "code_match",
      result: codeMatch ? "pass" : "fail",
      detail: codeMatch
        ? `Registration code matches: ${fetched.registration_number}`
        : `Registration code mismatch: fetched "${fetched.registration_number}" but input was "${input.registration_number}"`,
    });
  }

  // Jurisdiction
  if (fetched.address) {
    const addrConsistent = validateAddressConsistency(fetched.address, expectedJurisdiction);
    checks.push({
      check: "jurisdiction_consistency",
      result: addrConsistent ? "pass" : "warning",
      detail: addrConsistent
        ? `Address consistent with jurisdiction ${expectedJurisdiction}`
        : `Address may be inconsistent with expected jurisdiction ${expectedJurisdiction}`,
    });
  }

  return buildValidationBlock(checks);
}
