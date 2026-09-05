# Quiet Material patterns 0.1

Generated from registry.json; edit that source, then rebuild. Candidate, not production adoption.

## Forms

| Rule | Contract |
|---|---|
| layout | single-column |
| label | visible-above-field |
| optional | word-optional-in-label |
| validation | on-submit-then-on-correction |
| error_focus | first-invalid-field |
| error_association | aria-invalid-and-aria-describedby |
| loading | preserve-label-and-size; announce-status; prevent-repeat |
| failure | preserve-values; inline-recovery; no-toast-only-error |
| selection | native-select-radio-checkbox |
| paste | allowed |
| target_min_px | 44 |
| states | empty, filled, hover, focus-visible, invalid, disabled, read-only, loading, success, failure |
| specimen_only | true |
| storage | none |
| network | none |

## Utility symbols

Original paths authored in this batch; no third-party icon artwork copied.

Grid: 0 0 24 24. Stroke: 2. Sizes: 16, 20, 24px. Colour: currentColor. Caps and joins: round/round.

visible text preferred; otherwise accessible name on 44px minimum button. Decorative: aria-hidden true and focusable false.

| Symbol | Use | Master |
|---|---|---|
| Search | Find content | [search](icons/search.svg) |
| Continue | Directional action after a label | [arrow-right](icons/arrow-right.svg) |
| Expand | Disclosure with aria-expanded on trigger | [chevron-down](icons/chevron-down.svg) |
| Close | Dismiss current surface | [close](icons/close.svg) |
| Success | Reinforce a written result | [check](icons/check.svg) |
| Information | Context that changes a decision | [info](icons/info.svg) |
| Attention | Reinforce a written warning or error | [alert](icons/alert.svg) |
| Copy | Copy named text; announce outcome | [copy](icons/copy.svg) |
| External link | Indicate a destination outside current site when useful | [external](icons/external.svg) |
| Filter | Narrow a result set | [filter](icons/filter.svg) |
| Email | Identify email as a channel | [mail](icons/mail.svg) |
| Document | Identify a document, not certification | [document](icons/document.svg) |

Prohibited: standalone logo substitute; decorative icon on every benefit; mixed library or weight; status conveyed only by colour; outline converted into an atmospheric illustration.

## Content budgets

Authoring defaults; exceptions require a reason, deeper destination and reviewed narrow screenshot. Never hide required instructions to meet a budget.

| Role | Headline words | Body words | Primary actions | Supporting links | Proof objects |
|---|---:|---:|---:|---:|---:|
| Opening promise | 12 | 32 | 1 | 1 | 1 |
| Benefit section | 10 | 40 | 1 | 1 | 1 |
| Marketing card | 8 | 24 | 1 | 0 | 0 |
| Result preview | 8 | 18 | 0 | 1 | 1 |
| Social artwork | 10 | 16 | 0 | 0 | 1 |
| Email body | 10 | 90 | 1 | 0 | 1 |

Result previews: at most 3 rows. Primary actions: 1 per decision group. Reading panels: at most 1 nesting level. Subtitles: omit-unless-it-adds-a-distinct-needed-fact.

- One dominant message per section
- One body-text level plus essential metadata
- Put technical detail at a named deeper destination
- Stack on narrow screens; do not shrink the type to preserve columns

## Page rhythm

Sequence: split-atmosphere → open-editorial → dark-invitation. At most 2 adjacent sections with the same layout; at most 1 decorative field per section. Card-grid purpose: Comparable choices, not a default section template.

## Applications

- [website](website.html): Three-section responsive sequence. Local anchors only; no API response or final homepage architecture.
- [social](social.html): Landscape artwork and accessible caption. Format study; platform crops and publication still require review.
- [email](email.html): Browser email composition with Arial fallback and plain-text companion. Not a sendable campaign; client testing, recipient context, links and legal footer required before sending.

## Boundaries

- Production active.json is unchanged; this candidate extends accepted design work.
- Browser keyboard/reflow and bounded contrast checks are not full screen-reader or cross-browser certification.
- Forms and actions are local fixtures without network, accounts, persistence or billing.
- Application copy and document fields are illustrative; chosen tool, route and public claims require launch proof.
- Email has not been tested in mail clients, and no message or social artwork has been published.
- Existing atmospheric asset rights gaps remain open; no new imagery or new logo is introduced.
- The utility set covers twelve common symbols; complex tables, dialogs, upload, authentication and custom comboboxes remain separate patterns.
