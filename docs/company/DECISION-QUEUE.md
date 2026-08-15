# Decision Queue

Gated items wait here with a recommendation and a default — they do not block
work streams. **Reversible: proceeds on the default after 48h of silence.
Irreversible: holds, and work routes around it.** Processed at every check-in.

Format: `id · raised · type · question · recommendation · default on silence · matures`

## OPEN

- **DQ-1** · 2026-08-15 · irreversible-ish · PR #135 (italian-company-stakeholders):
  PII scrub `8774fff` needs review, and merging requires creating a new
  capability row in production. · Recommend: review scrub, then I run the
  onboarding pipeline. · Default: HOLD (new prod capability = outward-facing).
- **DQ-2** · 2026-08-15 · reversible · Bosch director names in
  `archive/sessions/bosch-kyb-response-final*.json`: statutorily-public
  Handelsregister data, the designed output of german-company-data. ·
  Recommend: leave, note reasoning in the archive dir. · Default: leave +
  note. · Matures 2026-08-17.
- **DQ-3** · 2026-08-15 · external · DENUE token for Mexico (INEGI registration;
  founder-only signup). · Recommend: do when convenient; Mexico build is
  queued behind it. · Default: none possible.
- **DQ-4** · 2026-08-15 · reversible · `us-court-search`: expired
  COURTLISTENER_API_TOKEN (403), zero external callers 30d. · Recommend:
  quarantine until a fresh token exists rather than advertise a dead
  capability. · Default: quarantine (reversible, acts-alone). · Matures
  2026-08-17.
- **DQ-5** · 2026-08-15 · process · Notion Decisions DB entry for
  DEC-20260815-A (this charter) + Journal entry for 2026-08-15. · Owner:
  chief of staff, next check-in. · Not Petter-gated; listed for visibility.

## RESOLVED

- (none yet)
