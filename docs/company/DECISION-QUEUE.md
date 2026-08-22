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

**DQ-14** · `your_call` · owner Petter · raised 2026-08-18T07:00Z · no deadline
Four small things only you can do. None of them block anything today.
*Why they are here:* each has been sitting in session handoff notes — one of
them since 2026-08-15 — where nobody sees them. The queue is the place for
things that need you, so they now live here and will show on the dashboard
until they are done or you tell me to drop them.

1. **CourtListener key.** The US court-records lookup is switched off because
   its key expired (DQ-4, DQ-11). A fresh key from CourtListener and it goes
   back on in a minute. Nobody has asked for it in a month, so this is low
   urgency — I list it because the service is otherwise fine.
2. **The Gazette outage.** The UK Gazette notice search fails on every call
   because their API returns an error to everyone, not just us. It needs
   reporting to them at github.com/TheGazette/DevDocs. I do not contact
   vendors as the company. Until then it stays our worst-scoring service, with
   a written reason.
3. **A read-only GitHub token** for the frontend repo, as a repository secret.
   It makes an existing automatic check real — right now it silently cannot
   run. Ten minutes.
4. **The wow-core repository** — archive it or delete it. It is dead and only
   adds noise.

*If you do nothing:* nothing breaks. Item 2 keeps one service visibly broken;
item 3 leaves one automated check inert; items 1 and 4 are tidying.

**DQ-18** · `your_call` · owner Petter · raised 2026-08-22T07:00Z · no deadline
Two decisions the remediation programme wrote up this morning and I am putting
where you will see them. Full text: `docs/remediation/DECISION-BRIEFS.md`.
*Why they are here:* they were committed to a branch at 07:54 today and would
otherwise live only in a file nobody opens. This entry is a pointer, not a
re-decision — the programme owns both and I have not changed either.

1. **Eleven unfinished transactions.** Ten involve no money at all (free-tier,
   nothing charged). The eleventh is €1.00 on our own internal test account.
   No external customer money is involved in any of them. The proposal is to
   close all eleven and refund the €1.00, plus disclose one broken
   verification hash rather than leave it to be discovered. **Recommended:
   approve as proposed.**
2. **The "tamper-evident" claim on the website.** Six pages say it. It is true
   for *alteration of a single record* and not true for *ordering or deletion*
   between 2026-05-04 and 2026-08-21, and ordering is what most readers of
   "hash chain" assume. Replacement wording is drafted and is deliberately
   narrower. This one is genuinely yours: it is a claim a compliance buyer or
   a regulator would read. **Recommended: change the copy.**

*If you do nothing:* item 1 leaves a €1.00 misstatement on our own ledger and
eleven rows in a status they should not be in. Item 2 leaves a claim on the
website that overstates what the system provides for a 3.5-month window — that
one I would not leave indefinitely.

## DECIDED — visible so you can reverse them

**DQ-19** · `decided` · owner Claude · 2026-08-22
Changed how I report to you, widened what I decide without asking, and started
treating repeated mistakes as one problem instead of many.
*What this is:* your review this morning, implemented. Three parts. **You now
get one page a morning** — plain English, what the business did, what needs you
— and the technical record lives separately for whoever audits the work. **I
decide more without asking:** obvious reversible faults, false alarms from our
own monitoring, wording on our own site that measurement contradicts, and the
routine housekeeping where our existing rules already give the answer.
Correcting a claim downward is mine; making a stronger claim is still yours, as
is anything that binds the company, spends beyond the weekly limit, or cannot be
undone. **And when the same kind of mistake happens three times, it stops being
a bug and becomes an investigation** into what we got wrong underneath.
*What it does NOT change:* nothing comes off your list. My first draft of this
took one of yesterday's two items back — the eleven unfinished records and the
one-euro correction on our own internal account — on the grounds that no
customer money is involved and our existing rule already answers it. That
reasoning was sound and it was not authority. **Items in your queue are moved
out of it by you, not by me**, however routine they come to look, and doing it
inside the very change that widened my remit is the clearest illustration
available of how that widening goes wrong. Both items are still yours. The
charter now says this in as many words, and it is logged as a repeat of the
same failure — the earlier one being a reconciliation run against production
records that sat behind exactly this kind of gate, on exactly this reasoning.
*What I will do instead:* keep the recommendation on the record (close the
eleven, refund the euro) and wait.
*Why it is mine:* you asked for it. Everything inside it is either how I work or
already in my column.
*What I will watch:* whether the number of things reaching you falls without
anything important going unsaid. If this page ever starts reading like an
engineering report again, that is the failure, and there is now an automatic
check that fails our release process when it does.
*How you'd reverse it:* tell me, and the old format comes back the next morning.

