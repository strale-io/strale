/**
 * Unit tests for check-pii.mjs (renamed from check-manifest-pii.mjs and
 * widened 2026-08-14 after the italian-company-stakeholders incident — see
 * that script's header for the full background).
 *
 * Per Rule 12 (audit-follow-up test coverage): the script itself is .mjs
 * and scans the on-disk repo; these tests mirror its pure logic against
 * fixture strings so they don't depend on the production file tree. If the
 * mjs script's detection logic changes, this mirror must change with it —
 * matches the established convention in check-manifest-guaranteed-consistency.test.ts.
 *
 * The critical case this file exists to pin: a checksum-valid identifier
 * must fail the gate, and a shape-preserving synthetic replacement (the
 * pattern commit 8774fff actually shipped) must pass it. Both directions
 * are asserted below so a future edit to the checksum logic can't silently
 * stop discriminating. This suite intentionally does NOT reproduce the two
 * real codice fiscale values from the 2026-08-14 incident itself — see the
 * comment above the Detector 2 describe block for why, and how that exact
 * case was verified instead.
 */

import { describe, it, expect } from "vitest";

// ---- Mirror of Detector 1 (PII_FIELDS name check) -------------------------

const PII_FIELDS = new Set([
  "directors", "partners", "legal_representatives", "officers",
  "former_officers", "beneficial_owners", "shareholders", "board_members",
  "ubos", "representatives", "managers", "signatories",
]);

const SYNTHETIC = /\[REDACTED\]|\bEXAMPLE\b|\bEXEMPLE\b|\bEXEMPLO\b|\bEXEMPEL\b|\bESIMERKKI\b|\bBEISPIEL\b|\bPLACEHOLDER\b|\bJOHN DOE\b|\bJANE DOE\b|\bTEST\b/i;

function nameOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string") {
    return (entry as { name: string }).name;
  }
  return null;
}

function walkPiiFields(node: unknown, path: string, out: Array<{ path: string; name: string }>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkPiiFields(v, `${path}[${i}]`, out));
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (PII_FIELDS.has(key) && Array.isArray(value) && value.length > 0) {
      for (const entry of value) {
        const name = nameOf(entry);
        if (name && !SYNTHETIC.test(name)) out.push({ path: here, name });
      }
    }
    walkPiiFields(value, here, out);
  }
}

// ---- Mirror of Detector 2 (high-signal identifier scan) -------------------

const CF_ODD: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const CF_EVEN: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19,
  U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

function cfChecksumValid(candidate: string): boolean {
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(candidate)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = candidate[i];
    sum += i % 2 === 0 ? CF_ODD[c] : CF_EVEN[c];
  }
  const expected = String.fromCharCode(65 + (sum % 26));
  return expected === candidate[15];
}

const IBAN_COUNTRY_CODES = new Set([
  "AD", "AE", "AL", "AT", "AZ", "BA", "BE", "BG", "BH", "BR", "BY", "CH", "CR", "CY", "CZ",
  "DE", "DK", "DO", "EE", "EG", "ES", "FI", "FO", "FR", "GB", "GE", "GI", "GL", "GR", "GT",
  "HR", "HU", "IE", "IL", "IQ", "IS", "IT", "JO", "KW", "KZ", "LB", "LC", "LI", "LT", "LU",
  "LV", "LY", "MC", "MD", "ME", "MK", "MR", "MT", "MU", "NL", "NO", "PK", "PL", "PS", "PT",
  "QA", "RO", "RS", "SA", "SC", "SE", "SI", "SK", "SM", "ST", "SV", "TL", "TN", "TR", "UA",
  "VA", "VG", "XK",
]);

function ibanChecksumValid(candidate: string): boolean {
  if (candidate.length < 15 || candidate.length > 34) return false;
  if (!IBAN_COUNTRY_CODES.has(candidate.slice(0, 2))) return false;
  const rearranged = candidate.slice(4) + candidate.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  if (!/^\d+$/.test(expanded)) return false;
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    remainder = Number(`${remainder}${expanded.slice(i, i + 7)}`) % 97;
  }
  return remainder === 1;
}

const CF_PATTERN = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

function findIdentifiers(text: string): Array<{ kind: "codice_fiscale" | "iban"; value: string }> {
  const out: Array<{ kind: "codice_fiscale" | "iban"; value: string }> = [];
  for (const m of text.matchAll(CF_PATTERN)) {
    if (cfChecksumValid(m[0])) out.push({ kind: "codice_fiscale", value: m[0] });
  }
  for (const m of text.matchAll(IBAN_PATTERN)) {
    if (ibanChecksumValid(m[0])) out.push({ kind: "iban", value: m[0] });
  }
  return out;
}

