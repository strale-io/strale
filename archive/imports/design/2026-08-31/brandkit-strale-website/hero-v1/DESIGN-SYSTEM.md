# Strale website design system — foundation v0.5

Status: approved foundation, derived from the reviewed homepage hero  
Reference implementation: `index.html`  
Shared tokens: `assets/design-tokens.css`
Adaptive layout contract: `ADAPTIVE-LAYOUT.md`

This file governs the Strale marketing website. It does not replace the Brandkit Lab application design system in `docs/frontend/DESIGN-SYSTEM.md`.

## 1. What is locked now

The following decisions were approved through visual review of the homepage hero and should remain stable while the next website sections are designed:

- primary and metadata typefaces;
- core color roles;
- white canvas and restrained surface hierarchy;
- display-type sizing and tone;
- mono eyebrow and metadata treatment;
- primary and secondary button hierarchy;
- borderless top navigation;
- approved atmospheric surface family for purposeful product and storytelling frames;
- selected Quiet Material direction for extending folded atmospheres into a controlled light/dark family;
- flat, legible product UI inside the expressive frame;
- desktop hero proportions and responsive direction;
- direct, plain-language product copy.
- shared editorial rhythm for section intros, content, cards, rows, and transitions;
- approved homepage patterns through pricing, closing CTA, and footer;
- restrained rotating hero examples with an explicit pause control.

The complete application component library, illustration and photography systems, customer-proof pattern, and dark-mode behavior are not yet approved. They remain provisional until reviewed in context. The homepage patterns documented below are approved for this website prototype; approval does not turn representative product values into production facts.

## 2. Design principles

### 2.1 Clarity before decoration

The page must explain the product in ordinary language before it asks the visitor to interpret a graphic. Headlines are short, concrete, and readable at a glance. Supporting copy explains the product rather than describing the brand.

### 2.2 Quiet canvas, concentrated expression

Most of the page is pure white. Expressive color is concentrated inside a purposeful product or storytelling frame. Do not tint the entire page, add decorative gradients behind copy, or distribute accent colors evenly across the composition.

### 2.3 Product proof over abstract illustration

Use legible product behavior as the primary visual proof. The current hero shows a realistic request, selected tool, and traceable response. Decorative imagery may create atmosphere, but it must not replace the product story.

### 2.4 Flat first

Default surfaces are flat and calm. Borders are used only when they clarify a component boundary. The top navigation has no divider. Shadows are reserved for a product surface placed over an atmospheric field, not for every card.

### 2.5 Spacious but not oversized

Whitespace creates hierarchy, but the complete desktop hero should fit in a typical laptop viewport. The approved laptop hero remains 52px; only the bounded expansive composition may interpolate it to 62px on a genuinely wide-and-tall display. Cards should feel proportional rather than monumental.

### 2.6 One clear action hierarchy

The primary action is black on white. Secondary actions are white with a quiet border. A composition should have one obvious primary action; supporting actions must not compete with it.

### 2.7 Technical detail has its own register

IBM Plex Mono is reserved for eyebrows, tool names, protocols, statuses, and traceability labels. It is not a substitute for body copy. Small mono text uses medium weight when necessary for legibility.

### 2.8 Flush-left by default

Marketing copy, product explanations, and section headings are flush-left unless a later reviewed section demonstrates a strong reason to center them. Layouts should feel editorial, not symmetrical by default.

## 3. Color system

| Token | Value | Role |
|---|---:|---|
| `--canvas` | `#FFFFFF` | Primary page background. |
| `--surface` | `#F8F8F5` | Quiet grouped rows and card footers. |
| `--surface-strong` | `#F1F1ED` | Defined grouped panels that need clearer separation from white. |
| `--ink` | `#11110F` | Primary type and black controls. |
| `--ink-secondary` | `#5F605C` | Supporting copy and secondary labels. |
| `--hairline` | `#DDDDD7` | Structural boundaries only. |
| `--signal-red` | `#F2381B` | Canonical eyebrow/category red, routing dots, separators, and small signals. This supersedes the earlier muted orange. |
| `--deep-ember` | `#25100D` | Atmospheric gradient foundation. |
| `--signal-blue` | `#164076` | Atmospheric gradient and focus state. |
| `--atmospheric-blue` | `#315E8B` | Secondary atmospheric depth. |
| `--midnight` | `#0D223B` | Deep technical background and atmospheric endpoint. |
| `--blue-mist` | `#E5EFF9` | Selected or matched route surface. |
| `--blue-whisper` | `#F0F6FC` | Quiet routing emphasis and pale explanatory surface. |
| `--border-blue` | `#B8CEE4` | Boundary for selected or matched route surfaces. |
| `--mineral` | `#246B5A` | Expressive trust and validation background. |
| `--mineral-light` | `#8FD5A6` | Light endpoint for compact trust accents. |
| `--deep-pine` | `#12382F` | Dark-green endpoint for Mineral; never replaced by blue. |
| `--mint-whisper` | `#EDF6F2` | Pale quality and reliability background. |
| `--border-mint` | `#D7E6DF` | Boundary for pale quality and result surfaces. |
| `--success` | `#17795D` | Positive product results, always paired with text. |

Technical surfaces use a small semantic extension rather than inheriting light-canvas ink:

