Intent: Carry out Petter's 2026-10-25 design pass on the apps/web site — off the pink, illustrated, alive, with the Switchboard hero.

# Website design pass: Open Flow 0.2 (Daylight) and the Switchboard hero

Directed by Petter on 2026-10-25 (DEC-20261025-A). Branch `design/site-polish`,
stacked on the website slice branches (`claude/loving-newton-mxoo9l-company-data`,
PRs #725 to #727, still drafts). Nothing here reaches strale.dev until those land
and the founder-reserved public cutover happens.

**What changed**
- Tokens: the light canvas is white and the tinted surfaces paler and cooler, in
  `design/tokens/candidates/open-flow.json` and the website surface of
  `design/tokens/active.json`, promoted together under DEC-20261025-A. The kit
  colours, type, spacing and dark theme are unchanged. Motion: two ambient
  durations; the no-loop rule narrowed to the home hero and the live-tests panel;
  the home headline may rise in once; pointer micro-interactions allowed.
- Home hero: `SwitchboardHero.astro` plus `scripts/switchboard.ts`. Six real
  tools are wired to one console and run their published examples, with live
  list prices. The page is server-rendered with one call complete, so it reads
  the same with no script and under reduced motion. The circuit layout runs from
  1280px; below that the tools are a row of buttons. The hero keeps the
  SITE-STRUCTURE §1 contents: L1 headline and support line, catalogue search,
  Browse tools, Read the docs.
- The home page also gained a "Tools are tested against their live sources" panel
  (`TestedNow.astro`, from the public trust projection), illustrated job cards,
  and illustrated company-data and payment sections. The Tools and Company data
  hub headers gained illustrations too.
- Nine spot illustrations were generated with ChatGPT image generation (Codex
  CLI, subscription), with briefs and hashes in
  `apps/web/src/assets/illustrations/provenance.json`.
- Site-wide micro-interactions in `site.css` and `site.ts`: a sheen on primary
  buttons, magnetic buttons, an arrow nudge, nav underlines, a card spotlight and
  a chip lift. All are off under reduced motion.
- Fix: the tested line on tool and country pages said "% of recent test runs
  passed". The trust projection's `pass_rate` is the share of a tool's test
  suites whose latest run passed, so it now says that.

**Independent review (fresh Claude agent, same provider, separate context)**
The first pass FAILED and everything it found was fixed in the third commit:
- Free tools were shown as priced. They now show "free" and "nothing, free tool".
- The tested panel showed a green tick at any pass rate. The tick now appears only at 100%; anything lower gets a warning mark.
- The section heading overclaimed "tested against their live sources". It is reworded: test types vary, some tests replay a saved response, and not every tool is tested on a schedule.
- The console now cycles silently (aria-live off) and announces only calls the visitor chose. It holds while the pointer or focus is in the board and has a Pause button.
- The tested list is now still, so the ambient-slow token is removed.
- The build no longer crashes when no example qualifies.
- Hero inputs are taken from each tool's published example, so the question, the call and the result agree. The live examples for url-to-markdown and dns-lookup differ from the manifests.
- Phones get visible labels and a distinct IBAN glyph. The tool tags are hidden from screen readers, and the line length resets on resize.
- Tokens are used for easing and the magnet reach, and the button transitions are complete.

**Not done / open**
- The live panel shows recent *tests*, not recent customer calls. There is no
  public source of calls, and publishing one would expose traffic.
- The hero lab artifact (claude.ai) holds the rejected variants for reference.
- The open-flow specimen screenshots under `design/brand-kit/open-flow/screenshots/`
  still show the 0.1 pink canvas; they are not checked and were not regenerated.