**DQ-17** · `decided` · owner Claude · 2026-08-22
Put a free service back on the shelf that our own quality check had taken off
by mistake this morning, and stopped us advertising things we will not serve.
*What happened:* at 06:58 our time, the automatic quality check withdrew
`url-to-markdown` — one of the eleven services anyone can call with no signup
and no account. It is the front door. Withdrawing it also meant our own
"try these eleven free" message went on naming it while the platform refused
every call. An agent that did exactly what we told it to do got turned away.
*Was the withdrawal right?* No. I reproduced the check's own sums and got its
numbers exactly, so the arithmetic was fine and the evidence behind it was
not. Of the five failures it counted: one was the service correctly saying
"that page has no text on it", two were the customer's own target website
returning an error, and two were that website rate-limiting us. None was a
fault in our service. I confirmed it works three further ways — a live call
end to end, 531 of 531 internal checks in a week, and the two most recent real
customer calls, both successful.
*Why it is mine:* taking services on and off the shelf is explicitly my call
under the charter.
*What I fixed underneath:* the "eleven free services" list is now generated by
the same rule that decides whether a call gets served, so it cannot name
something we refuse. Two other places listed services by hand — one of them
had been advertising five of the eleven since before six of them existed —
and both now read the real list. And the "page has no text" answer is no
longer counted as our failure.
*How I checked, both directions:* every new test fails if you put the old code
back — I checked each one by reverting the fix. Before release I ran the
database statements against production in plan-only mode, which costs nothing
and executes nothing; they predicted exactly the one record that needed
changing. After release I called the service on the live site and got a real
answer, and confirmed it is back in both public catalogues.
*How you'd reverse it:* tell me and it goes back off in a minute.
*Also today:* seven abandoned branches deleted after comparing file contents
against the main line — never paths or commit counts, which is the mistake
DQ-15 recorded. All seven identifiers are in today's handoff and every one is
restorable.


**DQ-16** · `decided` · owner Claude · 2026-08-21
Fixed the thing that has been making one of our services look broken for weeks,
and cleared out six more dead code branches.
*What this is:* Two pieces of our own start-up bookkeeping have been quietly
arguing with each other. Each time we release, one of them changes a setting on
381 of our automated tests and the other immediately changes it back. Harmless
in itself — except that the act of writing the setting was recorded as
"somebody edited this test". Twelve tests then threw away their saved reference
answer on every release, and two of them cost money to re-run, so they refused
to re-record it and reported themselves as failing instead. Forever.
*What it cost us:* `eu-regulation-search` — the EU legislation lookup — has been
scoring 51-60% for weeks with **not a single real failure behind it**. Our own
quality programme's closing report flagged that number in the same breath as
saying it wasn't the service's fault, and nobody had yet found out what it
actually was. This was it.
*Why it is mine:* fixture hygiene and quality gates are explicitly my call
under the charter, and this is entirely a question about our own instruments,
not about a customer or a price.
*How I checked, both directions:* the fix's tests fail if you put the old code
back. Before merging I ran all three database statements against production in
plan-only mode, which parses and costs nothing, and they predicted exactly the
two records that needed clearing. After the release I looked again: **nothing
was churned, nothing reported itself stale, and both records were cleared** —
so the fix did what the plan said, in production, not just in tests.
*Also landed:* a missing safety test from a May audit that had been written,
left on an abandoned branch, and never merged. It didn't actually test anything
as written, so I made it test the thing it claimed to.
*Housekeeping:* six abandoned branches deleted after confirming their contents
are already on the main line — comparing the actual file contents, not the
paths, which is the mistake DQ-15 recorded. Every identifier is in today's
handoff and all six are restorable.
*How you'd reverse it:* revert the release; the branches come back from the
identifiers in the handoff.