| Token | Value | Role |
|---|---:|---|
| `--ink-inverse` | `#F3F6F9` | Primary text on Midnight. |
| `--ink-inverse-secondary` | `#AEBDCD` | Secondary labels and statuses on Midnight. |
| `--accent-blue-inverse` | `#9BC9F5` | Selected technical controls on Midnight. |
| `--border-midnight` | `#1D3958` | Technical-surface boundary. |
| `--hairline-inverse` | `rgba(229, 239, 249, 0.24)` | Dividers within Midnight surfaces. |
| `--surface-midnight-elevated` | `rgba(22, 64, 118, 0.18)` | Quiet nested technical surface. |
| `--success-bright` | `#23A77E` | Compact positive-state marker on Midnight. |

### Approved atmospheric expressions

| Expression | Token | Role |
|---|---|---|
| Spectrum | `--atmosphere-spectrum` | Hero and major product proof. |
| Mulberry | `--atmosphere-mulberry` | Warm, single-hue capability storytelling. |
| Ember | `--atmosphere-ember` | Action-oriented stories and customer proof. |
| Cobalt | `--atmosphere-cobalt` | Tools, catalogue breadth, and infrastructure. |
| Dusk | `--atmosphere-dusk` | Technical orchestration and final CTA moments. |
| Frost | `--atmosphere-frost` | Light explanation and support. |
| Midnight | `--atmosphere-midnight` | Compact dark CTA or technical framing. |
| Mineral | `--atmosphere-mineral` | Concentrated trust and validation moments; green through deep pine with no blue endpoint. |
| Mint | `--atmosphere-mint` | Pale quality and reliability. |

Visual references:

- `references/atmospheric-surfaces-v1.png`
- `references/green-extension-v2.png`
- `references/quiet-material-direction-v1.png` — selected direction reference; not a production asset sheet.

### Color rules

- Signal red is a precision accent, not a large background color.
- The accessible signal-red token is used wherever orange carries text or UI meaning on the white canvas. Brighter orange may remain inside approved atmospheric gradients, where it is decorative and carries no text contrast requirement.
- Expressive surfaces may hold product proof or a major storytelling moment. Do not use them behind long-form text.
- The page canvas remains white; atmospheric expressions stay concentrated inside purposeful frames.
- Use each expression according to its named role. Do not select a surface merely to alternate colors.
- Signal red may appear as a glow inside Spectrum or Ember, but it is never used as a large flat background.
- Mineral and Mint are expressive background roles. They do not replace semantic `--success`, which remains reserved for product state.
- Success green never communicates state by color alone.
- Blue mist denotes a selected or matched system result, not a generic decorative card.
- Warm off-white page backgrounds are not part of the approved website system; the canvas is white.

## 4. Typography

### Families

- Primary/display/body: **Instrument Sans**, weights 400, 500, and 600.
- Technical/metadata: **IBM Plex Mono**, weights 400 and 500.

### Approved hero roles

| Role | Family | Size / line | Weight | Tracking | Notes |
|---|---|---:|---:|---:|---|
| Hero heading | Instrument Sans | 52px / 1.06 baseline; up to 62px expansive | 400 | `-0.052em` | Two lines on the approved desktop composition. |
| Hero lead | Instrument Sans | 20px / 1.65 | 400 | default | Maximum width 530px. |
| Primary section heading | Instrument Sans | fluid 44–52px / 1.08 | 400 | `-0.052em` | Shared by every primary section; the capability-story bridge remains deliberately smaller. |
| Section lead | Instrument Sans | fluid 20–22px / 1.65 | 400 | default | Maximum width 820px baseline and 900px expansive; shared by every primary section introduction. |
| Eyebrow | IBM Plex Mono | 16px / 20px | 500 | `0.085em` | Uppercase and signal red. |
| Navigation | Instrument Sans | 15px | 500 | default | Compact, calm, never dominant. |
| Button | Instrument Sans | 15px | 600 | default | Sentence case. |
| Technical line | IBM Plex Mono | 11px / 18px | 500 | `0.055em` | Uppercase. |
| Product metadata | IBM Plex Mono | 10–13px | 500 | restrained | Never so light that it becomes decorative. |

### Responsive type

- Laptop and standard desktop hero: 52px.
- Expansive wide-and-tall desktop hero: fluid to 62px, never beyond it.
- Reduced layout: 44px.
- Phone: 40px with slightly looser tracking (`-0.047em`).
- Phone eyebrow: 14px / 18px.
- Do not enlarge the hero based on width alone. The expansive treatment
  requires both width and height, stays inside the documented cap, and grows
  the proof and spacing with the type so the hierarchy remains coherent.

## 5. Spacing and composition

- Website gutter: fluid 20–64px through `--layout-gutter`; 56px remains the reference at a 1536px CSS viewport.
- Navigation shell: maximum 1504px and intentionally widest at large viewports.
- Hero shell: fluid 1163–1408px when space permits.
- Primary section shell: fluid 1180–1440px through `--section-content`.
- Approved desktop columns: flexible copy column plus a fluid 570–720px visual column.
- Approved column gap: fluid 72–112px.
- Hero heading to lead: 44px.
- Lead to actions: 38px.
- Actions to technical line: 43px.
- Atmospheric frame: 570 × 530px at the laptop baseline, growing proportionally to 720px wide in the expansive composition, with 45px equal baseline padding.

