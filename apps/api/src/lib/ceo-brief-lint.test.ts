/**
 * Tests for the CEO brief guard.
 *
 * The bar every case has to clear: it must fail against the thing the guard
 * exists to stop. So each block pairs a brief that should be rejected with one
 * that should pass, differing only in the property under test — otherwise a
 * guard that rejected everything would look green here.
 */
import { describe, it, expect } from "vitest";
import { lintBrief, REQUIRED_SECTIONS } from "./ceo-brief-lint.js";

/** A minimal brief that passes, used as the base for negative cases. */
function goodBrief(over: Partial<Record<string, string>> = {}): string {
  const s: Record<string, string> = {
    perf:
      "Revenue rose for the fourth week running and reached its highest level so far. " +
      "Nearly all of it came from one buyer, whose share of our income went up rather than down, " +
      "so the business grew more dependent this week rather than less. Two other buyers appeared " +
      "but between them they spent under fifty cents.",
    changed:
      "One of the free services anyone can call without signing up was taken off the shelf " +
      "overnight and is back on. Nothing else that a customer would notice moved.",
    fixed:
      "The system found that its own quality check had withdrawn a working service on evidence " +
      "that contained no fault, put the service back, and stopped us advertising things we had " +
      "stopped serving. Left alone, agents arriving at our front door would have been turned away " +
      "by a message that named the very service we were refusing.",
    now:
      "Finding a second real buyer. Making the quality check stop punishing services for correctly " +
      "refusing bad input. Understanding who is walking our catalogue at night.",
    decide: "Nothing needs your decision today.",
    ...over,
  };
  return [
    "# Morning brief — 2026-08-22",
    "",
    "## 1. Business performance",
    "",
    s.perf,
    "",
    "## 2. What materially changed",
    "",
    s.changed,
    "",
    "## 3. Fixed automatically",
    "",
    s.fixed,
    "",
    "## 4. Working on now",
    "",
    s.now,
    "",
    "## 5. Needs your decision",
    "",
    s.decide,
    "",
  ].join("\n");
}

