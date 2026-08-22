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
    ["db-internals", "A database column was being read as though it meant something else."],
    ["vcs", "I merged the pull request and pushed to main."],
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

describe("the vocabulary rules survive an adversarial read", () => {
  // Every case below was found by an independent review of the first version,
  // which was wrong in both directions at once: blind to shas in their most
  // common position, and rejecting ordinary business English.

  it("catches a commit id at the end of a sentence, not only mid-sentence", () => {
    // The first version's trailing `(?![.\w])` made exactly this invisible,
    // and the original unit test happened to use the mid-sentence form — a
    // rule validated only where it worked.
    const r = lintBrief(goodBrief({ changed: "The correction is live as of 1ec94b0." }));
    expect(r.findings.some((f) => f.rule === "commit-sha"), JSON.stringify(r.findings)).toBe(true);
  });

  for (const word of ["acceded", "effaced", "defaced", "faceded"]) {
    it(`does not mistake the English word "${word}" for a commit id`, () => {
      const r = lintBrief(goodBrief({ changed: `The largest buyer ${word} to the new price this week.` }));
      expect(r.findings.some((f) => f.rule === "commit-sha"), JSON.stringify(r.findings)).toBe(false);
    });
  }

  it("does not flag long plain numbers as commit ids", () => {
    for (const line of [
      "Moonlighter AB, org 5593957979, remains the seller.",
      "We processed 1234567 requests this month.",
    ]) {
      const r = lintBrief(goodBrief({ changed: line }));
      expect(r.findings.some((f) => f.rule === "commit-sha"), line).toBe(false);
    }
  });

  it("accepts ordinary business English the word-level rules used to reject", () => {
    // Each of these was a false positive against the first version. A guard
    // that rejects correct prose gets worked around, so these are load-bearing.
    for (const line of [
      "The table above shows where the money came from.",
      "Our price index is unchanged this month.",
      "The real test is whether a second buyer appears.",
      "We sell a package of three checks for a fixed price.",
      "We deployed capital into the growth bundles rather than compliance.",
      "That is a branch of the business we have not invested in.",
      "I recommend we commit to the higher price for a month.",
      "This is not a financial instrument and we do not market it as one.",
    ]) {
      const r = lintBrief(goodBrief({ changed: line }));
      expect(r.findings.filter((f) => f.severity === "error"), line).toEqual([]);
    }
  });

  it("treats a code span as a finding rather than as a way round the rules", () => {
    // Stripping inline code made every rule bypassable by typing backticks.
    const r = lintBrief(goodBrief({ changed: "The fix landed in `free-tier.ts` overnight." }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "code-span")).toBe(true);
  });

  it("allowing one term does not disable the rest of its rule on that line", () => {
    // The first version examined one match per rule per line and skipped the
    // line entirely if that match was allowlisted.
    const brief = goodBrief({ changed: "Our price list, pricing.json, was wrong, and so was billing.yaml." });
    const r = lintBrief(brief, { allowTerms: ["pricing.json"] });
    expect(r.ok, "the second filename must still be caught").toBe(false);
    expect(r.findings.some((f) => f.rule === "filename" && f.message.includes("billing.yaml"))).toBe(true);
  });
});

