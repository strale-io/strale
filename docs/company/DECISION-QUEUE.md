# Decision Queue

Two kinds of entry (see [CHARTER.md](CHARTER.md) § Authority):

- **`approval_required`** — outside what I may do alone. **Saying nothing is
  never a yes.** It waits as long as it needs to; I work around it.
- **`preauthorized_notice`** — already something I may do alone, listed here so
  you get the chance to object first. Goes ahead at the stated time.

Each entry's first line is written in plain English, because that line is what
appears on your dashboard. Decisions only — tasks belong in the Notion To-do DB.

## OPEN

**DQ-1** · `approval_required` · owner Petter · raised 2026-08-15T10:00Z · no deadline
Can I switch on the new Italian company-lookup service? It would be our first
new data service since we started this way of working.
*Detail:* PR #135. Turning it on creates a live service customers can buy, which
is your call. My earlier privacy clean-up on it (`8774fff`) also wants a second
look — the first attempt passed the automatic check but left real personal ID
numbers in a file the check doesn't read.
*My recommendation:* look over the clean-up; if it's clean, let me switch it on.
*Meanwhile:* nothing else Italian is held up.

**DQ-2** · `approval_required` · owner Petter · raised 2026-08-15T10:00Z · no deadline
Some real people's names are sitting in an old test file. Fine to leave them, or
delete?
*Detail:* Company director names in `archive/sessions/bosch-kyb-response-final*.json`.
They come from the German public company register and are exactly what our German
lookup service is designed to return — so they aren't a leak. But it is a
judgement about personal data, which the charter keeps on your side of the line
however easy it would be to undo.
*My recommendation:* leave them, with a note next to the files explaining why.

**DQ-3** · `approval_required` · owner Petter · raised 2026-08-15T10:00Z · no deadline
Mexico needs an access key that only a human can sign up for. Would you register?
*Detail:* The Mexican business register (INEGI) issues tokens through a signup
form. I don't create accounts.
*Meanwhile:* the Mexico build waits; nothing else depends on it.

## RESOLVED

**DQ-4** · `preauthorized_notice` · owner Claude · 2026-08-15
Switched off our US court-records lookup, because its access key expired and it
was returning errors. No customer had used it in a month. Pausing a broken
service is something I may do without asking; this is a note, not a request.
Getting a fresh key is your call if we want it back.

**DQ-5** · closed 2026-08-15 — filed here by mistake. It was a task ("write up
the new working agreement in Notion"), not a decision. Tasks live in the Notion
To-do DB.
