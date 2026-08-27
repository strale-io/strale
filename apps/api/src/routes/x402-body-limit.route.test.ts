/**
 * The 413 must survive the ROUTE, not just `extractInputs`.
 *
 * ## The defect this exists to hold
 *
 * `x402-body-limit.test.ts` proves `extractInputs` rethrows a `BodyLimitError`
 * rather than falling through to query params. That is necessary and it is not
 * sufficient — and the difference was invisible until a mutation exposed it.
 * Reverting BOTH route callers so they convert the rethrown error back into a
 * 400 left every other test green.
 *
 * Both call sites wrap it:
 *
 *     try { inputs = await extractInputs(c, cap.inputSchema); }
 *     catch { return c.json({ error: "Invalid request body…" }, 400); }
 *
 * Hono's `bodyLimit` emits its 413 only when the error reaches `c.error`, so a
 * handler that absorbs it defeats the middleware no matter what
 * `extractInputs` does.
 *
 * ## Why this is a SOURCE guard and not a request
 *
 * Stated plainly, because a source scan is exactly the shape that produced two
 * hollow guards earlier in this programme.
 *
 * Driving the branch needs a request that (a) passes the rail cap check, (b)
 * gets past payment verification, and (c) reaches `extractInputs`. Both routes
 * were tried against the real app with a mocked DB:
 *
 *   - `/x402/:slug` answers **404** for a streamed body while answering
 *     normally for a small one — an artifact of `bodyLimit` re-wrapping
 *     `c.req.raw`, which loses the matched route params under `app.request`.
 *   - `/x402/solutions/:slug` answers **503**, because the handler's
 *     configuration check fires before the body is read.
 *
 * Neither is a fault in the limit, and neither can be made to assert it
 * without contorting the harness into something that no longer resembles the
 * production path. A reproduction of the handler in a toy app was the other
 * option and is what let this defect through the first time: it tests a copy
 * of the code, not the code.
 *
 * So this reads the real source and asserts the property structurally, with
 * positive controls below proving the scanner can actually fail.
 *
 * **What it cannot promise:** it sees the literal text of the catch blocks. A
 * wrapper refactored into a helper, or a rethrow expressed differently, would
 * read as absent and fail loudly — which is the safe direction — but a
 * genuinely equivalent guard written another way would need this list updated.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GATEWAY = join(import.meta.dirname, "x402-gateway-v2.ts");

/**
 * The body of every `catch` that directly wraps an `extractInputs(...)` call.
 *
 * Located from the call site rather than by searching for catch blocks, so a
 * NEW call site added without a guard is found, instead of only the two that
 * exist today.
 */
/**
 * Remove line and block comments before scanning.
 *
 * Reviewer-found: without this the guard accepted a catch that always returned
 * 400 as long as the words `name === "BodyLimitError"` and `throw err`
 * appeared somewhere in a COMMENT inside it. A guard that a comment can
 * satisfy is not a guard. Crude but adequate here — the input is one known
 * TypeScript file, not arbitrary source.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*/gm, "$1");
}

function catchBodiesWrappingExtractInputs(rawSource: string): string[] {
  const source = stripComments(rawSource);
  const bodies: string[] = [];
  const call = /await extractInputs\(/g;
  for (const m of source.matchAll(call)) {
    const after = source.slice(m.index!);
    // Whitespace-tolerant. Requiring the literal string "} catch" meant a
    // catch on the following line was invisible, and the positive controls
    // below reported no call sites at all — the scanner failing silently,
    // which is the exact shape this file is written to avoid.
    const m2 = /\}\s*catch\s*(?:\([^)]*\))?\s*\{/.exec(after);
    // The catch must follow closely; anything further is a different block.
    if (!m2 || m2.index > 400) continue;
    const open = m2.index + m2[0].length - 1;
    let depth = 0;
    for (let i = open; i < after.length; i++) {
      if (after[i] === "{") depth++;
      else if (after[i] === "}") {
        depth--;
        if (depth === 0) {
          bodies.push(after.slice(open, i + 1));
          break;
        }
      }
    }
  }
  return bodies;
}

const RETHROWS = /name\s*===\s*"BodyLimitError"[\s\S]{0,40}throw\s+err/;

describe("every caller of extractInputs preserves the body-cap abort", () => {
  const source = readFileSync(GATEWAY, "utf8");
  const bodies = catchBodiesWrappingExtractInputs(source);

  it("finds EXACTLY the call sites that exist", () => {
    // Guards the guard, and deliberately exact rather than `>= 2`. With a
    // lower bound, a third call site whose catch the scanner silently skipped
    // would leave the suite green while going unchecked — reviewer-found.
    // If a legitimate new caller is added, this fails and the author has to
    // look at it, which is the intent.
    const callSites = (stripComments(source).match(/await extractInputs\(/g) ?? []).length;
    expect(bodies.length, "a catch wrapping extractInputs was not located").toBe(callSites);
    expect(callSites, "no extractInputs call sites found — has it been renamed?").toBe(2);
  });

  it("every one of them rethrows a BodyLimitError", () => {
    const missing = bodies.filter((b) => !RETHROWS.test(b));
    expect(
      missing.length,
      `A catch around extractInputs swallows the body-cap abort, so an ` +
        `oversized streamed body would answer 400 instead of 413:\n${missing.join("\n---\n")}`,
    ).toBe(0);
  });

  it("they still fall through to a 400 for an ordinary parse failure", () => {
    // The other direction: the guard must not have been implemented by
    // deleting the fallback that non-oversized malformed bodies rely on.
    for (const b of bodies) {
      expect(b).toMatch(/Invalid request body/);
    }
  });

  describe("the scanner itself, on inputs it does not control", () => {
    it("flags a catch that swallows", () => {
      const bad = `
        try { inputs = await extractInputs(c, cap.inputSchema); }
        catch { return c.json({ error: "Invalid request body. Expected JSON." }, 400); }
      `;
      const found = catchBodiesWrappingExtractInputs(bad);
      expect(found).toHaveLength(1);
      expect(RETHROWS.test(found[0]!)).toBe(false);
    });

    it("accepts a catch that rethrows", () => {
      const good = `
        try { inputs = await extractInputs(c, cap.inputSchema); }
        catch (err) {
          if ((err as { name?: string })?.name === "BodyLimitError") throw err;
          return c.json({ error: "Invalid request body. Expected JSON." }, 400);
        }
      `;
      const found = catchBodiesWrappingExtractInputs(good);
      expect(found).toHaveLength(1);
      expect(RETHROWS.test(found[0]!)).toBe(true);
    });

    it("is NOT satisfied by the tokens appearing in a comment", () => {
      const commented = `
        try { inputs = await extractInputs(c, cap.inputSchema); }
        catch {
          // name === "BodyLimitError" would throw err, but this does not.
          return c.json({ error: "Invalid request body. Expected JSON." }, 400);
        }
      `;
      const found = catchBodiesWrappingExtractInputs(commented);
      expect(found).toHaveLength(1);
      expect(RETHROWS.test(found[0]!), "a comment satisfied the guard").toBe(false);
    });

    it("finds a NEW call site, not just the two that exist today", () => {
      const two = `
        try { inputs = await extractInputs(c, a); } catch { return x(400); }
        try { inputs = await extractInputs(c, b); } catch { return y(400); }
      `;
      expect(catchBodiesWrappingExtractInputs(two)).toHaveLength(2);
    });
  });
});