describe("the baseline brief passes", () => {
  it("has no errors — otherwise every negative case below is meaningless", () => {
    const r = lintBrief(goodBrief());
    expect(r.findings.filter((f) => f.severity === "error"), JSON.stringify(r.findings)).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("structure is a contract, not a suggestion", () => {
  for (const section of REQUIRED_SECTIONS) {
    it(`rejects a brief missing "${section}"`, () => {
      const text = goodBrief().replace(new RegExp(`^## \\d+\\. ${section}.*$`, "m"), "## Something else");
      const r = lintBrief(text);
      expect(r.ok).toBe(false);
      expect(r.findings.some((f) => f.rule === "missing-section")).toBe(true);
    });
  }

  it("rejects the five sections in the wrong order", () => {
    const b = goodBrief();
    const swapped = b
      .replace("## 1. Business performance", "@@A@@")
      .replace("## 5. Needs your decision", "## 1. Business performance")
      .replace("@@A@@", "## 5. Needs your decision");
    const r = lintBrief(swapped);
    expect(r.findings.some((f) => f.rule === "section-order")).toBe(true);
  });
});

describe("technical vocabulary is rejected wherever it appears", () => {
  const cases: Array<[string, string]> = [
    ["commit-sha", "The change landed as b5e7428 and is live."],
    ["pr-number", "Shipped in PR #358 this morning."],
    ["filename", "The problem was in free-tier.ts and is resolved."],
    ["db-internals", "A column was being read as though it meant something else."],
    ["vcs", "I merged the change and verified the deploy."],
    ["testing", "Fourteen new tests cover it, all passing."],
    ["migration", "Block 0100 put the service back on the shelf."],
    ["internal-vocab", "The quality floor quarantined it at six this morning."],
    ["jargon", "The executor was returning the wrong payload."],
    ["tooling", "A new npm package handles it now."],
    ["sql", "I ran SELECT count FROM transactions to confirm."],
  ];
  for (const [rule, sentence] of cases) {
    it(`rejects ${rule}: "${sentence}"`, () => {
      const r = lintBrief(goodBrief({ changed: sentence }));
      expect(r.ok, `expected rejection for ${rule}`).toBe(false);
      expect(r.findings.some((f) => f.rule === rule), JSON.stringify(r.findings)).toBe(true);
    });
  }

  it("does not reject ordinary business English that merely sounds technical", () => {
    const r = lintBrief(goodBrief({
      changed:
        "We now charge the same price for the search service and it is available to anyone " +
        "without an account. Customers reach it through the same front door as before.",
    }));
    expect(r.findings.filter((f) => f.severity === "error"), JSON.stringify(r.findings)).toEqual([]);
  });

  it("permits an explicitly allowed term, for the rare indispensable case", () => {
    const bad = lintBrief(goodBrief({ changed: "The x402 rail carries nearly all revenue." }));
    // "rail" is fine; nothing in the banned list fires here, so construct the
    // real case: a filename that genuinely has to be named.
    void bad;
    const withFile = goodBrief({ changed: "Our published price list, pricing.json, was wrong." });
    expect(lintBrief(withFile).ok).toBe(false);
    expect(lintBrief(withFile, { allowTerms: ["pricing.json"] }).ok).toBe(true);
  });
});

describe("the brief may not open as a work log", () => {
  it("rejects an opening that leads with what the agent did", () => {
    const r = lintBrief(goodBrief({
      perf: "I ran the morning checks and then spent the session on the quality problem. " +
            "Revenue rose for the fourth week running and reached its highest level so far.",
    }));
    expect(r.findings.some((f) => f.rule === "activity-log-opening")).toBe(true);
  });

  it("accepts the same content led by the business fact", () => {
    const r = lintBrief(goodBrief({
      perf: "Revenue rose for the fourth week running and reached its highest level so far, " +
            "but almost all of the increase came from the one buyer we already had.",
    }));
    expect(r.findings.some((f) => f.rule === "activity-log-opening")).toBe(false);
  });
});

describe("escalations carry all five fields or they are not ready", () => {
  const complete =
    "One decision. **The choice:** whether to soften a claim on the website that we cannot fully " +
    "stand behind. **What is established:** the claim holds for altering a single record and not " +
    "for ordering or deletion across a three-and-a-half-month window; replacement wording is drafted. " +
    "**Options:** change the wording now, or leave it and accept the exposure. " +
    "**I recommend** changing it. **Consequence:** changing it costs an hour and narrows what we " +
    "advertise; leaving it means a compliance buyer reads a claim we cannot fully support.";

  it("accepts an escalation with all five", () => {
    const r = lintBrief(goodBrief({ decide: complete }));
    expect(r.findings.filter((f) => f.severity === "error"), JSON.stringify(r.findings)).toEqual([]);
  });

  it("rejects an escalation with no recommendation — the commonest omission", () => {
    const r = lintBrief(goodBrief({
      decide: complete.replace("**I recommend** changing it.", "Your call."),
    }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "escalation-incomplete" && /recommendation/.test(f.message))).toBe(true);
  });

  it("rejects an escalation that states no consequence", () => {
    const r = lintBrief(goodBrief({
      decide: "**The choice:** whether to change the website wording. **What is established:** it " +
              "overstates what we provide. **Options:** change it or keep it. **I recommend** changing it.",
    }));
    expect(r.findings.some((f) => f.rule === "escalation-incomplete" && /consequence/.test(f.message))).toBe(true);
  });

  it("rejects a bare problem forwarded without a decision shape", () => {
    const r = lintBrief(goodBrief({
      decide: "The website wording is probably wrong. Let me know what you want to do about it.",
    }));
    expect(r.ok).toBe(false);
  });

  it("accepts the explicit nothing-to-decide line", () => {
    const r = lintBrief(goodBrief({ decide: "Nothing needs your decision today." }));
    expect(r.ok).toBe(true);
  });

  it("rejects an empty decision section rather than reading it as nothing to decide", () => {
    const r = lintBrief(goodBrief({ decide: "" }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "empty-decision-section")).toBe(true);
  });

  it("warns when more than three things want a decision", () => {
    const r = lintBrief(goodBrief({
      decide: complete + "\n\n- one\n- two\n- three\n- four\n",
    }));
    expect(r.findings.some((f) => f.rule === "escalation-volume")).toBe(true);
  });
});

describe("length", () => {
  it("fails a brief that has grown back into a report", () => {
    const filler = "The business continued to serve customers in the usual way and nothing else changed. ";
    const r = lintBrief(goodBrief({ fixed: filler.repeat(120) }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "too-long")).toBe(true);
  });

  it("warns, but does not fail, just over the target", () => {
    const filler = "Customers kept buying the same services at the same prices through the week. ";
    const r = lintBrief(goodBrief({ fixed: filler.repeat(50) }));
    expect(r.findings.some((f) => f.rule === "long")).toBe(true);
    expect(r.ok, "a warning must not fail the run").toBe(true);
  });

  it("does not count tables or fenced blocks toward the prose budget", () => {
    const withTable = goodBrief() + "\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    expect(lintBrief(withTable).words).toBe(lintBrief(goodBrief()).words);
  });
});