Responsive sizing follows `ADAPTIVE-LAYOUT.md`. Breakpoints may change a
component's structure, while fluid tokens handle ordinary scaling. There is
no width-only page-scale cliff. The bounded expansive composition starts only
when the viewport is at least 1728px wide and 950px tall and changes a small,
documented set of hero and proof variables.

### Hero vertical composition

- Desktop and landscape-laptop hero layouts fill the usable first screen,
  subtracting the header with stable `svh` units rather than rigid `100vh`.
- Tall displays retain that complete first-screen composition. The bounded
  expansive tier grows important elements modestly, while the remaining area
  stays part of the atmospheric hero rather than revealing the next section.
- Compress internal padding and gaps on short screens before reducing type or
  control sizes.
- Use the compact two-column hero at 900–1100px landscape.
- Keep portrait tablets and phones content-driven and stacked. Never force
  them into a viewport height that crops the proof or makes text overlap.

### Folded-light hero atmosphere

- The approved hero background is the high-resolution asset `assets/hero-folded-light-background-v1.png`, referenced by `--hero-folded-light-background`.
- It starts at the top of the page and continues behind both the transparent navigation and the hero, matching the single continuous composition.
- Preserve the quiet white/copy-safe area on the left and the pearl, mineral, mulberry, and cobalt folds on the right.
- Do not replace this asset with a CSS or inline-SVG approximation. Any future motion treatment must retain the same composition and visual quality and is a separate review step.
- Inner product card: 480 × 440px.
- Desktop header at the top of the page: 82px, borderless, and visually open.
- Primary desktop lockup: 108px wide.

Equal padding is the default for framed product proof. Departures require a content reason, not visual guesswork.

### Folded atmosphere family

The folded-material atmosphere is a recurring Strale brand device, not a
one-off illustration. It connects the hero to explanatory product moments
through the same pearl, mineral, warm-neutral, and cobalt material language.
There are two related compositions:

- **Hero sweep** — the broad `assets/hero-folded-light-background-v1.png`
  composition. It preserves a large copy-safe white field and is reserved for
  major page openings and rare full-width transitions.
- **Folded process plates** — tighter faceted compositions intended to sit
  behind a separate product card or UI surface inside explanatory sections.

| Token | Asset | Primary role |
|---|---|---|
| `--pattern-folded-balanced` | `assets/pattern-folded-balanced-v1.png` | Default process stage; pearl, mineral, and cobalt remain in balance. |
| `--pattern-folded-mineral` | `assets/pattern-folded-mineral-v1.png` | Trust, matching, validation, provider selection, and reliability. |
| `--pattern-folded-cobalt` | `assets/pattern-folded-cobalt-v1.png` | Infrastructure, routing, execution, and technical depth. |
| `--pattern-folded-warm` | `assets/pattern-folded-warm-v1.png` | Requests, human-facing actions, outcomes, and narrative warmth. |

Usage rules:

1. Preserve a quiet area across roughly 40–50% of the plate. The pattern is
   atmosphere and spatial structure, not a competing focal point.
2. Place product UI on a separate floating surface. Do not bake text, controls,
   or the Strale mark into a reusable background plate.
3. Use one tonal variant per section or major frame. Do not mix variants inside
   one composition or use the family as a repeating wallpaper.
4. Use the named raster assets. Do not approximate them with CSS gradients,
   inline SVG, hue rotation, or color filters.
5. Render plates with `background-size: cover` and a reviewed focal position.
   Cropping is acceptable; stretching is not.
6. The folded family sits behind the shared soft-stage system. Borders, radii,
   shadows, and floating UI still resolve from the stage and elevation tokens;
   the artwork does not replace those rules.
7. Add a new variant only when a recurring narrative role cannot be served by
   the four approved plates. Every addition requires a named asset, a token, a
   usage note, and a responsive specimen in `design-system.html`.

The four current How Strale Works raster illustrations established this visual
family but also contain their step-specific UI. New sections should compose the
clean plates with live HTML UI whenever practical, preserving accessibility and
responsive control while retaining the approved atmospheric quality.

### Quiet Material surface stack

Quiet Material is the selected direction for expanding the folded atmosphere
without replacing the approved gradients. It is a composition system, not a
new effect to apply everywhere. Use four layers in order and stop as soon as
the story is clear:

1. **Canvas** — white or a quiet structural surface carries ordinary copy and
   spacing.
2. **Material** — an approved folded raster field adds atmosphere only when the
   composition needs spatial depth.
3. **Semantic frame** — one code-native atmospheric gradient identifies the
   narrative role.
4. **Product proof** — flat or glass HTML UI sits above the atmosphere and
   remains legible, reusable, and responsive.

The gradients remain CSS tokens. Do not rasterise Spectrum, Cobalt, Mineral,
Ember, Dusk, Frost, or Midnight into image backgrounds. Quiet Material raster
assets supply form, light, grain, and copy-safe space; the gradient tokens
supply semantic color and may change independently.

