---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Distribution PR Integrity Protocol (DEC-20260422-A)"
---

# Distribution PR Integrity Protocol (DEC-20260422-A)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 6b). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Distribution PR Integrity Protocol (DEC-20260422-A)

**MANDATORY — applies to ANY session that touches a PR on a repo outside `strale-io/*` OR that publishes / modifies a `*-strale` package.**

**Trigger:** the session prompt mentions a PR on a framework repo (Pipedream, LangFlow, Flowise, pydantic-ai, langchain, crewAI, agno, composio, semantic-kernel, awesome-list, etc.), OR modifies files under `packages/*-strale/`, OR edits PyPI/npm publication metadata.

**Background:** on 2026-04-21 the pydantic-ai maintainer DouweM closed `pydantic/pydantic-ai#4866` with "Shame on you" after finding that the published `pydantic-ai-strale` package contained zero pydantic-ai-specific code. An audit found two more packages with the same gap (`google-adk-strale`, `openai-agents-strale`). A prior agent session (2026-04-18) had edited the PR to trim promotional prose but did not verify the code example's imports. See `archive/sessions/CONTAINMENT_REPORT.md` for the full incident.

**Required steps (non-negotiable):**

1. **Verify every imported symbol before touching a distribution PR.** Before editing the PR body, inline comments, code examples, or any description-style text on a repo outside `strale-io/*`, fetch the referenced Strale package's `__init__.py` / entry point via `gh api repos/strale-io/strale/contents/packages/<pkg>/...` and grep for every symbol the PR imports. If any symbol is not in `__all__` or not exported, **STOP** and flag for Petter. Do not trim prose, do not fix bot findings, do not rebase, do not reply — nothing — while the PR contains a fabricated import.

2. **Run the distribution PR pre-flight checklist.** See `docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md`. The four verifications (imports resolve, package on approved list, description matches code, tone matches neighbors) are the standard. All four must pass before the session opens or edits a distribution PR.

3. **Run the framework-package integrity check locally before shipping a new or modified `*-strale` package:**
   ```
   node apps/api/scripts/check-framework-packages.mjs
   ```
   If the check fails, the package does not match its name. Either make the package live up to the name, rename it, or deprecate — do not publish.

4. **Never batch-create framework packages.** One framework package per PR, each including (a) real framework-interface code importing from the framework, (b) at least one test exercising the framework's own primitives, (c) README content that only references what's in the module.

5. **Polishing is not a substitute for verification.** A cleaner-looking PR containing a fabricated import is worse than the original. If a bot finding points at prose but the code example has an import problem underneath, fix the import first and the prose second, or stop and flag.

6. **Run the production contract smoke test after every publish.** Install the
   published artefact the way a stranger would (`npx -y <pkg>@<version>`), run it
   against production, and record the observed startup values -- not "looks fine".
   Look specifically for errors the program logs and then continues from: a caught,
   logged, non-fatal degradation is what CI cannot see and users never report.
   CI tests source against doubles; it never runs the published artefact against
   production, and that gap is where this class of defect lives. On 2026-08-22 this
   check found `strale-mcp` had shipped `0 cap trust, 0 sol trust` for ~3.5 months
   (routes deleted in May; the admin wall on their prefix answered 401 instead of
   404; the client logged to invisible stderr and carried on). Procedure and the
   per-package contract: `docs/release/npm-publishing.md`.

**At session end, report:**
- Every distribution PR touched, with the verification result for each.
- Every package published, with the observed production smoke-test values.
- Every `*-strale` package modified, with the check-framework-packages output.
- Anything that couldn't be verified and why.

**Do NOT mark a distribution task as done if the pre-flight checklist didn't pass.** Report what's missing.

**This rule does NOT override:**
- The Capability Onboarding Protocol (DEC-20260320-B).
- Any PR-closure or code-change authorization that requires explicit Petter approval.
<!-- END VERBATIM FROM CLAUDE.md -->
