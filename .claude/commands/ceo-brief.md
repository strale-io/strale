---
description: Write (or check) the CEO morning brief for a completed operating session — business synthesis, not a work log.
argument-hint: "[YYYY-MM-DD | --check]   (default: today)"
---

# /ceo-brief — the founder-facing half of a daily run

Argument: `$ARGUMENTS` (empty = today's date; `--check` = lint the existing brief
without rewriting it).

**Do not run this before the operating work is finished.** The brief is written
from a completed day, not alongside one. If the session is still mid-investigation,
say so and stop — a brief written early reports intentions as outcomes.

## 1. Read the authority

`docs/company/DAILY-RUN.md` Part 3. Do not work from memory of the format; the
five sections and their order are a contract and the guard enforces them.

## 2. Gather the material

- The operating record for today in `handoff/_general/from-code/` — this is the
  input, and the one thing you must **not** simply shorten.
- The commercial pack: `cd apps/api && npx tsx scripts/commercial-brief.ts`.
  Its "THE READING" block is what section 1 is built from. Use the conclusions,
  not the numbers; the numbers appear only where they carry the meaning.
- `docs/company/LESSONS.md` — if anything today belongs to a failure family, the
  business fact is the *pattern*, not the incident.
- `docs/company/DECISION-QUEUE.md` — the only legitimate source of section 5.

## 3. Write it

`docs/company/briefs/YYYY-MM-DD.md`, five sections in order, ~300–600 words:

1. Business performance · 2. What materially changed · 3. Fixed automatically ·
4. Working on now (max three, outcomes not tasks) · 5. Needs your decision.

Section 5 defaults to **"Nothing needs your decision today."** Before putting
anything there, apply the charter's test: *could further code inspection,
production measurement, experimentation, or an existing decision resolve this?*
If yes, go and do that instead — including now, mid-brief. Anything that does
belong carries all five fields: the choice, what is established, the options,
your recommendation, the concrete consequence of each.

## 4. Check it

```
cd apps/api && npx tsx scripts/check-ceo-brief.ts
```

Fix every error. Then answer DAILY-RUN.md's seven editorial questions yourself —
especially "is anything here only because engineering spent time on it", which
the script cannot ask and which is the question the format exists for.

## Rules

- Never put a filename, commit id, query, branch, pull-request number, test
  count, migration number or piece of internal vocabulary in the brief. If one
  is genuinely indispensable to a decision, name it once in plain words and add
  it to the allowlist in `scripts/check-ceo-brief.ts` with the reason.
- Never hand Petter an unresolved technical question, in any section.
- Never report a problem without either having acted on it or explaining why it
  is his to decide.
- If the day genuinely produced little, write a short brief. Padding a thin day
  is how the format decays back into an activity log.
