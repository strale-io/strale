# Founder profile

Who the founder is and what the fleet optimises for. Every session reads this before it asks the
founder anything or designs how work runs. Evidence: founder, 2026-11-04 ("I thought you would
have more context about what it is that I do and what it is that I want to achieve"): sessions
had no such file, so they guessed, and asked him technical questions he cannot judge.

## Who

- A solo, **non-technical** founder building several products in parallel (the active ones are
  the masters in wow-core's `docs/fleet-roster.md`), launching new products from time to time and
  running other projects beside them.
- He travels and is often away from his computer, sometimes for days, working from his phone.

## What he wants

- **The most progress on every project in parallel, with the least of his involvement.** Things
  just work; a mechanism that needs him often is a defect to fix, not a step to document.
- **Claude Code is the architect and orchestrator:** plans, writes briefs, reviews, verifies.
  **Codex does the clearly specified, checkable work**, building above all, to save Claude usage,
  and Claude verifies it (`MODEL_ROUTING.md` "Codex builders").
- **Each project has a master that runs lanes in parallel**, and lanes delegate their building to
  Codex too, through the fleet's Codex dispatcher.
- **Work runs in the cloud**, so it continues while his laptop is closed. A cloud session starts a
  session on his PC itself when only the PC has what it needs (`docs/fleet-roster.md` "Needs the
  founder's PC").
- **Sessions talk to each other** (`COMMS_CORE.md`) to stay in step and answer each other's
  questions before anything reaches him.
- **Seamless, never reckless:** secrets, sign-ins, customer and production data keep their rules
  (`SECURITY_CORE.md` in wow-core).

## His budget

- **Three Claude Ultra accounts**, each paced to last about 2 to 2.5 days, so together they cover a
  week. An account switch (`takeover`) is routine, every other day or so, and must stay cheap.
- **One Codex Pro account** (one ChatGPT sign-in), held in the cloud only by the fleet's Codex
  dispatcher.

## Asking him

- Ask only what is really his (`PACE_CORE.md` §5 "ASK LAST", in wow-core): spending, accounts and payments,
  legal acceptance, external communication, production releases not already delegated, deleting
  data, irreversible provider changes, and real product or strategy choices.
- **Never ask him to review or choose a technical option.** He cannot judge it better than a model.
  Decide it, with an independent review in a separate context where the tier needs one, and tell
  him what was decided.
- When he must act: plain language, one recommendation, a yes/no he can answer with one word, and
  exact steps: which app, window, tab or session, and the text to paste. Keep his steps off the
  terminal wherever the platform allows.
- **Never hand him git, shell or PowerShell commands** (founder 2026-11-06: a master asked him to remove a
  worktree and delete a branch by hand). GitHub work (branches, PRs, labels) a cloud session does itself;
  work on his PC (worktrees, local files, local tools) goes into a PC session its master starts
  (`docs/fleet-roster.md` "A master's PC session"), batched into the next PC job when it is only cleanup. The
  only things he types are in Claude, a sign-in page or a product's own screen.