| Approved recipe | Primary role |
|---|---|
| Folded light + Spectrum + light product card | Hero and rare primary product proof. |
| White canvas + Cobalt + flat catalogue board | Tools, catalogue breadth, routing, and infrastructure. |
| White canvas + Mineral + light response card | Trust, validation, matching, provenance, and reliability. |
| White canvas + Midnight + dark code panel | Integration, execution, and real technical proof. |
| Folded light + shared glass tray | Navigation and compact functional overlays. |
| White canvas + Dusk + compact inverse CTA | Orchestration and closing transitions. |

Composition rules:

- Use at most one atmospheric or gradient frame in a standard section.
- Preserve a white-canvas transition between adjacent expressive moments.
- Use one semantic gradient family per composition. Do not mix variants inside
  one frame merely to add color.
- Product rows, tool tiles, cards, code, and response snippets are live HTML/CSS.
  Never bake readable UI, controls, or the Strale mark into a background asset.
- Glass is a functional overlay, not a generic card finish. Reuse
  `--surface-glass`, `--border-glass`, `--shadow-glass`, and `--filter-glass`.
- Near-black and dark folded raster masters shown in the direction reference
  remain provisional until generated as clean, UI-free assets and reviewed in
  responsive crops.
- The specimen matrix in `design-system.html` is the visual source of truth for
  approved layer combinations.

### Editorial rhythm tokens

| Token | Value | Role |
|---|---:|---|
| `--section-space-y` | `92px` expansive, `72px` desktop, `64px` tablet, `48px` phone | Default top and bottom space for a section. Two adjacent standard sections create a `184px` / `144px` / `128px` / `96px` transition. Compact-height laptops may resolve to 48–56px. |
| `--section-space-y-emphasis` | `88px` desktop, `80px` tablet, `64px` phone | Entry or exit emphasis at the start or end of a major page sequence. |
| `--section-eyebrow-gap` | `24px` desktop/tablet, `21px` phone | Eyebrow to heading. |
| `--section-lead-gap` | `24px` | Heading to supporting paragraph. |
| `--section-lead-max` | `820px` baseline, `900px` expansive | Maximum measure for supporting paragraphs in section introductions. Short copy may remain on one line; long copy wraps rather than spanning the content width. |
| `--section-content-gap` | `52px` desktop, `40px` tablet, `32px` phone | Section introduction to its primary proof, illustration, or content. This gap is not compressed by viewport height. |
| `--section-payoff-gap` | `28px` | Main content to a quiet payoff or metadata strip. |
| `--card-padding` | `28px` | Baseline internal padding for standard cards. |
| `--row-height` | `52px` | Baseline compact product-table row. |

Adjacent white-canvas sections share the responsive section edge: `92px` per
side in the expansive tier, `72px` on standard desktop, `64px` on tablet, and
`48px` on phone. Compact-height laptops may use 48–56px so content remains
usable without shrinking controls. The paired transition is therefore 184px,
144px, 128px, or 96px. A named narrative entry or exit may use the emphasis
edge instead. Do not stack legacy one-off margins on top of these tokens.

The desktop How Strale Works scroll story and the closing CTA retain their
special inner compositions, but their outer edges still resolve from
`--composition-section-space`. A final canonical rhythm layer keeps every
eyebrow, heading, supporting paragraph, and primary proof on the shared
24px eyebrow gap (21px on phones), 24px lead gap, and responsive content-gap
sequence.

Whitespace must make the narrative easier to scan, not merely make the page longer. Do not use minimum height to equalize cards when it creates visible dead space. Equal-height grids are appropriate only when content density remains balanced. Product rows and metadata should reuse the 52px row rhythm unless a control or wrapping label genuinely requires more height.

## 6. Shape and depth

| Element | Radius | Depth |
|---|---:|---|
| Buttons | pill | flat |
| Matched route | 12px | flat |
| Soft story stage | 26px | `--shadow-stage-float` |
| Floating product tile | 16px | `--shadow-product-float` inside a soft stage |
| Mineral icon well | 11px | `--shadow-icon-well` |
| Standard product card | 18px | `--shadow-product` only when over atmosphere |
| Elevated atmospheric stage | 24px | `--shadow-atmosphere-float`, `--halo-atmosphere-float`, and a light-catching edge |

Do not add borders or shadows to make an empty layout feel finished. Structure should first come from spacing, type, and tonal surfaces.

### Shared soft-stage primitive

`How Strale Works` establishes the canonical soft-stage treatment for elevated
product storytelling. Reuse the named tokens rather than copying approximate
colors or shadows into individual sections:

| Token | Role |
|---|---|
| `--surface-stage-soft` | The faint mineral-to-white outer stage. |
| `--border-stage-soft` | Fine green-grey boundary around an outer stage. |
| `--border-stage-atmosphere` | Translucent light-catching edge for a colored or patterned stage. |
| `--shadow-stage-float` | Two-part stage elevation: a short contact shadow plus a broad ambient shadow. |
| `--shadow-atmosphere-float` | Three-part directional elevation tuned for dark, saturated, or patterned stages. |
| `--halo-atmosphere-float` | Pale neutral light field behind an atmospheric stage; it improves separation without becoming a border or changing layout. |
| `--surface-product-float` | Translucent near-white product tile placed inside a soft stage. |
| `--border-product-float` | Light-catching edge on a floating product tile. |
| `--shadow-product-float` | Three-part product elevation for nested interface fragments. |
| `--surface-rail-card` / `--border-rail-card` / `--shadow-rail-card` | Capability-carousel aliases of the soft-stage surface, edge, and elevation. They keep every repeated card visually related to `How Strale Works` without duplicating values. |
| `--surface-icon-well` / `--border-icon-well` / `--shadow-icon-well` | Pale mineral icon well shared by process features and capability stories. |

