# Actionable error messages — independent review

Scope: candidate working diff on `feat/actionable-error-messages`, based on
`79d64589`. The candidate could not be committed because the session's Git
metadata is read-only. These verdicts review the working diff, not an exact
candidate commit. The orchestrator must pin the reviewed result when committing.

Both reviewers read `REVIEW.md`. Two independent read-only contexts ran the
technical and product/UX reviews required by the `go` skill. Each completed two
rounds. Both final verdicts were **GO**, with no remaining high or medium
findings. The technical reviewer also ran the focused actionable-error suite.

The author corrected the first-round findings before the second reads:

- Raw `/v1/do` refusals and both legacy payment challenges now include fixes.
- PDF guidance distinguishes the `url` and `base64` fields.
- Required fields are derived from actual missing/required fields; optional
  fields are not inferred as mandatory.
- x402 preserves `anyOf`/`oneOf` alternatives and names the validation failure.
- Audit-token errors name signed URL parameters and token reissue, rather than
  promising that an API key satisfies the token-only audit endpoint.
- Freshness refusals explain how to change `require_fresh`.
- Remaining local date, CSV and email-authentication validation errors in the
  selected executors use the shared helper and have concrete regression cases.

No `simplify` skill is installed in this session. The author inspected the
changed code for duplication and kept recovery policy in the shared error
factory, explicit validation guidance at its refusal sites, and native refusal
metadata at boundaries where string conversion would otherwise discard it.

The explicit build-agent instructions override the `go` skill's push/PR/merge
steps. No package was published and no production write was attempted. No review
backlog entry was created or closed.