// ---- Tests ------------------------------------------------------------

describe("check-pii Detector 1 (manifest PII-field name check, unchanged)", () => {
  it("passes a clean manifest with empty PII arrays", () => {
    const found: Array<{ path: string; name: string }> = [];
    walkPiiFields({ output_schema: { example: { directors: [] } } }, "", found);
    expect(found).toEqual([]);
  });

  it("passes a manifest example using an EXAMPLE-prefixed synthetic placeholder", () => {
    const found: Array<{ path: string; name: string }> = [];
    walkPiiFields(
      { legal_representatives: [{ type: "person", name: "EXAMPLE MANAGING DIRECTOR" }] },
      "output_schema.example",
      found,
    );
    expect(found).toEqual([]);
  });

  it("flags a real-looking name in a PII field", () => {
    const found: Array<{ path: string; name: string }> = [];
    walkPiiFields(
      { legal_representatives: [{ type: "person", name: "LUCA SCURIATTI" }] },
      "output_schema.example",
      found,
    );
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("LUCA SCURIATTI");
  });
});

describe("check-pii Detector 2 (high-signal identifier scan)", () => {
  // NOTE ON TEST DATA: this suite deliberately does NOT reproduce the two
  // real codice fiscale values from the 2026-08-14 incident (commits
  // c998bff / 8774fff), even though "the exact fixture content must fail
  // the gate" is the requirement being verified. Landing the real values in
  // a new committed file on main would recreate the exact problem this gate
  // exists to prevent — it doesn't matter that the string sits inside a
  // test fixture rather than a manifest; a checksum-valid Italian codice
  // fiscale is personal data regardless of which file it's in. That
  // discrimination was instead verified once, manually, against an
  // ephemeral (never-committed) reconstruction of both the incident's real
  // values and their commit-8774fff synthetic replacements, run through
  // the actual CLI end-to-end — both directions confirmed correct. See the
  // PR description for the reproduction method.
  //
  // What IS safe to commit, and what these tests use instead: a codice
  // fiscale this suite constructs itself from a keyboard-row letter block
  // ("QWERTY") that cannot decode to any plausible Italian surname/name
  // pair, run through the same check-letter algorithm to produce a
  // genuinely checksum-valid instance. This proves the checksum math
  // correctly classifies valid-vs-invalid without asserting anything about
  // — or reproducing — a real person's actual identifier.
  const SYNTHETIC_VALID_CF = "QWERTY85M01H501Y"; // format-valid, checksum-valid, not name-derived

  it("flags a checksum-valid codice fiscale regardless of which JSON key it sits under", () => {
    const snippet = `taxCode: "${SYNTHETIC_VALID_CF}",`;
    const found = findIdentifiers(snippet);
    expect(found).toEqual([{ kind: "codice_fiscale", value: SYNTHETIC_VALID_CF }]);
  });

  it("does NOT flag the shape-preserving synthetic replacements commit 8774fff shipped", () => {
    const scrubbedSnippet = `
      taxCode: "RSSMRA70A01H501X",
      taxCode: "BNCGLI80A41H501X",
      taxCode: "XXXXXX00X00X000X",
    `;
    expect(findIdentifiers(scrubbedSnippet)).toEqual([]);
  });

  it("discriminates codice fiscale by real checksum, not by format alone", () => {
    // Same 16-char shape; only the check letter differs.
    expect(cfChecksumValid(SYNTHETIC_VALID_CF)).toBe(true);
    expect(cfChecksumValid(SYNTHETIC_VALID_CF.slice(0, 15) + "A")).toBe(false); // wrong check letter
    expect(cfChecksumValid("not-a-cf-shape")).toBe(false);
  });

  it("flags a checksum-valid IBAN embedded in prose", () => {
    const text = "Wire the deposit to DE89370400440532013000 before Friday.";
    const found = findIdentifiers(text);
    expect(found).toEqual([{ kind: "iban", value: "DE89370400440532013000" }]);
  });

  it("does NOT flag an IBAN-shaped string with an invalid checksum", () => {
    // Same length/shape as a real German IBAN, checksum deliberately wrong.
    expect(ibanChecksumValid("DE89370400440532013001")).toBe(false);
  });

  it("does NOT flag a random uppercase-alphanumeric string that merely looks IBAN-shaped", () => {
    const found = findIdentifiers("ORDER-REF AB12CDEFGHIJKLMNOP more text");
    expect(found).toEqual([]);
  });

  it("rejects an unrecognized IBAN country-code prefix", () => {
    // ZZ is not an assigned IBAN country code — gated before the mod-97 math runs.
    expect(ibanChecksumValid("ZZ89370400440532013000")).toBe(false);
  });
});