The outer stage and inner product tile are separate depth levels. Match
**perceived elevation**, not identical numeric shadow values: quiet soft stages
use `--shadow-stage-float`, while saturated or patterned atmospheric stages use
`--shadow-atmosphere-float` with `--halo-atmosphere-float` and a light-catching
edge. The neutral halo is paint only: it must not change layout or read as an
outline. Never apply the product shadow to the whole section or add an extra
decorative border.
Capability cards are repeated soft stages: use the rail aliases above, retain
the inset light-catching edge, and leave enough vertical scrollport padding for
both the contact and ambient shadows to remain visible. Do not compress the
ambient layer into a dark strip under the cards.
Icons come from the shared `pi-*` line-icon sprite, use rounded caps and joins,
and remain optically centered inside the mineral well.

## 7. Core component contracts

### Header

- Sticky, white, borderless, and visually quiet at the top of the page.
- After the page begins to scroll, compress into a 56px floating translucent-white glass tray with a 16px radius, backdrop blur, subtle inner highlights, and a restrained neutral shadow. On desktop, cap the tray near 1040px, keep the core destination links visible, and omit the quieter `Developers` and `Sign in` items from this compact state.
- Keep the sticky header's outer layout height stable while changing states; compact and animate only the inner tray so the scroll threshold cannot move underneath the interaction.
- Hide the compact tray after 24px of downward travel and reveal it after 16px of upward travel. Keep it visible near the top of the page, whenever its mobile menu is open, and whenever any navigation control has keyboard focus.
- Use the scroll treatment to improve orientation, not to introduce another expressive surface. Do not add a gradient, saturated fill, or decorative border to the header.
- The logo is smaller than the hero headline and does not become a decorative feature.
- Center navigation is compact.
- Mark the current or hovered in-page destination with one 5px signal-red dot. Orange remains a small navigational signal; it is not a filled tab treatment.
- “Sign in” is quiet; “Start building” is the single primary action.

### Buttons

- Primary: ink background, white text, pill radius.
- Secondary: white background, quiet hairline border, ink text.
- Minimum desktop hero height: 52px.
- Minimum mobile/touch height: 44px.
- Use direct action labels. Avoid vague labels such as “Discover more.”

### Eyebrow

- Mono, uppercase, medium weight.
- Always uses `--signal-red` in the approved light system.
- Names the product category or section; it should not repeat the headline.

### Product-proof frame

- Atmospheric red/ember/blue field outside.
- Legible near-white product surface inside.
- Equal frame padding.
- Product information stays flat and orderly.
- Selected route uses blue mist and gives the tool name more emphasis than the generic label.
- Tiny technical captions use medium mono weight for readability.

## 8. Copy principles

- Explain what Strale gives the user, not how advanced Strale is.
- Prefer concrete verbs: search, research, enrich, validate, connect, route, return.
- Keep the hero headline short enough to read in one glance.
- Use “agent” in the singular when describing one request; use plural only when the meaning is genuinely collective.
- Avoid inflated category language, stacked claims, and unexplained technical acronyms in primary copy.
- Product examples must be plausible and internally consistent.

## 9. Approved motion system

Status: approved for the homepage prototype.

Motion explains product causality and state. It must not be added as ambient decoration.

### Timing and restraint

- Keep interface transitions between 160–260ms and narrative reveals between 600–900ms.
- Keep directional travel subtle: 8–16px maximum. Prefer opacity, clipping, and line growth over scaling or floating.
- Allow only one autonomous repeating motion in a viewport. Other sequences run once when they enter view.
- Tabs and code-language controls remain user-driven. Carousels remain manually navigable; the capability-story rail may auto-roll only under its explicit review-mode conditions below.
- Keep pricing and trust content mostly static so the page retains calm, credible intervals.

### Rotating hero examples

- Hero and workflow motion initialize by default whether the page is opened as
  a local file or through the local review server. Use `?motion=0` only for a
  deliberate static review; reduced-motion preferences always take priority.
- Only the request, matched tool, and result values change; the card geometry and atmospheric frame remain fixed.
- Use three examples that demonstrate different capability families.
- Preserve the causal sequence: clear the previous result, type the request, show `Routing`, reveal the matched tool, reveal result rows in order, then show `Completed`.
- Never display the previous tool or result while a new request is being typed.
- Hold completed states long enough to read before advancing.
- Keep the compact header label focused on the current state. The state label itself may be the pause/play control, but its accessible name and title must communicate the action; do not append visible `Pause`/`Play` text to the state.
- Pause when the product frame is off-screen or the page is hidden.
- Keep the static first scenario when reduced motion is requested.
- Do not use an ARIA live region for the repeating visual demonstration.

### Workflow reveal