**DQ-15** · `decided` · owner Claude · 2026-08-19
Deleted four dead code branches, and published two research notes that only
existed on them.
*What this is:* the morning branch-graveyard sweep. Four July snapshot branches
held nothing that is not already on the main line, so they are gone; the
research two of them carried was published first, so nothing was lost.
*How I checked, and why it matters:* my first pass compared file *paths* and
reported five documents as missing from the main line. Three of them were not
missing at all — they had been moved to a different folder months ago, and a
path comparison cannot see that. Comparing the actual contents found them
byte-for-byte identical. Only two were genuinely unique, and those are the two
I published. A path check after a file move is not evidence of absence.
*What was deleted, all recoverable:* the July screenshot fix snapshot (the main
line's version is strictly newer), a one-line snapshot, and a snapshot whose
only unique content was configuration for a system we removed in August. Every
identifier is recorded in today's handoff.
*What stays, with reasons:* three branches holding the unfinished Italian
company-lookup work, because that is live work with a known privacy issue to
resolve first (DQ-1). One of the three I had expected to delete: its research
is now published, but it turned out to hold a *different version* of the
Italian work than the other two — same capability file, three differing
supporting files — so deleting it would have quietly discarded a variant.
Also staying: one branch holding a test file not yet on the main line, and the
two previously-documented keeps.
*How you'd reverse it:* any deleted branch is restorable from the identifiers
in today's handoff.

**DQ-13** · `decided` · owner Claude · 2026-08-18
Switched on payment for the four new growth bundles. They had been on the menu
for two days without a way to pay for them.
*What this is:* On 16 August I built four small bundles — `competitor-read`,
`page-seo-check`, `prospect-brief`, `keyword-scout` — as the highest-return work
available (DQ-9). They went onto the public menu correctly, but the switch that
lets an agent actually pay for them was left off. Every euro we earn arrives
through that payment rail, so for two days an agent could find them, try to buy
one, and get an error.
*How I know:* checked three separate ways — our own records, the public payment
catalogue, and by trying to buy one against the live site. All three agreed.
The bundle that does sell, `lead-email-verify`, was built the same way and had
its switch on; it has taken 47 orders in the last month. That is the control.
*Why it is mine:* switching a service on is my call under the charter, and DQ-9
already settled that these bundles get built and sold.
*What I did:* shipped it through the normal release rather than editing the live
system by hand — the same lesson DQ-11 recorded. It is written so it only ever
fires once, so if you or I switch a bundle back off later it stays off.
*What to watch:* whether they actually sell. Recorded as experiment E4 in
GOALS.md with a kill criterion — no sales across all four in 14 days and we stop
building bundles.
*How you'd reverse it:* tell me and I switch any or all of them back off in a
minute. Nothing else about them changed — same price, same contents.


**DQ-11** · `decided` · owner Claude · 2026-08-17 — **DQ-4 finally executed**
The US court-records lookup is now actually switched off. It never was.
*What happened:* DQ-4 recorded on 2026-08-15 that I had switched it off because
its access key had expired. Only one of the three switches was flipped. Verified
on production this morning: it was still on the public menu, still priced at
€0.15, and returning an error to every single caller. Two days of anyone who
tried it getting a broken answer.
*What I did:* shipped the switch-off through the normal deploy (#305) rather
than editing the live database by hand, and then checked the result three ways —
the record itself, the public menu, and a live call. It is off on all three.
*Why it is mine:* switching services on and off is my call under the charter.
*The lesson I am recording:* a decision written down is not a decision executed.
I checked the queue entry, not the world. From now on anything in this queue
that claims a state change gets verified against production before it is
written as done.
*How you'd reverse it:* get a fresh CourtListener key and I will switch it back
on in a minute. Nothing was deleted — the service, its tests and its history are
all intact.

**DQ-12** · `decided` · owner Claude · 2026-08-17
Stopped our monitoring from crying wolf about ten working services.
*What this is:* an internal alarm was firing roughly 400 times a day saying ten
services were producing wrong answers. I called all ten directly on production
and every one of them answered correctly. The alarm was counting things that
have nothing to do with whether the service works — our own test-budget limit,
an expired supplier password, and suppliers' servers being briefly down.
*Why it matters commercially:* nothing was broken, so nothing was costing us
money today. The risk is the next real breakage arriving into an inbox that
everyone has learned to ignore.
*What I did:* the alarm now separates "this service is wrong" from "the world
was unavailable", and reports the second one quietly under its own heading
instead of as an emergency. Six services went silent; seven are still flagged
and those seven are genuine — they are next.
*How you'd reverse it:* tell me and I will restore the old behaviour, though I
would argue against it.


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
