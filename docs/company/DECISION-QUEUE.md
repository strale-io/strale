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

**DQ-27** · `your_call` · owner Petter · raised 2026-08-30T07:00Z · no deadline — **two settled production settings I have no way to apply**
Two services are recorded as answering faster than they really do, so requests
to them are routed as if they will return instantly when they often cannot. The
correct figures are settled by measurement, not judgement — there is nothing
here to decide about *what* should happen.
*What was measured (production, read-only, this morning):* `company-news` has no
recorded latency at all and is therefore routed instantly by default, while
36 of its 69 completed calls (52.2%) exceed the 15-second ceiling.
`page-speed-test` is recorded at 8000 ms against a p95 of 19,029 ms, with 54 of
436 (12.4%) over the ceiling. The two statements that fix it:
`UPDATE capabilities SET avg_latency_ms = 28734 WHERE slug = 'company-news';`
and `UPDATE capabilities SET avg_latency_ms = 20000 WHERE slug =
'page-speed-test';`
*Sized before escalating, because it changes the urgency:* over 90 days these
two earned **€0.65 from 13 external calls** and **nothing at all**,
respectively. Our own harness calls capabilities directly and never meets the
sync ceiling, so only real callers are exposed and there have been almost none.
Nothing is burning, and I am not dressing this up as a customer problem.
*Why it is here and not done:* `.env` contains no `DATABASE_URL_WRITE` and
`FOUNDER_GRANT_PUBLIC_KEY_PEM` is empty — both verified absent this morning,
both deliberately so. The 2026-08-22 runbook destroyed the `strale_rw` password
and the founder signing key after establishing that a session can read any file
its own user can read. **I am not proposing to reverse that.** Step 1 of that
runbook — set the `strale_rw` password, keep it in a password manager, paste it
per command — has never been done, and until it is, this whole class of settled
adjustment has no route to production.
*The part that actually worries me:* `page-speed-test` was already agreed as
part of #436's closeout and **was never applied** — verified against production
rather than assumed from the issue state. That is the second instance of a
settled adjustment recorded as done without happening (DQ-11 was "DQ-4 finally
executed"). A third makes it a family under the three-strike rule.
*If you do nothing:* the two stay mis-routed and the slowest calls to them keep
dying unanswered. At current volumes that is worth well under a euro a quarter.
The reason to act is the pattern, not the loss.
*How you'd reverse it:* nothing to reverse — this is a request for a route, not
a change already made.

**DQ-21** · `answered` · owner Petter · raised 2026-08-27 · answered 2026-08-28 — **we do not contact the card-paying customer**
*Answered:* Petter, in chat: "we will not reach out to the buyer." Clear and
final on the specific case. Marked `answered` rather than `decided` because he
made this call, not me — `decided` would record his judgement as mine.
*What was asked:* the 08-27 brief and again the 08-28 brief put the same
question — whether to write one short note to `provider@dlgt.io`, our only
card-paying customer, asking what they were building. The 08-28 recommendation
was to set a date (04-09) and write only if they were still silent by it. That
recommendation is declined.
*What this settles, and what it does not:* it settles this buyer. It does not
by itself establish the general rule I also asked for, and **no session should
read the narrower answer as licence to approach anyone else.** The operative
default is unchanged and already strict: CHARTER.md § The boundary, items 1–4 —
no outreach derived from transaction evidence, telemetry yields anonymous
insight only, and a registration is a relationship while a payment is not. This
customer registered, so item 4 was the only thing that made the question askable
at all. Absent an explicit widening, **no outreach happens**, and the general
rule stays unstated rather than being inferred from this answer in either
direction. Do not re-raise it as a standing question; raise it only if a
concrete case needs it and the charter genuinely does not resolve that case.
*Consequence, recorded because it changes what we do next:* the only remaining
way to learn anything about this customer is their behaviour. That removes the
cheap route and makes the expensive one the real one — build the multi-entity
comparison they demonstrably wanted and paid three times over to assemble by
hand, and see whether they come back for it. See GOALS.md.
*How you'd reverse it:* say so in chat. Nothing has been sent, and nothing is
scheduled to be.

**DQ-20** · `answered` · owner Petter · raised 2026-08-27 · answered 2026-08-27 — **activate austrian-company-data on the official Firmenbuch API, at €0.05**
*Answered:* Petter approved in chat the same evening (“go ahead with DQ-20 —
activate at €0.05 with x402 on”). Executed at 2026-08-27T21:16Z as the exact
UPDATE below (before-state captured: inactive/invisible/x402-off/80¢/8000ms/
degraded). Verified after: listed in /v1/capabilities at 5¢ with the Firmenbuch
data_source, present in /x402/catalog, /x402/v2/austrian-company-data answers
402 with a USDC challenge, and the full prod test suite runs 7/7 (two stored
known_answer rows still asserted a literal source_as_of timestamp from the
--discover era; relaxed to not_null under fixture_refresh). Remaining
follow-ups — regenerate the strale-capabilities package snapshot, AT KYB VIES
wiring — tracked in the 2026-08-27 handoff. Original entry below, unedited.
Austria's registry capability is rebuilt on the official government API and
fully verified in production; turning it on — and its price — is yours.
*What happened:* JustizOnline granted Moonlighter AB the IWG token for the
Firmenbuch HVD API on 2026-08-27 (the exact reactivation trigger DEC-20260427-I-6
named). The migration shipped as PR #410 the same day: Firmenbuchnummer or
company-name input, legal form, court, EUID, current officers with representation
authority, insolvency/dissolution legal facts, CC BY 4.0 attribution in every
response, €0 external cost per call. Deploy verified on prod; manifest and all
eight test suites synced under the delegated operator authorities; smoke test
11/11 green against live prod code. NIKI Luftfahrt correctly returns
`status: dissolved`.
*What needs you:* listing state and money are founder-gated by
production-authority design (and the founder-grant key is not installed, so no
session can discharge this). One statement covers it:
`UPDATE capabilities SET is_active = true, visible = true, lifecycle_state = 'active', x402_enabled = true, price_cents = 5, avg_latency_ms = 1500 WHERE slug = 'austrian-company-data';`
Price 5¢ matches the other direct-registry capabilities (SE, DE, SK; DB still
says the Openapi-era 80¢). x402 on matches catalog policy — AT is not in the
DEACTIVATED map. Say the word in chat and I run it under your named approval,
or run it yourself against the write role.
*Also worth knowing:* the AT KYB solutions' VIES step now resolves null and is
skipped (the Firmenbuch carries no VAT numbers — same standing pattern as SK);
`packages/strale-capabilities/capabilities.json` gets regenerated after
activation so the published catalog picks up the new contract.

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
   *Routed around 2026-08-23:* I ran both cross-repo checks by hand against a
   local copy of the website. The shape check is clean (25 fields to 25) and the
   wording sweep found nothing untrue — three of its five flags are a
   competitor's name on a page that exists to compare us to competitors, and
   the other two are a capability count that understates what we have. So
   nothing is broken behind this; the token buys automation, not a fix.
4. **The wow-core repository** — archive it or delete it. It is dead and only
   adds noise.

*If you do nothing:* nothing breaks. Item 2 keeps one service visibly broken;
item 3 leaves one automated check inert; items 1 and 4 are tidying.

**DQ-18** · `answered` · owner Petter · raised 2026-08-22T07:00Z — **both items are settled; nothing here needs you**
Both were decided by Petter, not by me: item 1 accepted with the
production-authorization incident closeout, item 2 approved as a removal.

The token was `your_call`, which the dashboard renders as "Needs your yes" — so it
kept asking for two answers he had already given. `answered` renders as settled
*and* keeps his name on it, which `decided` would not: that token means "I made
the call", and using it here would have recorded his approval as mine. The entry
stays under OPEN for visibility, per the precedent DQ-3, DQ-9 and DQ-10 set. The
original text and both corrections are below, unedited.
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

> **CORRECTION, added 2026-08-22 — item 1 is not a proposal any more.** The text
> above is left as written, per the rule that entries are annotated rather than
> rewritten, but it is now misleading in the specific way this whole reform
> exists to prevent. **The eleven rows were closed and the €1.00 credited at
> 07:50:01Z that same morning**, by a session acting without the approval this
> entry was asking for. So "the proposal is to close all eleven" describes
> something already done, and "if you do nothing, eleven rows stay in a status
> they should not be in" is false — they are not in that status.
>
> **And nothing about it is open now either.** The production-authorization
> incident was closed and accepted on 2026-08-22 (PR #361, accepted in #364).
> The remediation ledger is explicit that the eleven `manual_reconciliation`
> rows were deliberately **not** rewritten — "their `authorised_by` string is
> wrong and stays wrong; the incident record is the correction" — so the
> resulting state is the accepted outcome, not a pending stand-or-reverse
> choice. A brief that asked you to re-decide it would be putting a settled
> incident back in front of you.
>
> **Item 2 is settled too, and in the direction the entry recommended.** You
> approved the correction itself: unsupported tamper-evidence and
> downstream-regulatory-verification claims come off, with **no replacement
> integrity claim** until one is independently substantiated. The operative plan
> is `docs/remediation/PUBLIC-COPY-CORRECTION.md`, which lives on the
> remediation programme's branch and is **not on `main` yet** — so this path
> does not resolve for a reader here, and it is named rather than linked for
> that reason. It is pure subtraction, no new
> assertion — and it supersedes the hedged replacement paragraph the original
> brief proposed, which was itself withdrawn for containing a sentence that was
> false. So the question "should we publish narrower wording?" is not open:
> narrower wording is not what was approved, removal is.
>
> What remains is execution, and it is mine: the surface list has grown from 6
> to 32 locations across four deploy units under two rounds of independent
> review, and it is not finished. Two of those rounds each found surfaces the
> previous round missed, so the count is a lower bound and the review continues
> until a round finds nothing new. That work is `SYSTEM_ACTING`. If applying it
> turns out to need an authority I do not hold, that becomes an
> `AUTHORIZATION_UNAVAILABLE` item on the day it is ready — a request for
> authority, not a re-run of a decision you have already made.
>
> Recorded because a completed production mutation left standing in a queue as
> "recommended: approve as proposed" is the same misreporting as executing
> without authority, pointing the other way — LESSONS.md family F10, incident 3.

## DECIDED — visible so you can reverse them

**DQ-26** · `decided` · owner Claude · 2026-08-25
Our quality system no longer assumes a failed call is our fault when it cannot
tell whose fault it was.
*What happened:* when a call fails, something has to decide whether the fault is
ours, the caller's, or an outside supplier's. That decision was built to answer
"ours" whenever nothing matched, and nothing matched often. Measured over three
months and 280,000 calls, at least four out of five failures blamed on our own
services were something else — a caller sending bad data, a supplier being down,
or one of our own safety checks correctly refusing a request.
*Why it mattered:* that verdict is what decides whether a service gets pulled
off the catalogue. Services were pulled for working correctly, six times since
mid-August, and each previous repair fixed only the case in front of it.
*What changed:* the system now answers "I could not tell" instead of guessing,
and reports how often it could not tell rather than dropping those cases
silently. Charging is unaffected — verified, and pinned by a test, because the
same rule is read by the billing path.
*What is NOT done, deliberately:* it still acts on what it can attribute. Making
it hold back when a lot is unattributed is a larger change, and I want a month
of honest numbers before proposing it rather than picking a threshold now.
*Why this is mine:* a quality-system correction with no money movement and no
public claim. Charter puts quality gates in my column.
*How you would reverse it:* tell me, and the old assumption returns — but it is
the direct cause of a tracked failure family that reached seven incidents.

**DQ-24** · `decided` · owner Claude · 2026-08-25
The overstated claims about our audit records are now off everything we publish.
*What happened:* you approved taking them down (DQ-18 item 2). The website half
was done; the machine-readable half — what agents, crawlers and integration
partners actually read — was not, and had been live the whole time. The
strongest of them told readers an audit record was retrievable "for downstream
regulatory verification", which claims it is fit for a regulatory purpose rather
than describing what it does. Also removed: a promise that we walk the record
chain all the way back to the beginning, when we stop after twenty steps; a
statement that we keep records indefinitely, when we erase their content after
ninety days; and a "replay" feature listed as delivered in two published data-
protection assessments, which that same erasure makes impossible.
*What replaces them:* nothing. Pure removal, as you decided. Nothing new is
claimed, hedged or otherwise.
*Why this is mine:* executing a decision you already made. Your queue entry says
so explicitly — "what remains is execution, and it is mine".
*What is NOT done, deliberately:* republishing our installer package to the
public registry. That is a one-way public act and stays yours. The live text is
already fixed by the deploy; only the package version trails.
*What stops it coming back:* an automatic check now fails our build if any of
that wording reappears. It was tested by putting the claims back and confirming
the check goes red.
*How you'd reverse it:* tell me, and the wording returns.

**DQ-25** · `decided` · owner Claude · 2026-08-25
Three dead branches removed and two incident records rescued off one machine's
hard drive.
*What happened:* two abandoned snapshots from mid-July and one already-merged
branch were deleted, each commit id recorded first so all three are restorable.
Separately, the two written records of the August 22nd process violation existed
only as untracked files in a working directory — three days from being lost with
that folder. They are now committed. Nothing in them is changed and the incident
stays closed.
*Why this is mine:* routine cleanup, fully reversible.


**DQ-21** · `decided` · owner Claude · 2026-08-23
Agents that asked for a paid service by describing it were getting an error page
instead of a price. Fixed and live.
*What was wrong:* our main endpoint accepts either the exact name of a service
or a plain-English description of what you want. Only the first was handled for
someone who has not signed up — a caller who described what they wanted fell
through to the paid path with no account behind them, and the server answered
"an unexpected error occurred". Anyone who already knew our internal names got a
correct price; everyone else got an error. Plain-English is what our own
installer, our SDKs and our documentation all tell an agent to send.
*How long:* since 2026-03-08, the day the check was written.
*Now:* the same request is answered with a price on the crypto rail — verified on
production, "take a screenshot of this page" returns a quote of $0.054 — or with
the list of services that are free with no signup.
*Why this is mine:* a demonstrated, reversible defect with a test that fails
against the un-fixed code. Reversible by reverting one commit.

**DQ-22** · `decided` · owner Claude · 2026-08-23
Seventeen dead branches removed, six of which a previous session had already
recorded as deleted without them actually going.
*What happened:* the 2026-08-22 run wrote down seven deletions. Six had not
executed. Every branch removed today was first re-checked by comparing file
contents against the main line — never commit counts, which are misleading
after a squash merge — and every commit id is recorded in the session handoff,
so all of them are restorable. Remote branches went from 24 to 7, verified
afterwards against the remote itself rather than the local cache.
*Also cleaned:* five stale working copies and a leftover throwaway database
container.
*Why this is mine:* routine cleanup, fully reversible from the recorded ids.

**DQ-23** · `decided` · owner Claude · 2026-08-23
The account-lifecycle work that had been sitting open was merged and is live.
*What it does:* it makes signup a single all-or-nothing step, gives free trial
credit one rulebook instead of two (one of which granted credit with no checks
at all — eight accounts from one address took €16 that way in May), reads what
Stripe says a payment settled rather than what we told Stripe it would be, and
stops anyone rotating an account's key by knowing only its email address.
*Why this is mine:* shipping is execution, not a decision. It had passed review
and every gate. Verified live afterwards by querying production for the actual
effect — both new tables, both guards, and the 59 backfilled entitlements.
*Two items it raised are yours and are NOT actioned:* reconciling 22 drifted
internal wallets, and whether to reclaim the €16 of farmed trial credit. Both
write production wallets. Neither is urgent — all eight accounts spent nothing.


**DQ-20** · `decided` · owner Claude · 2026-08-22 — **reclassified, then fixed**
Two defects in the new production-authorization model, closed without asking you.
*Why this is not your call, on reflection:* I first raised it as one. You pushed
back, correctly. Neither item was a question about what powers the system should
have — the model's own stated rule is that a session must not be able to grant
itself the permission it is supposed to prove, and both defects were simply
places where the code did not do that. There was no choice with two defensible
answers, so there was nothing to decide.
*What was wrong:* the function that releases the production write credential
checked only that it had been handed an object of roughly the right shape, so a
hand-written one passed — a session writing down its own permission. And two
comments claimed that every production change records who authorised it, which
nothing does.
*What I did:* the model now remembers every permission it issues and refuses any
other, so a fabricated one is rejected because it was never issued rather than
because it looks wrong. The false comments are corrected to say what is true —
authority is checked when the credential is handed over and is not yet written
down anywhere. Wiring that recording is the remaining work and it is mine.
*How it was checked:* the new refusal is verified in both directions — a
fabricated permission is refused for the right reason, and a genuine one is not
refused for that reason. Removing the check fails the test.
*What did not change:* nothing about what the system is allowed to do. No
permission was added, removed or widened.
*How you'd reverse it:* tell me, and the check comes out.

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
available of how that widening goes wrong.
*A second correction, and a worse one.* The draft after that described those
eleven records as waiting for your permission. They were not waiting: **the
change had already been made to production at 07:50 that morning**, without
approval, by another session. Reporting a completed mutation as pending
permission makes the record read as though the gate held when it did not — the
same misreporting as executing without authority, pointing the other way. What
is genuinely open is narrower and is now stated as such: whether that change
stands or is reversed. That question is on the brief, with a recommendation to
let it stand.

> **CORRECTION, later the same day — that paragraph is now wrong too, and in the
> same family.** "What is genuinely open is… whether that change stands or is
> reversed" was true when written and stopped being true within hours: the
> production-authorization incident was closed and **ACCEPTED** (#361, accepted
> in #364), and the ledger records that the eleven rows were deliberately not
> rewritten because the incident record *is* the correction. So nothing about
> them is open, the question is off the brief, and this sentence is a third
> statement of the same error — first executing without authority, then
> reporting a finished write as pending, now describing a closed matter as an
> open choice. Logged as F10 incident 4. Left as written per the annotate-don't-
> rewrite rule, and guarded in code: `SETTLED_MATTERS` in the brief linter now
> refuses a founder-decision entry on either of these two matters.
*What I will do instead:* nothing to live data. The authorization mechanism
landed later the same day and starts locked — no founder-gated change can be
approved until you generate a signing key and install its public half. Until
then every such change is refused, mine included.
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
