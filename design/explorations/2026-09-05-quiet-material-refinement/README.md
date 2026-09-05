---
status: exploring
supersedes: null
superseded_by: null
---

# Quiet Material refinement

**Continuation note, 5 September:** the founder found these studies unpolished. After seeing alternative boards, the founder clarified a preference for the existing Quiet Material redesign and a review/completion of its design system. Resume at the [system completion plan](../../../docs/programs/brand-website/SYSTEM-COMPLETION.md). This folder preserves the earlier unadopted masters; its historical instructions below are not the current next action.

First application studies following DEC-20260905-A. The positioning is approved; these visual rules and applications are candidates. This exploration compares composition within Quiet Material, not replacement identities. The preserved v0.7 remains the control and is not superseded.

Read [FOUNDATION.md](FOUNDATION.md) for the human rules, `foundation.json` for the machine-readable authoring records and `applications.json` for editable composition instructions. Values come from [the candidate token file](../../tokens/candidates/quiet-material-refinement.json). The application PDF is a static study, not a functioning website, a production template or approved launch copy.

The set covers a desktop opening, contrasting document benefit section, mobile opening, social square, PDF cover and PDF interior. They use one illustrative invoice consistently. The exercise tests hierarchy and the transfer of the identity across formats; it does not establish conversion performance, complete accessibility, full responsive behaviour or catalogue availability.

Open `strale-application-studies.pdf` for the rendered set. Editable copy lives in `applications.json`; composition geometry and type roles live in the candidate tokens. `render.py` rebuilds the PDF from those masters after verifying source-asset and font digests. The same invoice is deliberately reused to compare applications; these pages are not a finished homepage sequence. A final page should avoid repeating the same proof in adjacent sections.

## Source and production scope

Atmosphere and lockup come from the complete [preserved frontend release](https://github.com/strale-io/strale-frontend/releases/tag/preserve-2026-09-02), `Strale-website-design-system-2026-09-01-213316.zip`, SHA-256 `891e905f8f7e53f466fba4b10c62c868680310bab119429d901268c42c1ce1b2`. This folder does not duplicate that asset tree. Its presence in the archive establishes lineage, not a fresh licence audit or final brand approval.

Instrument Sans and IBM Plex Mono retain the preserved direction's font families. Official font-source links and licences are recorded in `foundation.json`. The PDF embeds static instances of Instrument Sans for predictable rendering. The final web font register still needs language coverage, fallback/reflow and licence packaging checks.

Rebuild with Python plus reportlab, fonttools and svglib, passing the extracted release root and a font directory as described by `python render.py --help`. Download the named official font files, save the Instrument Sans variable file as `InstrumentSans.ttf`, and retain the accompanying OFL text. The renderer refuses changed bytes. It has no network access or product-call path. Its fixed page studies are not a general production brand renderer; the layout schema and full accessibility exports remain T5 work.

## Review criteria

Can a new reader identify useful agent work from the opening? Does the benefit section feel like a new moment instead of a repeated card? Is the input-to-output relationship immediately legible? Does mobile show proof promptly? Do the social and PDF applications feel related without copying the website layout? These questions guide aesthetic review; a model score will not select the result.

Next, refine the applications against founder feedback and extend the audit to mode pairs, navigation states, icon roles and the wider atmosphere family. Production enforcement and an adopted asset/component library belong to T5. The [program register](../../../docs/programs/brand-website/tracks.yaml) owns the next action.
