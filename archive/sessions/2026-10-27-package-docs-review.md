# Package Docs independent review

Scope: `feat/package-docs` changes against `f9c98049`, including the executor,
manifest, recorded fixtures, vendor terms, streaming limit and free probes.
Both reviewers read `REVIEW.md` and worked in separate, read-only contexts.

Technical pass, round 1: no high findings; one medium finding about attributing
a package-level README using an older selected release's licence and authorship.
Product/API pass, round 1: the same attribution finding, malformed registry
responses exposing parser diagnostics, and a test that did not discriminate
the ten-version suggestion limit.

Fixes: keep selected-release licence in top-level metadata; use current registry
metadata and an unversioned package URL for packument README attribution, with
explicit uncertainty about its version and licence. Normalise malformed JSON
and missing metadata to source faults. Add differing-licence, malformed-body,
and 25-version suggestion-limit regression cases.

Round 2 technical verdict: GO, no remaining high or medium findings.
Round 2 product/API verdict: GO, no remaining high or medium findings.
These are working-diff reviews; the orchestrator retains exact-commit review,
push, PR and merge. Manual simplification found no useful additional abstraction;
the session did not have a callable simplify skill.

Production onboarding/readiness is deliberately deferred because this build
session has no database or production write authority. This is build evidence,
not a production readiness claim.

The final narrow review also accepted a shared npm; PyPI vendor declaration in
both manifest and executor, with the exact registry endpoint retained in source.
Both paths have a real-manifest provenance-stamping regression. The full-suite
existing-manifest vendor-declaration failure is reported in the handoff; a GO
code-review verdict does not waive that failing gate or imply readiness.

## Independent NO-GO and Round 2 repair

The orchestrator's independent review superseded the working-diff GO above.
It found contact-detail disclosure, metadata edge cases, imprecise PyPI terms
wording and stale receipt references. The Round 2 repair and verification are
recorded in handoff/_general/from-code/2026-10-27-package-docs.md and the receipt
it cites. In particular, the earlier acceptance of a combined per-call vendor
is superseded: calls now name their actual registry, with conservative pending
checks after provenance stamping. The orchestrator retains confirmation review;
this appended repair record is not an independent GO or production readiness.
