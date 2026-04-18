# Strale Code Review — Finding Template

Every session writes findings into a file named `REVIEW_FINDINGS_<session>.md` at the repo root. Use this exact structure so findings are comparable across sessions.

---

## 1. Architecture summary

One paragraph describing what this subsystem does and how it fits into Strale. One diagram (ASCII or mermaid) showing the main components and data flow. This exists so the reader can sanity-check that the reviewer actually understood the system before trusting the findings.

## 2. Assumptions made

Bullet list of anything the reviewer assumed rather than verified. If something was unclear in the code, it goes here, not in findings.

## 3. Findings

Each finding follows this block:

```
### F-<session>-<nnn>: <short title>

- **Category**: Bug | Safety | Resilience | Autonomy | Resource efficiency | Test coverage
- **Severity**: Critical | High | Medium | Low
- **Confidence**: High | Medium | Low
- **Location**: `path/to/file.py:L123-L145` (list all relevant locations)
- **What's wrong**: 2–5 sentences. Concrete, not abstract. Reference the code.
- **Why it matters**: What breaks, for whom, under what conditions.
- **Reproduction / evidence**: How to see the problem. A failing input, a log pattern, a specific call path. If you can't reproduce, say so and lower confidence.
- **Suggested direction**: Brief. Do not write a diff. Just the shape of the fix.
- **Related findings**: IDs of other findings this connects to, if any.
```

**Severity definitions** (use these, don't invent new ones):

- **Critical** — active security hole, data loss risk, or silent correctness failure in a production path.
- **High** — reliability or correctness issue that will bite under normal load or a common failure mode.
- **Medium** — real problem but bounded impact, or only triggers under unusual conditions.
- **Low** — code smell, minor inefficiency, style inconsistency.

**Confidence definitions**:

- **High** — verified by reading the code end-to-end, or reproduced.
- **Medium** — strong pattern match but not traced every call site.
- **Low** — suspicious, worth investigating, but could be intentional.

## 4. Patterns

Anything that showed up 3+ times across the codebase in this session. Pattern-level findings are often more valuable than individual ones.

## 5. What I did not review

Be explicit about what was out of scope or skipped due to time/complexity. A reviewer who claims to have read everything is not to be trusted.

## 6. Questions for Petter

Anything where intent is unclear and a human decision is needed before fixes can be prioritized.