- Run once when the workflow cards enter view.
- Grow each vertical connector first, then resolve matching nodes across the three cards in a synchronized horizontal wave.
- Reveal the result bars only after the final tool nodes resolve.
- Pause if the workflow section leaves the viewport during the sequence.
- Pace a complete workflow reveal over roughly 3–4 seconds. Replay only after the user deliberately leaves the section and returns; do not replay on hover.
- Keep all final content visible after the sequence; motion must not be required to understand it.

### Avoid

- Do not use autoplay background video in the homepage narrative. Product-state motion communicates Strale more clearly and loads more predictably.
- Do not use broad parallax, looping floating cards, generic fade-ins on every section, or decorative particle fields.

## 10. Accessibility and behavior

- Body and control text must meet WCAG AA contrast.
- Light-canvas ink tokens must never inherit onto Midnight or another dark atmospheric surface. Use the inverse technical-surface tokens for filenames, statuses, controls, and code.
- Color is never the only state indicator.
- Focus uses the signal-blue treatment defined by `--focus`. On edge-to-edge horizontal rails, use a quiet single-edge cue rather than outlining the entire scroll viewport.
- Touch targets are at least 44px high.
- Respect `prefers-reduced-motion`.
- Responsive layouts must not introduce horizontal overflow.
- Technical text must remain readable; do not use thin weights at 11px.

### Approved second-section pattern

- Use a 44px section heading beneath the 52px hero level.
- Introduce the mechanism with a short orange mono eyebrow and plain-language supporting paragraph.
- Explain multi-step behavior in three flush-left columns on desktop.
- A thin hairline may connect sequential steps when it communicates flow.
- Use signal-red numbered markers for sequence.
- Use `--blue-whisper` to emphasize Strale's routing role without turning the step into a heavy card.
- When routing is explained, distinguish between one capability and a multi-source workflow; Strale must not appear limited to selecting a single tool.
- A small branch diagram may clarify that distinction inside the emphasized routing step, but it must remain subordinate to the step copy.
- Close the process with a quiet mono payoff strip: `ONE ACCESS LAYER · CLEAR PRICING · STRUCTURED RESPONSES`.
- Stack the steps vertically below 800px and convert the connector into a vertical line.

### Approved tools-breadth pattern

- Introduce the catalogue with the orange mono eyebrow `TOOLS`, an outcome-led heading, and one plain-language sentence about the shared connection.
- Use `--atmosphere-cobalt` for the tools and infrastructure frame. Preserve a generous visible perimeter so the blue-to-midnight gradient remains part of the composition.
- The cobalt frame is the single floating atmospheric card. Apply `--shadow-atmosphere-float` and `--halo-atmosphere-float` directly to it, with no border or inset edge highlight; never wrap it in a pale outer card. The near-white catalogue remains the legible product surface inside the blue card.
- Keep elevated section stages on the shared section-content width. Do not widen the process stage independently at large breakpoints; the surrounding negative space is part of the floating treatment.
- In the expansive wide-and-tall tier, increase the catalogue's internal
  height rather than stretching its width beyond the shared shell: rows may
  grow from 48px to 60px, technical slugs from 11px to 13px, and the frame and
  catalogue header receive proportionally more padding. Primary section type
  follows the shared 44–52px heading and 20–22px lead scale.
- Place the catalogue on one near-white inset surface; the atmospheric color frames the product and does not sit behind body text.
- Group representative real capability slugs by user-recognizable job: search and research, company data, validation, risk and compliance, and web intelligence.
- Use capability slugs rather than provider logos. This communicates breadth without implying that Strale is a directory of vendor integrations.
- Do not publish a fixed capability count in this visual. Counts are a drift-prone platform fact and must come from the canonical data surface when implemented dynamically.
- Use medium mono labels and compact, readable rows. Category names use signal red; capability slugs remain neutral. Grouped capability panels use `--surface-strong` so they remain distinct from the near-white catalogue without looking selected.
- Close the frame with the supported connection methods and one catalogue action.
- Reflow the five desktop groups to three, two, and one column as space narrows. Preserve the hierarchy and avoid horizontal scrolling.

### Approved capability-story rail

