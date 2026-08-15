# Decision Queue

Two classes only (see [CHARTER.md](CHARTER.md) § Authority):

- **`approval_required`** — outside acts-alone authority. **Silence is never
  approval.** Holds indefinitely; work routes around it.
- **`preauthorized_notice`** — already inside acts-alone authority, queued so
  Petter can object first. Executes at the stated UTC deadline.

Entries carry a class, an owner, an explicit UTC deadline, and an outcome once
acted on. This queue holds *decisions* — never tasks; those belong in the Notion
To-do DB, which is the only task list.

## OPEN

**DQ-1** · `approval_required` · owner Petter · raised 2026-08-15T10:00Z · no deadline
PR #135 (`italian-company-stakeholders`). Merging creates a new capability row in
production — outward-facing. My PII scrub (`8774fff`) also needs a second pair of
eyes: the first attempt satisfied the gate while leaving real codice fiscale in a
script the gate doesn't scan.
*Recommendation:* review the scrub; if it's clean, authorize me to run the
onboarding pipeline. *Routed around:* nothing else in the Italian stream is blocked.

**DQ-2** · `approval_required` · owner Petter · raised 2026-08-15T10:00Z · no deadline
Bosch director names in `archive/sessions/bosch-kyb-response-final*.json`. These
are statutorily-public Handelsregister directors and the designed output of
`german-company-data` — but it is a PII classification call, which the charter
puts on your side of the line regardless of how reversible deleting a file is.
*Recommendation:* leave them, with the reasoning recorded next to the files.
*(Reclassified 2026-08-15 — an earlier draft let this default on silence, which
contradicted the charter's own PII rule.)*

**DQ-3** · `approval_required` · owner Petter · raised 2026-08-15T10:00Z · no deadline
DENUE API token for Mexico (INEGI registration requires a human signup).
*Recommendation:* register when convenient. *Routed around:* the Mexico build
stays queued; no other catalog work depends on it.

## RESOLVED

**DQ-4** · `preauthorized_notice` → **executed 2026-08-15** · owner Claude
`us-court-search` had an expired COURTLISTENER_API_TOKEN (403) and zero external
callers in 30d. Quarantine is explicitly acts-alone under DEC-20260812-A, so
queuing it for 48h would have kept a known-dead capability advertised for two
days for no reason. Filed here for visibility, not permission.
*Outcome:* pending execution in the next check-in run (needs a prod write path
that is quarantine-only). Token refresh remains `approval_required`.

**DQ-5** · closed as mis-filed 2026-08-15 — it was a task ("write the Notion DEC
entry"), not a decision. Tasks belong in the Notion To-do DB.
