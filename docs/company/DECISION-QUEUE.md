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

**DQ-3** · `your_call` · owner Petter · raised 2026-08-15 · **token received, not working**
The Mexico token you sent does not authenticate. One thing to check at INEGI.
*Where it stands:* Token `d7cd…078d` received 2026-08-15 and stored in the local
environment. It reaches INEGI — an incorrectly-shaped query returns a proper
parameter error, which proves the request arrives — but every correctly-shaped
query returns a malformed `HTTP/1.1 000` status line. Confirmed with two
independent HTTP clients, so this is INEGI's server answering, not our network.
Parameter validation runs before the token check, which is why the wrong shape
looked more promising than the right one.
*Most likely cause:* the token needs an activation step, or the copy is
incomplete. INEGI mails the token; some issuances also mail a confirmation link.
*What would help:* check the INEGI email for an activation link, and confirm the
token in the mail matches character-for-character. If it does and it still
fails, the token may need reissuing at
https://www.inegi.org.mx/app/desarrolladores/generatoken/Usuarios/token_Verify
*Why the build stopped:* the onboarding protocol requires a verified
known-answer test against a real response. I have never seen this API return
data, so writing an executor and a manifest around it would produce a capability
that has never been tested against the thing it claims to query. Once one query
answers, the build is roughly half an hour — the API shapes are already
established below.
*Established and ready to use:*
- base `https://www.inegi.org.mx/app/api/denue/v1/consulta/`
- by name: `Nombre/{name}/{entity}/{start}/{end}/{token}` — entity `00` is nationwide
- by id: `Ficha/{id}/{token}`
- nearby: `Buscar/{term}/{lat},{lon}/{metres}/{token}`
- the token is always the final path segment

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