- Place the capability-story rail immediately after the Tools section. The Tools catalogue establishes breadth; the rail then turns that breadth into concrete, scannable examples before Workflows.
- Reuse the shared section-lead typography and measure. The bridge position is expressed by the 36px heading and compact section rhythm, not by shrinking its supporting copy below the other section introductions.
- Treat these as editorial product stories, not testimonials and not a second catalogue. Each card leads with one plain-language outcome, shows one compact product fragment, and closes with an orange mono category above a real capability slug. The metadata belongs at the bottom so the outcome remains the entry point and orange never competes with the upper atmospheric hotspot.
- Use one consistent portrait-card size on a quiet warm-white surface with a fine neutral hairline. Capability cards are separate editorial objects: leave a generous gap between them and use only a restrained contact shadow. Do not place the folded atmospheric pattern or the How Strale Works stage shadow on every portrait card; repeated stage effects merge into a single background band and make the rail feel dense.
- Place each product illustration on a near-white inset with a fine border and no drop shadow. The outer card supplies separation; a second floating shadow inside every card creates unnecessary depth and visual noise.
- Every visible capability receives an individually composed product illustration. Share primitives—spacing, radii, line icons, icon wells, rows, chips, timelines, scores, graphs, certificates, and document surfaces—but choose and compose those primitives for the capability's actual job. A small set of generic templates is not the art-direction model.
- Use restrained navy, cobalt, mineral green, coral, and muted violet accents inside the illustrations. Accent color signals information type or state; it does not tint the full outer card. Green remains available for success, but it is not the default accent for every capability.
- Do not add a universal progress bar, generic `Ready` label, or repeated status treatment. Show progress, completion, review, or confidence only where that information is meaningful to the illustrated capability.
- Reuse the `How Strale Works` mineral icon wells and shared `pi-*` line icons. Do not introduce a second icon family or approximate the icons with text glyphs.
- Product content creates the editorial cadence rather than surface color. Every capability card uses the same quiet outer atmosphere and elevation hierarchy so the rail reads as one coherent product family and individual capabilities remain equally weighted.
- The review prototype may show a curated set of 30 real capabilities to communicate meaningful breadth. Sequence cards to reveal different jobs and surface roles progressively; category grouping may inform the order, but it must not create visually repetitive chapters.
- Category text stays orange on every card and sits above the slug at the bottom. Heading, product fragment, category, and slug occupy shared vertical bands so those elements align across the entire rail even when content lengths differ.
- Typography is invariant across every surface: Instrument Sans for outcome headings, labels, values, and product UI; IBM Plex Mono only for the orange category, capability slug, and clearly technical input strings. Surface color must never change the type family, weight, size, or spacing.
- Keep the surrounding section on the white canvas. The balanced folded atmosphere belongs inside the cards and must not become another full-width section background.
- Do not use provider logos, customer language, quotation marks, fixed capability counts, or claims that are not supported by the product. Representative values remain clearly illustrative.
- Crop the horizontal rail at both viewport edges so it feels continuous, but do not overlay previous/next arrows. The rail is natively horizontally scrollable at every viewport: touch swipe on phones and tablets, two-finger horizontal trackpad scrolling on laptops, optional mouse/pen drag, and left/right arrow keys while the rail is focused. Preserve visible keyboard focus, but visually hide the native scrollbar; the cropped edge, continuous movement, descriptive label, and Pause control provide the discovery cues without adding controls over the cards.
- Render the motion control as an always-visible, quiet 44px pill with a standard filled-bar pause icon and the label `Pause`. When paused, replace it with a standard play triangle and the label `Resume`, and use the blue-whisper functional surface to make the state change legible. Do not use typographic approximations such as `Ⅱ` or `▶`; do not borrow orange (editorial emphasis) or green (success) for this transport control. Hover may add a subtle lift and shadow, while `:focus-visible` uses the shared focus ring.
- Auto-roll by default unless `?motion=0` is present or reduced motion is requested. Observe the scrollable surface rather than the full section so activation is stable even when section copy or spacing changes. Pause while the surface is offscreen, the hero's autonomous proof is still active, or the document is hidden. This preserves the rule that only one autonomous repeating motion may occupy a viewport. The rail never uses CSS scroll snapping: continuous motion and native manual scrolling must preserve the exact current position without a browser-induced jump.
- Scale marquee duration with catalogue length. The 30-card review rail uses a deliberately slow 132-second loop so individual cards remain readable.
- Hover never pauses or repositions the rail. Direct horizontal scrolling, dragging after a small movement threshold, touch panning, or keyboard interaction holds autonomous movement briefly and resumes from the exact current position; clicking or tapping solely to focus must not pause it. Only the explicit Pause control creates a latched pause. Ordinary vertical page scrolling must never stop the rail. Keep the original set available to assistive technology and mark the duplicated loop set `aria-hidden`.
- Use a 36px desktop heading so this bridge remains subordinate to the 52px hero and the 44px primary narrative sections.

### Approved workflow pattern

- Introduce composed outcomes with the orange mono eyebrow `WORKFLOWS`, a direct heading, and one sentence explaining that Strale can coordinate several tools behind one request.
- Keep the section on the white canvas so atmospheric frames remain concentrated rather than repeating in every section.
- Present three equal workflow cards using the shared soft-stage treatment: `--surface-stage-soft`, `--border-stage-soft`, `--radius-stage`, and `--shadow-stage-float`. This gives them the same pale mineral-white surface and floating depth as How Strale Works. Retain the slim light-blue-to-midnight top rule to identify the family without turning the entire section into a colored field.
- Each card names an outcome, shows representative real capability slugs as a visible vertical chain, and closes with one structured-result payoff on `--mint-whisper`.
- Workflow chains are illustrative, not exhaustive. Every visible slug must exist in the canonical capability manifests and belong to that solution's current definition.
- Keep connectors thin and functional. Capability nodes are white circles on a mineral-green path; the result marker always appears with result text.
- Use canonical solution names when a card maps directly to a named Strale solution. Do not introduce fixed step or capability counts into the visual.
- Stack workflow cards below 800px. Preserve card hierarchy and readable connector spacing without horizontal scrolling.

### Approved integration pattern

