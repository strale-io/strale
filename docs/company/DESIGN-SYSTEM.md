# Strale internal design system

Locked 2026-08-15. Everything I generate for you to read — dashboards, weekly
reviews, reports — uses this. The point is that the tenth page looks like the
first without anyone re-deciding.

**The rules live in code, not here.** `apps/api/scripts/lib/design-system.ts`
exports the tokens and the stylesheet; a new page imports `DESIGN_SYSTEM_CSS`
and uses the class names below. This file explains the choices so they can be
argued with.

## Direction

Light-mode operational SaaS: white cards on a soft grey ground, one accent
colour, quiet type, generous tabular numbers. Deliberately **single-theme** —
you read it in daylight, and committing to light means what you see is always
the version that was approved, not an automatic dark inversion nobody reviewed.

## Colour

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#F5F6F9` | the page behind the cards |
| `--surface` | `#FFFFFF` | cards, sidebar, top bar |
| `--raised` | `#FAFBFC` | hover rows, the profile block |
| `--line` / `--line-soft` | `#E7E9F0` / `#EFF1F6` | card borders / row dividers |
| `--ink` / `--ink-2` / `--muted` | `#151821` / `#3D4453` / `#767E8E` | headline / body / labels |
| `--acc` | `#5A57D6` | **the one accent** — data bars, active nav |
| `--acc-soft` / `--acc-line` | `#EDECFC` / `#C9C7F4` | accent backgrounds, non-emphasised bars |
| `--good` `--warn` `--crit` | `#177245` `#9A5B12` `#B3352C` | state only |

Three rules that keep it coherent:

1. **One accent.** Charts use the accent and its light partner, never a rainbow.
   The most recent day is the strong accent; earlier days are the light one.
2. **Status colours are reserved.** Green/amber/red mean good/attention/bad.
   They are never borrowed as "another series colour".
3. **Text wears text colours.** Numbers and labels stay in ink or muted grey; a
   coloured chip beside them carries the meaning. Never colour a number to make
   a point — put it in a chip.

The greys lean very slightly blue, toward the accent, so they read as chosen.

## Type

System font throughout (`system-ui`), because it renders natively everywhere and
no font file can silently fail to load. Hierarchy comes from weight and size,
never from decoration.

| Role | Size / weight |
|---|---|
| Big metric | 25px / 660, tight letter-spacing |
| Card title | 13.5px / 600 |
| Body, table cells | 13–13.5px / 400 |
| Labels, captions | 11.5–12.5px / muted |
| Table headers | 10.5px / 600 / uppercase / wide tracking |

Every column of digits gets `tabular-nums` so they line up.

## Components

`.card` + `.chead` + `.csub` + `.cbody` · `.kpi` metric tile with `.ibadge`
icon · `.chip` for deltas · `.tag` for status · `.pill` for quiet metadata ·
`.ladder` for goal progress · `.frow` for step-by-step bars · `table` ·
`.qitem` for decisions · `.ship` for finished work · `.note` for the small print
under a card.

Layout: 236px sidebar, sticky top bar, content in `.row-2` (wide + narrow) or
`.row-even` pairs. Collapses to one column under 1080px; the sidebar hides
under 820px.

## Writing rules — as binding as the colours

You asked for plain English, so it is part of the system, not a preference:

- **No jargon, ever.** Not "capabilities" but *data services*. Not "circuit
  breaker open" but *switched off*. Not "x402 payers" but *paying customers*.
  Not "quarantined" but *paused*.
- **Say what it means for the business.** Finished work is described by what
  changed for you or the customer, not by what the code does. Commit messages
  are rewritten before they reach the page.
- **Decisions are written as questions you can answer.** One sentence, in your
  words, with my recommendation underneath.
- **Never dress up a number.** If a measurement can't be trusted yet, the page
  says so and shows a dash rather than a figure that reads as a fact.
- **Say the uncomfortable thing first.** If revenue fell, that is the headline.

## Adding a page

Import `DESIGN_SYSTEM_CSS`, reuse the class names, add nothing new unless the
component genuinely doesn't exist — and if you add one, add it to the shared
file, not to the page. That is the whole mechanism.
