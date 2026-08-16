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

**DQ-10** · `decided` · owner Claude · 2026-08-16 — **a correction, not a reversal**
The "one paying customer" figure in DQ-3 below is not measured, and should not
be carried into other decisions.
*What happened:* DQ-3 states we have one paying customer spending ~€35/week, and
uses it as part of the case for parking Mexico. I re-measured across every
payer-identifying column in the database. Over 90 days: **97% of revenue (€244 of
€253, 3,291 calls) has no payer identity recorded at all**, because the
instrument that records it only switched on 2026-08-15. The "one customer" is the
single wallet visible in the one day since — the age of the measurement, not the
size of the customer base. GOALS.md warns against precisely this reading before
~2026-08-22.
*What is actually known:* at least five distinct buyers over 90 days — four
account holders and at least one crypto wallet. The population behind the €244
is unmeasured. Each of those 3,291 calls carries its own payment reference, so
counting payments cannot count people.
*Why this is not a reversal:* DQ-3's other grounds stand on their own — nobody
has asked for Mexico in 180 days, and all 17 company-data capabilities earned
€2.15 from external customers in 90 days. Parking the build is still right. Only
the premise is wrong, and only that.
*How you'd reverse it:* nothing to reverse — this is a note on the record.
Per the workflow invariants I have not edited DQ-3 itself.

**DQ-3** · `decided` · owner Claude · 2026-08-16 — **diagnosed, and parked on the evidence**
The token works. I sent Petter to the wrong registration, and separately the
build is not worth doing.

*What happened:* The DENUE documentation links its own registration behind a
link I could not retrieve, so I substituted a generic INEGI developer token page.
That page issues tokens for the **Indicadores** API — statistics, not the
business directory. Petter's token is entirely valid: it returns HTTP 200 and
real data from Indicadores (Mexico's 2020 population, 126,014,024). It returns a
malformed `HTTP/1.1 000` from DENUE because DENUE is a different service needing
its own token. My earlier advice — check for an activation link, verify the
characters — would never have found this, because nothing was wrong with the
token.

*Why we are not simply registering again:* the evidence says do not build it.
Zero requests mentioning Mexico in 180 days. We already run 17 company-data
capabilities and they earned **€2.15 from external customers over 90 days**,
while our one paying customer — who spends ~€35/week — has never made a single
company-data call. Mexico would not be the eighteenth capability in a growing
line; it would be the eighteenth in a line that does not sell.

*What replaces it:* the x402 unmet-demand capture shipped 2026-08-15 records
every paying agent that asks for a slug we do not have. If anyone asks for
Mexican company data, it lands in `failed_requests` tagged `x402_unknown_slug`
and this decision reverses itself on evidence rather than on a spare token.

*If it is ever revived*, the DENUE method shapes are established and the build is
about half an hour:
- base `https://www.inegi.org.mx/app/api/denue/v1/consulta/`
- by name: `Nombre/{name}/{entity}/{start}/{end}/{token}` — entity `00` nationwide
- by id: `Ficha/{id}/{token}` · nearby: `Buscar/{term}/{lat},{lon}/{metres}/{token}`
- token is always the final path segment; a DENUE-specific token is required

*Footnote worth keeping:* the Indicadores token is live and unused. Mexican
statistical indicators are a different product from a company registry, and
nobody has asked for those either — so it stays unused unless demand appears.

## DECIDED — visible so you can reverse them

**DQ-9** · `answered` · owner Petter · asked 2026-08-16, answered same day
Do we describe Strale as an SEO/growth layer for agents and stop investing in
compliance? **Petter: no.**
*What that settles:* we keep describing Strale as we do today, and the compliance
and company-data track keeps its investment. The evidence behind the question is
unchanged and still on file — it just does not carry the day.
*What happens anyway, because it was never part of the question:* I build the
five growth bundles. Bundle design and pricing inside the existing €0.02–€1.00
band is my call, they are composed entirely from capabilities we already run, and
they are the highest-return work available. Building them does not re-point the
company; it sells more of what is already selling.
*The consequence, stated plainly:* we now run two tracks — a compliance catalogue
that earns ~€2 per quarter externally, and a growth cluster that earns ~€129 a
month and is accelerating. That is a real cost in attention, and the €230/week
milestone does not move. I am not re-raising it; I am recording it so the next
person to read the revenue numbers knows the question was asked and answered
rather than overlooked.
*Evidence, for the record:* https://claude.ai/code/artifact/80499816-1719-4584-97ee-a70a88d50e59


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
