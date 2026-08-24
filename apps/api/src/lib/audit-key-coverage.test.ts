/**
 * Every error-shaped key an audit builder emits is classified.
 *
 * `sanitize.ts` used to claim this guard existed. It did not: the only test
 * behind the claim was `expect([...AUDIT_ERROR_KEY_NAMES].sort()).toEqual([...])`,
 * which pins the constant to itself. It fails when someone edits the key set —
 * the opposite of the property claimed — and is entirely blind to what the
 * builders emit. Add `failure_reason: err.message` to a builder tomorrow and
 * the suite stays green. Reviewer-found, and a claimed-but-absent guard is
 * worse than no guard.
 *
 * This is the real thing. It reads the builder SOURCE and fails on an
 * error-shaped key that is neither redacted nor explicitly classified as
 * carrying something other than failure text.
 *
 * ## What it cannot promise
 *
 * A source scan sees literal keys. A computed key (`[name]: value`) or one
 * introduced by spreading another object is invisible to it. That bound is
 * stated here rather than discovered later, which is the difference between
 * this and the comment it replaces.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_ERROR_KEY_NAMES } from "./sanitize.js";

const ROOT = join(import.meta.dirname, "..");

/**
 * The FUNCTIONS that build an `audit_trail` body, not the files containing
 * them.
 *
 * Scanning whole files was the first attempt and it was useless noise: it
 * caught `failureType` from the failed_requests writer, `errorCode` from the
 * HTTP error envelopes, `failure_class` from the invocation facts -- none of
 * which reach an audit body. A guard that reports a dozen irrelevant keys is
 * one people learn to override.
 */
const BUILDERS: Array<{ file: string; fn: string }> = [
  { file: "routes/do.ts", fn: "buildFullAudit" },
  { file: "routes/do.ts", fn: "buildFailureAudit" },
  { file: "routes/solution-execute.ts", fn: "buildInlineAudit" },
  { file: "routes/x402-gateway-v2.ts", fn: "buildX402AuditTrail" },
];

/**
 * The body of a named function.
 *
 * The parameter list has to be skipped first. `buildFailureAudit(params: {…})`
 * opens a brace BEFORE the body does, so counting from the first `{` after the
 * name returns the parameter type literal — 440 characters of argument names,
 * with the real body never scanned. The first version did exactly that and
 * reported success, which is the failure mode this whole file exists to
 * prevent: a check that runs, finds nothing, and means nothing.
 */