describe("the brief may not open as a work log", () => {
  it("rejects a bulleted work-log opening", () => {
    // The opening patterns are anchored, so a leading "- " hid the whole rule.
    const r = lintBrief(goodBrief({
      perf: "- We ran the morning checks and then looked at the quality problem.",
    }));
    expect(r.findings.some((f) => f.rule === "activity-log-opening")).toBe(true);
  });

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

/** A complete five-field founder escalation. Shared by several blocks below. */
const complete =
  "One decision. **The choice:** whether to soften a claim on the website that we cannot fully " +
  "stand behind. **What is established:** the claim holds for altering a single record and not " +
  "for ordering or deletion across a three-and-a-half-month window; replacement wording is drafted. " +
  "**Options:** change the wording now, or leave it and accept the exposure. " +
  "**I recommend** changing it. **Consequence:** changing it costs an hour and narrows what we " +
  "advertise; leaving it means a compliance buyer reads a claim we cannot fully support.";

describe("escalations carry all five fields or they are not ready", () => {
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

  it("rejects a fluent paragraph that decides nothing", () => {
    // This passed the first version clean. Every field was 'present' as
    // vocabulary and none was present as content.
    const r = lintBrief(goodBrief({
      decide:
        "We should decide whether to keep going as we are. The facts have not moved since " +
        "Monday. Either we wait another week or we act now. I would wait. Waiting leaves us " +
        "where we are.",
    }));
    expect(r.ok, "fluency is not a decision").toBe(false);
    expect(r.findings.filter((f) => f.rule === "escalation-incomplete").length).toBe(5);
  });

  it("accepts a terse escalation that carries real content under the labels", () => {
    // The mirror case: the first version rejected this on all five fields.
    const r = lintBrief(goodBrief({
      decide:
        "**The choice: what to charge for the Greek registry lookup.** " +
        "**What is established:** 11 paid calls in 30 days at 20 cents, and the supplier " +
        "charges us 12 cents each. **Options:** hold at 20 cents, or move to 35. " +
        "**I recommend** 35. **The consequence:** left alone we forgo about 15 euros a month.",
    }));
    expect(r.findings.filter((f) => f.severity === "error"), JSON.stringify(r.findings)).toEqual([]);
  });

  it("is not exempted by a nothing-to-decide sentence with a rider", () => {
    // Found by adversarial review: the exemption was a substring search, so one
    // clause disabled every field check AND the already-executed check.
    const r = lintBrief(goodBrief({
      decide: "Nothing needs your decision today, except one thing.\n\n" +
              "FOUNDER_DECISION\n\nShould we double the price of everything? Tell me.",
    }));
    expect(r.ok, "a rider must not exempt the section").toBe(false);
    // At least the five fields of the tagged escalation. The untagged rider is
    // itself checked as a decision block, so the real count is a multiple.
    expect(r.findings.filter((f) => f.rule === "escalation-incomplete").length)
      .toBeGreaterThanOrEqual(5);
  });

  it("is not exempted when a handover follows the sentence", () => {
    const r = lintBrief(goodBrief({
      decide: "Nothing needs your decision today.\n\nAUTHORIZATION_UNAVAILABLE\n\n**Settled:** the records should be closed.",
    }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "handover-incomplete")).toBe(true);
    // Discriminating specifically against the PREVIOUS fix, not just the
    // original bug: the version before this one terminated the section at any
    // heading, so the sub-heading below hid everything after it.
    const behindSubheading = lintBrief(goodBrief({
      decide: "Nothing needs your decision today.\n\n### One more thing\n\n" +
              "AUTHORIZATION_UNAVAILABLE\n\n**Settled:** the records should be closed.",
    }));
    expect(behindSubheading.ok, "a sub-heading must not end the section").toBe(false);
  });

  it("checks content hidden behind a sub-heading", () => {
    // Probe from adversarial review: one `###` line ended the section, so an
    // escalation with no fields at all linted clean.
    const r = lintBrief(goodBrief({
      decide: "Nothing needs your decision today.\n\n### One more thing\n\n" +
              "FOUNDER_DECISION\n\nShould we double the price of everything? Tell me.",
    }));
    expect(r.ok).toBe(false);
    expect(r.findings.filter((f) => f.rule === "escalation-incomplete").length)
      .toBeGreaterThanOrEqual(5);
  });

  it("catches an already-executed item hidden behind a sub-heading", () => {
    // The worst of the probes: exactly the F10 incident-3 misreporting that
    // `status-misplaced` exists to catch, smuggled past it by a heading.
    const r = lintBrief(goodBrief({
      decide: "Nothing needs your decision today.\n\n#### Note\n\n" +
              "SYSTEM_ACTING — I closed the eleven records this morning.",
    }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "status-misplaced")).toBe(true);
  });

  it("checks escalation content placed above the first status tag", () => {
    // splitByStatus() used to discard everything before the first tag.
    const r = lintBrief(goodBrief({
      decide: "Should we double the price of everything? Tell me.\n\n" +
              "AUTHORIZATION_UNAVAILABLE\n\n**Settled:** x.\n**Why it is not mine:** y.\n" +
              "**What I need:** your approval.",
    }));
    expect(r.ok, "untagged preamble must be checked, not dropped").toBe(false);
    expect(r.findings.some((f) => f.rule === "escalation-incomplete")).toBe(true);
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

  it("warns when more than three separate things want a decision", () => {
    const r = lintBrief(goodBrief({ decide: [complete, complete, complete, complete].join("\n\n") }));
    expect(r.findings.some((f) => f.rule === "escalation-volume")).toBe(true);
  });

  it("does NOT warn on one escalation written to the mandated template", () => {
    // Counting list items scored a single correctly-formatted escalation — one
    // heading plus its five sub-bullets — as five demands on the founder's
    // attention, and then warned about it. Volume is counted in decisions.
    const templated = [
      "1. **The choice: whether to raise the Greek registry price.**",
      "   - **What is established:** 11 paid calls in 30 days at 20 cents; the supplier charges 12.",
      "   - **Options:** hold at 20 cents, or move to 35.",
      "   - **I recommend** moving to 35.",
      "   - **The consequence:** about 15 euros a month forgone if we leave it.",
    ].join("\n");
    const r = lintBrief(goodBrief({ decide: templated }));
    expect(r.findings.some((f) => f.rule === "escalation-volume"), JSON.stringify(r.findings)).toBe(false);
    expect(r.findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("a settled decision with no execution authority is its own status", () => {
  // CHARTER.md § "Three statuses". The third exists because the first two
  // cannot express "I know what should happen and I am not permitted to do it",
  // and without a name for it that situation has only two places to go: quietly
  // executed anyway, or presented as though the judgement were still open.
  const handover = [
    "AUTHORIZATION_UNAVAILABLE",
    "",
    "**Settled:** the eleven unfinished records should be closed and the one euro refunded.",
    "**Why it is not mine:** closing records and issuing refunds are reserved to you, and I hold read-only access.",
    "**What I need:** your approval, and I will make the change.",
  ].join("\n");

  it("accepts a handover without demanding the five judgement fields", () => {
    const r = lintBrief(goodBrief({ decide: handover }));
    expect(r.findings.filter((f) => f.severity === "error"), JSON.stringify(r.findings)).toEqual([]);
    expect(r.findings.some((f) => f.rule === "escalation-incomplete"),
      "a settled matter must not be forced into a decision shape").toBe(false);
  });

  for (const [field, label] of [
    ["settled", "**Settled:**"],
    ["why it is not mine", "**Why it is not mine:**"],
    ["what i need", "**What I need:**"],
  ] as const) {
    it(`rejects a handover missing "${field}"`, () => {
      const r = lintBrief(goodBrief({
        decide: handover.split("\n").filter((l) => !l.startsWith(label)).join("\n"),
      }));
      expect(r.ok).toBe(false);
      expect(r.findings.some((f) => f.rule === "handover-incomplete")).toBe(true);
    });
  }

  it("rejects a handover that asks the founder to run the operation", () => {
    // A real brief closed with "do it yourself, or tell me and I will". The ask
    // is for authority, never for labour — he grants permission, he is not the
    // operator, and a handover that inverts that has mistaken a permission
    // problem for a staffing one.
    for (const ask of [
      "**What I need:** do it yourself, or tell me and I will.",
      "**What I need:** you will need to run the script.",
      "**What I need:** please run the migration when you get a moment.",
    ]) {
      const r = lintBrief(goodBrief({
        decide: handover.replace(/\*\*What I need:\*\*.*$/m, ask),
      }));
      expect(r.ok, ask).toBe(false);
      expect(r.findings.some((f) => f.rule === "handover-asks-for-labour"), ask).toBe(true);
    }
  });

  it("accepts a handover that asks for approval or authority", () => {
    for (const ask of [
      "**What I need:** your approval, and I will run it.",
      "**What I need:** the authority to make this change.",
    ]) {
      const r = lintBrief(goodBrief({
        decide: handover.replace(/\*\*What I need:\*\*.*$/m, ask),
      }));
      expect(r.findings.filter((f) => f.severity === "error"), ask).toEqual([]);
    }
  });

  it("warns when a handover is dressed up as an open choice", () => {
    // Presenting a settled matter with options invites a re-decision nobody
    // asked for — half of how the approval-boundary failure happened.
    const r = lintBrief(goodBrief({
      decide: `${handover}\n**Options:** close them, or leave them open.`,
    }));
    expect(r.findings.some((f) => f.rule === "handover-as-decision")).toBe(true);
  });

  it("still checks the handover when the section also says nothing needs deciding", () => {
    // The two facts are independent: there may be no judgement outstanding AND
    // something settled that I cannot execute.
    const r = lintBrief(goodBrief({
      decide: `Nothing needs your decision today.\n\nAUTHORIZATION_UNAVAILABLE\n\n**Settled:** the records should be closed.`,
    }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "handover-incomplete")).toBe(true);
  });

  it("rejects an already-executed item presented as if it were asked about", () => {
    const r = lintBrief(goodBrief({
      decide: "SYSTEM_ACTING\n\n**Settled:** I put the service back on the shelf.\n" +
              "**Why it is not mine:** n/a.\n**What I need:** nothing.",
    }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "status-misplaced")).toBe(true);
  });

  it("treats an untagged section as a founder decision, as before", () => {
    // The tags refine the contract; they must not retroactively fail a brief
    // written to the earlier one.
    const r = lintBrief(goodBrief({ decide: complete }));
    expect(r.findings.filter((f) => f.severity === "error"), JSON.stringify(r.findings)).toEqual([]);
  });

  it("checks each tagged block on its own terms when both appear", () => {
    const r = lintBrief(goodBrief({ decide: `FOUNDER_DECISION\n${complete}\n\n${handover}` }));
    expect(r.findings.filter((f) => f.severity === "error"), JSON.stringify(r.findings)).toEqual([]);
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
