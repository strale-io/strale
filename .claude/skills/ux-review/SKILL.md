---
name: ux-review
description: Review changed code from a non-technical-founder perspective — error messages, API ergonomics, naming, defaults, failure modes. Use when the user wants a UX/PM/founder lens on a diff. Complements (does not replace) the technical reviewer used by /go and /security-review.
---

# /ux-review — founder / UX / product lens

Strale's reviewers (the `feature-dev:code-reviewer` subagent, the security-review skill, the cloud-managed `/ultrareview`) all apply technical lenses: bugs, security, architecture, conventions. None of them apply a non-technical-founder lens — "is this code *kind* to its user." This skill fills that gap.

Petter is non-technical and depends on this lens being explicit, because *he can't catch friction in the code by reading it himself*. Run this skill when:

- A new public surface is being added (API endpoint, capability, SDK method, dashboard view)
- An error path is being changed
- A field is being renamed or removed on a versioned interface
- A capability's input schema is being designed
- The user says "/ux-review" or asks for a UX/founder/product review of the current branch

## How to invoke

Spawn `feature-dev:code-reviewer` (or `general-purpose` if code-reviewer is unavailable) with the prompt below. Pass it: the branch name, the target main, a one-paragraph summary of intent, and any specific surfaces it should focus on.

```
You are reviewing PR / branch <branch> against main with a NON-TECHNICAL FOUNDER lens, not a technical lens. The goal is to catch friction the developer didn't notice — code that works correctly but is hostile or confusing to its caller (an external developer, an AI agent, or Petter himself debugging via the dashboard).

Read the diff. For each user-visible surface that changed, evaluate:

1. ERROR MESSAGES
   - Does the message tell the caller WHAT to fix? ("Missing field: email" yes; "Invalid request" no.)
   - Does it leak internals (stack traces, DB names, file paths, internal slugs)?
   - Does it suggest a next action when there is one ("get a key at /signup", "wrap inside inputs:")?
   - Is it phrased for the developer-caller, or for an internal Strale engineer?

2. API SHAPE / NAMING
   - Money fields end in `_cents` (Strale wire-shape rule). Dates are ISO 8601. Lists of slugs.
   - Field names match Strale conventions used elsewhere (look at neighbouring endpoints).
   - Slugs and route names use the words an external developer would search for, not Strale-internal abbreviations.
   - If a field replaces an old one on a versioned endpoint, the old name is preserved as `*_formatted` or aliased — never silently dropped.

3. DEFAULTS
   - Are required fields actually required, or could a sensible default be inferred?
   - Are optional fields documented with the default that applies?
   - Does the caller have to specify boilerplate that Strale could pick correctly itself?

4. FAILURE MODES FROM THE CALLER'S PERSPECTIVE
   - On failure, can the caller tell whether to: retry, fix input, contact support, or give up?
   - Are HTTP status codes used correctly (400 vs 422 vs 500)?
   - Are partial failures surfaced (e.g. one cap in a solution failed but rest succeeded) or hidden?
   - Is there a `details` field with structured info, or just a string?

5. DOCUMENTATION GAP
   - Does this change affect a public surface that's documented in `strale-frontend/public/llms.txt`, the SDK README, or the API docs?
   - If yes, is the documentation update part of the PR? If not, the PR body should flag the cross-repo update needed.

6. NAMING THAT WOULD CONFUSE PETTER
   - If Petter (non-technical, will use this via the dashboard or curl) sees this in a log line, an error, or the catalog page tomorrow morning — will he understand it?
   - Acronyms, internal codes, and DEC-* references should be explained or hyperlinked, not assumed.

Report under 600 words. For each finding, include: file:line, what's wrong from a UX standpoint, what to do (concrete suggested wording or shape — don't just complain). Classify each as HIGH (ship-blocker — would harm a real user), MEDIUM (worth a fix before merge), or LOW (nit, drop if you weren't going to act on it).

If the diff is fully clean from a UX standpoint, say so plainly. Clean is a valid outcome.

End with a one-line verdict: SAFE TO MERGE / FIX BEFORE MERGE / NEEDS DISCUSSION.
```

## What this skill does NOT cover

- Bugs, logic errors, security holes — those are the `feature-dev:code-reviewer` job, run from `/go` or `/security-review`.
- Visual design / CSS / page layout — that's a frontend-design concern, runs in the `strale-frontend` repo.
- Whether the feature is the right thing to build at all — that's a strategy conversation, not a review.

## When to act on findings

- HIGH → block the PR. The technical lens may say "ships fine" but a HIGH UX finding means a real user will hit pain. Surface it, get Petter's call, fix or defer with explicit acknowledgement.
- MEDIUM → include in the PR body under `## UX-review findings` so Petter sees them at merge time. A reasonable fraction may be deferred to follow-up tickets, but they should be visible.
- LOW → mention only if part of a pattern (e.g. five inconsistent field names — fix the pattern in one pass, not each individually).

## Why this exists

Cert-audit 2026-04-30 found that `fallback_price` was emitted as `"€0.02"` (formatted string) on the trust endpoints instead of `_cents` (integer). The technical reviewer missed it because the code was correct. A founder/UX lens would have caught it — "Petter is going to look at this in a log and a frontend, and the frontend can't math on a string." That's the gap this skill closes.
