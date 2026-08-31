# New chat handoff

## Objective

Continue refining and locking the Strale website’s visual system and combined HTML prototype section by section. The current focus is visual design, graphical expression, copy clarity, responsive behavior, and interaction quality—not deployment.

## Current state

The combined prototype is available at:

`http://127.0.0.1:4180/index.html?motion=1&review=20260825-folded-light-image-v3`

Its source is:

`C:\Users\pette\Projects\brandkit-lab-strale-design\experiments\strale-website\hero-v1\design-system.html`

The visual system has now been captured in `STRALE_WEB_DESIGN_SYSTEM.md` in this folder.

## Decisions that are currently locked

### Overall

- Premium, precise SaaS infrastructure aesthetic.
- Instrument Sans for product/narrative type; IBM Plex Mono for technical labels.
- Signal Red `#f2381b` is the canonical eyebrow and micro-accent color.
- Main canvas is white; colored backgrounds are concentrated, not used for every section.
- Standard desktop hero heading is 52px.

### Hero

- Keep the copy exactly as written in the current prototype.
- Keep the right-side product illustration.
- Keep the high-quality Folded Light raster artwork behind both navigation and hero.
- Do not replace it with a CSS approximation.
- Hero status should say Routing or Completed, never Pause.
- Hero animation must keep the request card’s dimensions stable.

### Capabilities carousel

- Keep the current content concept and location directly below the hero.
- At least 30 capabilities.
- Exactly five dark color families plus one light Warm Porcelain family.
- No patterns.
- Continuous automatic scrolling plus touch/trackpad control.
- No arrow buttons and no visible scrollbar.
- Pause/Resume is a visible pill control.
- Hover or focus must not make the track jump or stop unexpectedly.

### How Strale works

- Full-width Warm Porcelain background, no gradient.
- Use the premium horizontal three-stage flow shown in the approved reference image.
- This direction is approved but has not been implemented.

## Most likely next task

Implement the approved horizontal “How Strale works” visual in the combined HTML while leaving the hero and capability carousel untouched.

Reference:

`C:\Users\pette\AppData\Local\Temp\codex-clipboard-934c98ef-66d3-46f5-a516-d5a83b1ba324.png`

Required qualities:

- Warm Porcelain full-width section.
- Three clear stages connected horizontally.
- Compact request panel on the left.
- Larger central router with one-capability and multi-source branches.
- Compact completed-result panel on the right.
- Signal Red step circles.
- Fine neutral and blue route lines.
- Premium restraint: white panels, quiet borders, controlled shadows, no decorative gradient.
- Responsive version must stack logically without losing the route narrative.

The previous chat stopped before this implementation. Inspect the exact current DOM/CSS before touching it, because broad CSS overrides previously caused section-spacing regressions.

## Known pitfalls

1. **Broad section overrides can collapse spacing.** Use section-scoped classes and the semantic spacing tokens.
2. **The carousel is fragile.** Seemingly unrelated focus or overflow CSS has stopped auto-scroll, exposed scrollbars, or created frames.
3. **Do not equate focus with pause.** Pause only from explicit user action or reduced-motion preference.
4. **Do not re-create Folded Light in CSS.** The raster asset is the quality baseline.
5. **Avoid color repetition.** White and Warm Porcelain should carry most sections; dark/gradient frames are focal points.
6. **Do not change approved copy casually.** Product clarity was reviewed line by line.
7. **Do not use a muted legacy orange.** Canonical Signal Red is `#f2381b`.
8. **Do not show technical controls as plain text.** Tabs, Pause/Resume, and CTAs must visibly look interactive.

## Verification expectations for any next change

- Compare the result against the approved reference image and the design-system tokens.
- Inspect desktop at the current review width.
- Inspect tablet and mobile wrapping/stacking.
- Confirm the hero still fits and has not changed.
- Confirm the capability carousel still auto-scrolls, remains manually scrollable, and has no visible scrollbar or focus frame.
- Confirm keyboard focus, contrast, and reduced-motion behavior.
- Do not regenerate screenshots unless asked.

## Scope boundaries

Out of scope unless explicitly requested:

- Deployment or publication.
- Production infrastructure.
- Cloudflare, domain, redirect, or DNS changes.
- Search Console submissions.
- Merging to `main`.
- Replacing production APIs or backend behavior.

## Suggested first response in the new chat

> I’ve read the design-system and continuation handoff. I’ll inspect the current prototype and implement only the approved horizontal “How Strale works” section on Warm Porcelain, preserving the hero and capability carousel. I won’t deploy or merge anything.