- Introduce integration with the orange mono eyebrow `INTEGRATION`, a direct heading, and one sentence that names the supported access routes without claiming universal framework coverage.
- Keep the section on the white canvas. Concentrate `--midnight` inside the code surface rather than turning the entire section dark.
- Use primary tabs for distinct integration routes: SDK and API, MCP, agent frameworks, and A2A. The selected route uses the filled `--blue-whisper` treatment.
- Use secondary tabs only when a route genuinely has variants, such as TypeScript, Python, and cURL. Place these controls inside the Midnight code header and style them as compact text with a subtle light-blue underline; never repeat the filled primary-tab treatment.
- Treat languages and connection protocols as different levels of hierarchy. Do not present TypeScript beside MCP as though they are equivalent integration types.
- Do not repeat the selected route as an orange kicker inside the content panel. The section eyebrow is the sole orange heading accent; small signal states may still use orange where functionally meaningful.
- Every visible package name, endpoint, method, and example must be reconciled with the corresponding repository implementation or public package documentation before publication.
- Pair a short explanation and install command with one legible example. The code panel is product proof, not decorative texture; code must remain readable and copyable when implemented in the application.
- Let the explanatory column end naturally after its install command. Do not pin secondary controls to the bottom or force an equal-height empty column; keep the code surface compact enough to avoid ornamental whitespace.
- Use accessible tab semantics, arrow-key navigation, visible focus, and a useful static default state.
- Stack the explanation above the code surface below 800px. Primary tabs may scroll within their own row on narrow phones, but the page itself must not overflow horizontally.
- Close with a quiet mono payoff row rather than another atmospheric frame.

### Approved trust and traceability pattern

- Keep the section on the white canvas. Use Frost, Mint, and pale blue only inside compact proof and metadata surfaces; do not introduce another full atmospheric frame.
- Lead with the plain-language promise `Every result comes with its receipts.` and support it with the actual response concepts implemented by Strale: `transaction_id`, `status`, `capability_used`, `price_cents`, `latency_ms`, `provenance.source`, `provenance.fetched_at`, and `meta.audit`.
- Pair one compact response proof with four short explanations inside the shared soft-stage treatment: `--surface-stage-soft`, `--border-stage-soft`, `--radius-stage`, and `--shadow-stage-float`. The outer trust container should match the pale mineral-white surface and floating depth of How Strale Works, while the proof remains more prominent than the annotations.
- Product examples may use representative values for visual review, but production values must come from the response. Never hardcode a capability price, latency, timestamp, provider, or transaction identifier as a general product fact.
- Use `--mint-whisper` for provenance and audit context, and `--blue-whisper` for quiet execution or price metadata. Green dots always appear with text.
- Stack the proof above the annotations below 800px; stack the four annotations into one column on narrow phones.

### Approved pricing pattern

- Keep the section on the white canvas. Give each pricing card the shared soft-stage treatment: `--surface-stage-soft`, `--border-stage-soft`, `--radius-stage`, and `--shadow-stage-float`. This keeps the cards consistent with the approved floating product surfaces without turning pricing into one large atmospheric block.
- Show the per-call price before execution and separate the commercial model from the payment rail. The left proof explains clear usage pricing; the right stack explains x402 machine payments and the Stripe-funded prepaid balance.
- A thin Spectrum rule may identify the overall pricing proof. Use blue for x402 and green for Stripe only as compact semantic rails or labels, not as filled card backgrounds.
- Product-value rows use `--surface-strong`, the shared 52px row rhythm, and medium mono values. Successful state always includes text as well as a green dot.
- On desktop, stretch the left pricing proof to match the full height of the two-card payment stack, including the gap between those cards. Below 800px, let all three cards return to their natural stacked heights.
- Keep action labels on one line at desktop sizes. Stack cards below 800px and preserve 44px minimum touch targets.
- Any published capability price must come from the canonical platform data surface; representative prototype values are not general claims.

### Approved closing CTA and footer pattern

- Use one Spectrum atmospheric frame to close the page and repeat the core promise in its shortest form. Elevate that frame with `--shadow-atmosphere-float` and the paint-only `--halo-atmosphere-float`, preserving the gradient itself as the single card surface.
- On a dark expressive field, use inverse text. The primary action is a white pill with ink text; the secondary action is a restrained transparent outline with inverse text.
- Keep the CTA compact: two copy columns, one action row, and a quiet technical payoff. Do not add another product UI card inside it.
- The footer keeps its compact Strale lockup and clear product, developer, and company link columns on a full-bleed flat Ink surface (`--ink`). Use the inverse text and hairline tokens, and render the lockup in white. Do not wrap the footer content in another card.
- Right-align the three footer link columns on desktop to create a clean counterweight to the left-aligned brand block; return them to left alignment in the stacked mobile layout.
- Preserve a visible white-canvas transition between the closing CTA card and the dark footer surface: use the shared section-space token below the CTA (72px on desktop and 48px on phones), then retain the footer's compact internal top padding.
- Do not repeat `Start building` in the footer; the closing CTA already carries the page's final primary action.
- Link destinations must be real before publication. Placeholder fragment links are permitted only in the local review prototype.

## 11. Change control

When a new section is approved:

1. compare it with these principles;
2. reuse existing tokens where the visual role matches;
3. add a token only when a genuinely new reusable role appears;
4. mark the new rule as approved or provisional;
5. update both `assets/design-tokens.css` and this document;
6. verify the shared token change against the approved hero before accepting it.

Do not silently change a locked token to solve one local composition. Local exceptions must be explicit and reviewed first.
