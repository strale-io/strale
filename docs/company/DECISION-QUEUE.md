# Decision Queue

Two kinds of entry (see [CHARTER.md](CHARTER.md) § Authority, raised 2026-08-15):

- **`your_call`** — genuinely needs Petter: money beyond the weekly limit,
  anything that legally binds the company, one-way public acts, pricing outside
  the existing band. **Saying nothing is never a yes.**
- **`decided`** — I made the call and did it. Listed so it is visible and can be
  reversed, not so it can be approved.

Technical questions never appear here. Each entry's first line is plain English,
because that line is what shows on the dashboard; the `*Label:*` fields below it
fill the expanded panel.

## OPEN

**DQ-3** · `your_call` · owner Petter · raised 2026-08-15T10:00Z · no deadline
Mexico needs an access key that only a person can sign up for. Would you register?
*What this is:* The Mexican business register (INEGI) hands out access keys through
a signup form. Creating accounts is one of the few things I don't do — the account
would be in your company's name and I shouldn't enter into that on your behalf.
*What I need:* Ten minutes on the INEGI site, then drop the key into the
environment settings. I'll do the rest.
*If you do nothing:* Mexican company lookups stay off the menu. Nothing else is
affected — no other work depends on this.
*Worth it?* Mexico is a large market but no customer has asked for it yet. Low
urgency. I'd do it when you happen to have a spare ten minutes, not before.

**DQ-6** · `your_call` · owner Petter · raised 2026-08-16T07:00Z · no deadline
A supplier contract has been sitting unsigned since May, and it is holding ten
European country lookups off the shelf.
*What this is:* We buy company data for a batch of European countries from one
supplier, Openapi. They sent a resale addendum in May (their case 151296) that
needs your countersignature before we are allowed to serve their data to
customers. Until it is signed, the code refuses every call by design — Italy,
Austria, Bulgaria, Cyprus, Romania, Portugal, Netherlands, Hungary, Luxembourg
and Malta all sit dark.
*What was blocking it:* the addendum was waiting on a VAT confirmation from
Skatteverket for Moonlighter AB. Three months on, I don't know whether that
came back — that's the part only you can check.
*Why it is yours:* signing a supplier agreement legally binds the company. I
don't sign things on your behalf, and I don't contact vendors as the company.
*If you do nothing:* those ten countries stay unavailable indefinitely. Nothing
breaks — customers simply cannot buy them, and we keep building around the gap.
*Worth it?* It is the single largest blocked chunk of catalogue we have, and the
work is already built and paid for. Against that: no customer has asked for
these countries yet, so it is worth an hour, not a week.
*Related:* I closed a three-month-old code change today (PR #135, Italian
directors) that was waiting on this same signature. Nothing lost — it comes back
when the addendum does.

## DECIDED — visible so you can reverse them

**DQ-1** · `decided` · owner Claude · 2026-08-15
Taking the Italian company-lookup service to completion myself.
*What this is:* A service that looks up who owns and runs an Italian company.
It was built but never switched on, partly because I'd flagged the decision to you.
*Why it is mine:* Under the raised bar, switching a service on or off is my call —
it is reversible in one step, costs nothing new, and the judgement involved is
technical.
*What I will do:* Re-check the privacy clean-up (an earlier pass left real personal
ID numbers in a file the automatic check doesn't read), get it verified, then switch
it on and tell you it's live.
*How you'd reverse it:* Tell me to switch it off. It takes a minute.

**DQ-2** · `decided` · owner Claude · 2026-08-15
Leaving the company-director names in the old test file, with a note explaining why.
*What this is:* Names of company directors sitting in an archived test file.
*Why it is fine:* They come from the German public company register, where they are
published by law, and returning exactly this information is the whole purpose of our
German lookup service. Deleting them would suggest we think publishing them is a
problem, which would be odd while we sell them.
*Why I decided it:* I flagged it to you as a privacy judgement, but it isn't a legal
question — it's a question about whether our own product output is acceptable in our
own files, and the answer is plainly yes.
*How you'd reverse it:* Say the word and I'll delete the file.

**DQ-4** · `decided` · owner Claude · 2026-08-15
Switched off the US court-records lookup — its access key had expired and it was
returning errors to anyone who tried it. No customer had used it in a month.
*How you'd reverse it:* Get a fresh key from CourtListener and I'll switch it back on.

**DQ-5** · closed 2026-08-15 — filed here by mistake. It was a task, not a decision.

**DQ-7** · `decided` · owner Claude · 2026-08-16
Built the missing machinery that puts a service back on the shelf once it has
proved itself, and left it switched off until I have watched it for a day.
*What this is:* We had automation that takes a service off the menu when it
starts failing, and nothing that ever puts one back. So anything taken down, or
launched quietly for testing, stayed invisible forever. Five services launched
this week are in exactly that position.
*Why it is mine:* switching services on and off is my call under the charter.
*What I did:* wrote the counterpart automation, had it reviewed by the other AI
provider, and shipped it in "watch only" mode — it records what it would do
without doing it. I will read a day of that record and then switch it on.
*The thing it found:* it would have put three services back that our own tests
score at 100% but that real paying customers fail 39–59% of the time. It now
refuses to overrule a takedown. That gap between our tests and reality is the
real problem and it is the top item for the next session.
*How you'd reverse it:* tell me to leave it in watch-only mode permanently, or
to delete it.

**DQ-8** · `decided` · owner Claude · 2026-08-16
Cleared out ten dead code branches, keeping everything of value.
*What this is:* 96 abandoned branches had accumulated. I went through the ten
oldest: four were already merged or deliberately abandoned and were deleted;
five held research notes that existed nowhere else, so I published the notes to
the main line first and then deleted the branches; one holds real unfinished
work and stays. Every deleted branch's identifier is recorded so nothing is
unrecoverable.
*How you'd reverse it:* any deleted branch can be restored from the identifiers
in today's handoff.