function functionBody(source: string, fn: string): string {
  const at = source.search(new RegExp(`function\\s+${fn}\\b`));
  if (at < 0) throw new Error(`builder ${fn} not found -- has it been renamed?`);

  // Walk the parameter list to its matching close paren.
  const paren = source.indexOf("(", at);
  if (paren < 0) throw new Error(`no parameter list on ${fn}`);
  let parens = 0;
  let afterParams = -1;
  for (let i = paren; i < source.length; i++) {
    if (source[i] === "(") parens++;
    else if (source[i] === ")") {
      parens--;
      if (parens === 0) {
        afterParams = i;
        break;
      }
    }
  }
  if (afterParams < 0) throw new Error(`unbalanced parens on ${fn}`);

  const open = source.indexOf("{", afterParams);
  if (open < 0) throw new Error(`no body on ${fn}`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces scanning ${fn}`);
}

/** Anything that looks like it might carry failure text. */
const ERROR_SHAPED = /^(?:\w*_)?(?:error|reason|message|detail|stderr|failure)\w*$/i;

/**
 * Error-shaped keys that are NOT failure text, with the reason.
 *
 * Being here is a decision someone made, not a gap nobody noticed — which is
 * the whole point of making the scan fail closed.
 */
const NOT_FAILURE_TEXT: Record<string, string> = {
  error_code: "a closed enum, never free text",
  error_category: "a closed enum from buildFailureProvenance",
  reason: "solution step skip/unavailable text. Deliberately NOT redacted: it is authored copy naming a FIELD (\"vat-validate reported company.name=null\"), and the hostname stripper turns company.name into [service], which reads as though a service were null. Non-leaking today because every producer writes canned strings.",
  message: "authored gate message from solution_steps.gate_condition, never upstream text",
  error_message_hash: "a digest, not text",
  errorMessage: "a local variable name, not an emitted key",
};

function emittedKeys(source: string): string[] {
  // Object-literal keys only: `foo:` at a property position.
  const keys = new Set<string>();
  for (const m of source.matchAll(/(?:^|[{,\s])([a-z_][\w]*)\s*:/gim)) {
    keys.add(m[1]!);
  }
  return [...keys];
}

describe("audit builders emit no unclassified error-shaped key", () => {
  const redacted = new Set(AUDIT_ERROR_KEY_NAMES);
  const found: Record<string, string[]> = {};

  for (const { file, fn } of BUILDERS) {
    const rel = `${file}:${fn}`;
    const source = functionBody(readFileSync(join(ROOT, file), "utf8"), fn);
    for (const key of emittedKeys(source)) {
      if (!ERROR_SHAPED.test(key)) continue;
      if (redacted.has(key)) continue;
      if (NOT_FAILURE_TEXT[key]) continue;
      (found[rel] ??= []).push(key);
    }
  }

  it("every error-shaped key is redacted or classified", () => {
    const lines = Object.entries(found).map(([f, ks]) => `  ${f}: ${ks.join(", ")}`);
    expect(
      lines,
      "Error-shaped keys in an audit builder that are neither in AUDIT_ERROR_KEYS " +
        "nor in NOT_FAILURE_TEXT. Decide which: if it can carry upstream text it " +
        "must be redacted; if it cannot, say why.\n" + lines.join("\n"),
    ).toEqual([]);
  });

  it("every redacted key is one a builder actually emits", () => {
    const all = new Set(
      BUILDERS.flatMap(({ file, fn }) =>
        emittedKeys(functionBody(readFileSync(join(ROOT, file), "utf8"), fn)),
      ),
    );
    const orphans = [...redacted].filter((k) => !all.has(k));
    expect(orphans, `Redacted keys no builder emits: ${orphans.join(", ")}`).toEqual([]);
  });

  describe("the scan itself, on inputs we control", () => {
    // A source scan over a clean repository finds nothing, and "found nothing"
    // is indistinguishable from "cannot find anything".
    it("recognises an error-shaped key", () => {
      for (const k of ["error", "error_message", "failure_reason", "stderr", "detail", "reason"]) {
        expect(ERROR_SHAPED.test(k), k).toBe(true);
      }
    });

    it("does not flag an unrelated key", () => {
      for (const k of ["latency_ms", "capability", "status", "input_hash"]) {
        expect(ERROR_SHAPED.test(k), k).toBe(false);
      }
    });

    it("extracts literal object keys from source", () => {
      expect(emittedKeys("return { a_key: 1, failure_reason: x };")).toContain("failure_reason");
    });

    it("reads a function body, not the whole file", () => {
      const src =
        "function other() { return { failure_reason: 1 }; } " +
        "function target() { return { ok: 1 }; }";
      expect(emittedKeys(functionBody(src, "target"))).not.toContain("failure_reason");
    });

    it("skips the parameter list, which is where the first version went wrong", () => {
      const src = "function f(params: { errorMessage: string }) { return { error_message: 1 }; }";
      const keys = emittedKeys(functionBody(src, "f"));
      expect(keys, "scanned the parameter type literal instead of the body").toContain(
        "error_message",
      );
      expect(keys).not.toContain("errorMessage");
    });

    it("fails loudly if a builder is renamed rather than silently scanning nothing", () => {
      expect(() => functionBody("function a() {}", "buildNope")).toThrow(/not found/);
    });
  });
});
