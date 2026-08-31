# Strale web design system

Status: working visual canon for the local website prototype, 25 August 2026.

This system captures the choices approved during the design review. It should be used as a constraint, not as permission to redesign established sections.

## 1. Brand character

Strale should feel like premium technical infrastructure: calm, precise, highly legible, trustworthy, and quietly expressive. The site uses generous whitespace and simple language, then concentrates expressive color inside purposeful product and storytelling frames.

The design should not feel like a generic developer template, a dense dashboard, or a decorative gradient gallery. Product clarity comes first. Visual expression should reinforce the product model: one access layer, many tools, structured and traceable results.

## 2. Core principles

1. **Near-white is the default canvas.** Color is concentrated rather than spread across every section.
2. **One dominant idea per section.** A section must be understandable from its eyebrow, heading, and primary visual.
3. **Large type, controlled measure.** Headings are prominent but should not overwhelm the viewport or wrap awkwardly.
4. **Mono type communicates infrastructure.** Use it for eyebrows, slugs, labels, status metadata, and compact payoff lines—not for normal prose.
5. **Sans type communicates the product.** Use it for headings, navigation, body copy, buttons, and product UI.
6. **Expressive color belongs inside frames.** Gradients and dark atmospheric colors are for hero/product frames, selected capability cards, the closing CTA, and other deliberate focal points.
7. **Motion must explain.** It may show routing, breadth, or structured completion; it must not be ornamental, rushed, or layout-shifting.
8. **Whitespace is structural.** Section spacing must establish clear boundaries without creating dead zones.

## 3. Canonical typography

### Families

- Primary sans: `Instrument Sans`, fallback `Arial, sans-serif`
- Technical mono: `IBM Plex Mono`, fallback `Consolas, monospace`

Do not mix in additional display or code families on the website.

### Desktop scale

| Role | Size | Line height | Weight | Tracking |
|---|---:|---:|---:|---:|
| Hero heading | 52px | 1.06 | 400 | -0.052em |
| Section heading | 44px | 1.12 | 400 | -0.04em |
| Lead/body-large | 20px | 1.65 | 400 | normal |
| Eyebrow | 16px | 20px | 500 | 0.085em |

The 52px hero size was explicitly preferred during review. Keep the hero heading to two lines at the primary desktop review width.

### Type usage

- Eyebrows: IBM Plex Mono, uppercase, Signal Red.
- Headings: Instrument Sans, regular weight, tight tracking.
- Body: Instrument Sans, regular, secondary ink.
- Buttons and nav: Instrument Sans, medium.
- Capability slugs and metadata: IBM Plex Mono, medium where needed for legibility.
- Capability-card narrative headings: Instrument Sans consistently across every card.

## 4. Canonical color tokens

### Foundation

| Token | Value | Use |
|---|---|---|
| Canvas | `#ffffff` | Main page background |
| Surface | `#f8f8f5` | Subtle neutral panels |
| Surface Strong | `#f1f1ed` | Tool rows and stronger neutral separation |
| Warm Porcelain / Surface Warm | `#f2f0ec` | Calm explanatory section backgrounds and light capability cards |
| Ink | `#11110f` | Primary text |
| Ink Secondary | `#5f605c` | Body and supporting text |
| Hairline | `#ddddd7` | Borders and dividers |

### Brand signal

| Token | Value | Use |
|---|---|---|
| Signal Red | `#f2381b` | Canonical eyebrow, separators, small dots, step numbers |
| Signal Red Inverse | `#ff7658` | Signal text on dark surfaces when needed |

`#f2381b` replaces the earlier muted orange. Treat the muted version as retired. Signal Red should remain a controlled accent; it is not a general card background or body-text color.

### Product and trust colors

| Token | Value | Use |
|---|---|---|
| Signal Blue | `#164076` | Selected states and deeper blue surfaces |
| Atmospheric Blue | `#315e8b` | Expressive blue cards |
| Midnight | `#0d223b` | Code panels and deep technical surfaces |
| Blue Mist | `#e5eff9` | Selected tabs and matched-tool fields |
| Blue Whisper | `#f0f6fc` | Very light informational surfaces |
| Border Blue | `#b8cee4` | Blue control outlines |
| Mineral | `#246b5a` | Trust and validation accents |
| Mineral Light | `#8fd5a6` | Light trust accents |
| Deep Pine | `#12382f` | Deep green surfaces |
| Mint Whisper | `#edf6f2` | Light success surfaces |
| Border Mint | `#d7e6df` | Trust/success outlines |
| Success | `#17795d` | Status dots and success text |

### Technical dark-surface tokens

- Ink Inverse: `#f3f6f9`
- Ink Inverse Secondary: `#aebdcd`
- Accent Blue Inverse: `#9bc9f5`
- Border Midnight: `#1d3958`
- Hairline Inverse: `rgba(229,239,249,.24)`
- Elevated Midnight Surface: `rgba(22,64,118,.18)`
- Success Bright: `#23a77e`
- Code Keyword: `#66aaff`
- Code Method: `#ef8c52`
- Code String: `#b8df7b`
- Code Muted: `#96a9bd`

## 5. Expressive surfaces

Use these only for purposeful frames and cards. Do not place a colored or gradient background behind every section.

- Spectrum: `linear-gradient(138deg, #b6321c 0%, #65231e 34%, #253047 66%, #12345c 100%)`
- Mulberry: `linear-gradient(145deg, #6f3046 0%, #51263a 50%, #301d2d 100%)`
- Cobalt: `linear-gradient(138deg, #3b6d9c 0%, #235486 44%, #143c6c 70%, #0d2b52 100%)`
- Dusk: `linear-gradient(138deg, #431d18 0%, #251a1d 36%, #151b24 64%, #091d31 100%)`
- Midnight: `linear-gradient(138deg, #263a4a 0%, #162c3c 42%, #0d2231 70%, #061721 100%)`
- Mineral: `linear-gradient(138deg, #2d8d73 0%, #1d7159 42%, #10513f 72%, #08392f 100%)`
- Frost: a very light blue-white atmospheric surface; use sparingly.
- Mint: a very light green-white atmospheric surface; use sparingly.

### Capability-carousel palette

The carousel uses exactly five dark color families plus one light family:

1. Dusk / deep ember
2. Cobalt blue
3. Mineral green
4. Mulberry
5. Midnight / deep navy
6. Warm Porcelain light card

Do not add patterns. Earlier pattern attempts were rejected as insufficiently refined. Avoid too many light cards. The rhythm should feel mostly dark, with light cards acting as pauses. Color does not need to map rigidly to category; the category label and product content carry semantics, while the sequence is composed for visual rhythm.

## 6. Spacing and layout tokens

### Base spacing scale

`4, 8, 12, 16, 20, 24, 28, 32, 40, 44, 48, 56, 72px`

### Semantic spacing

| Token | Value |
|---|---:|
| Standard section vertical padding | 72px |
| Emphasis section vertical padding | 88px |
| Eyebrow to heading | 24px |
| Heading to lead | 24px |
| Heading block to primary content | 52px |
| Primary content to payoff line | 28px |
| Standard card padding | 28px |
| Standard compact row height | 52px |

### Widths

- General content: `min(1280px, calc(100% - 112px))`
- Hero content: `min(1163px, calc(100% - 112px))`
- Tablet side space: approximately 48px
- Mobile side space: approximately 40px, reduced further only when needed for fit

### Spacing behavior

- The hero should fit comfortably in the primary review viewport.
- Do not let payoff strips create huge empty gaps before the next section.
- Do not collapse sections so that an eyebrow visually touches the previous frame.
- Use either a background change, a hairline, or sufficient whitespace to make section boundaries obvious.
- Interior vertical and horizontal padding should feel optically balanced; identical numeric values are a starting point, not an absolute rule.

## 7. Shape, borders, and shadows

- Pill/control radius: `999px`
- Route/control-card radius: `12px`
- Standard card radius: `18px`
- Atmospheric frame radius: `24px`
- Product shadow: `0 18px 48px rgba(11,24,43,.18)`
- Atmospheric shadow: `0 18px 44px rgba(22,64,118,.08)`
- Focus ring: `0 0 0 2px #fff, 0 0 0 4px #164076`

Borders are quiet hairlines. Large shadows should feel diffused rather than floating or glossy.

## 8. Navigation

- Sticky navigation is approved.
- At the top of the hero it is visually transparent/quiet so the Folded Light artwork continues behind it.
- On scroll it becomes a rounded, lightly translucent white bar with blur and a soft shadow.
- Desktop layout: brand, centered primary links, sign-in and primary CTA.
- Current reference dimensions: 82px minimum height at top; approximately 64px after scroll.
- Nav link gap: approximately 28px.
- Logo must be visually aligned with the nav text and CTA, not merely mathematically centered.
- The reduced logo size is intentional. Do not restore the earlier oversized mark.

## 9. Buttons and controls

- Primary CTA: black pill, white text, right arrow.
- Secondary CTA: white/transparent pill, hairline border, black text.
- Standard minimum control height: 46px.
- Hero controls: approximately 52px minimum height.
- Pause/Resume in the carousel must appear as a real pill button, with the standard pause and play icons, hover/focus states, and an accessible name.
- Carousel arrows were rejected. Do not restore them.

## 10. Hero section — locked direction

### Copy

- Eyebrow: `DATA INFRASTRUCTURE FOR AI AGENTS`
- Heading: `Give your agent the tools they need.`
- Body: `Search the web, research companies, enrich leads and validate data—without integrating every provider separately.`
- Primary CTA: `Explore tools`
- Secondary CTA: `Read the docs`
- Payoff: `HTTP API · MCP SERVER · PAY PER SUCCESSFUL CALL`

### Layout

- Two-column desktop layout: copy left, product illustration right.
- Current reference grid: flexible left column, 570px product column, approximately 72px gap.
- Hero vertical padding is approximately 98px top and 62px bottom beneath the navigation.
- Keep the heading to two lines at the main desktop width.

### Folded Light background

- Use the high-quality raster artwork, not a crude CSS approximation.
- Artwork extends from the top of the page behind the navigation through the hero.
- It must preserve large quiet white areas behind the copy and concentrate folded color toward the right and lower edge.
- Source asset: `C:\Users\pette\Projects\brandkit-lab-strale-design\experiments\strale-website\hero-v1\assets\hero-folded-light-background-v1.png`
- Current body treatment: no-repeat, center top, `100% auto`.
- Animation of the folds is a future exploration only. Static image quality comes first.

### Product illustration

- Spectrum outer frame with a near-white inner request card.
- Matched-tool field uses Blue Mist and a slightly stronger blue slug pill.
- Results use green status dots.
- The product illustration and its copy are currently locked.

### Hero motion

- Cycle through representative requests and results.
- Typing must not change the card dimensions or disturb the bottom whitespace.
- Keep prompts concise enough to remain one line where possible; the Spotify prompt was shortened to `Look up Spotify AB using 556703-7485.`
- Do not display the word `Pause` inside the request-card status. Status should say `Routing` or `Completed` only.
- Honor `prefers-reduced-motion` and provide an accessible pause mechanism outside the product status if needed.

## 11. Capability carousel — locked direction

- This is section two, directly below the hero.
- Heading: `See what your agent can do.`
- Supporting copy: `Real tools for search, company data, validation, risk and research.`
- Show at least 30 real capabilities.
- Cards use the six-family palette defined above.
- No background patterns.
- Card title/content use Instrument Sans; category and slug use IBM Plex Mono.
- Category sits near the bottom, directly above the slug.
- Carousel continuously auto-scrolls and also supports native touch and trackpad scrolling.
- Manual interaction must not produce snapping, jumping, or a broken hover stop.
- The scrollbar is visually hidden.
- Pause/Resume is explicit and accessible. Focus alone must not stop the carousel.
- `prefers-reduced-motion` may disable automatic movement while preserving manual scrolling.

## 12. “How Strale works” section

### Background

Approved: full-width Warm Porcelain (`#f2f0ec`) with no gradient.

### Copy

- Eyebrow: `HOW STRALE WORKS`
- Heading: `One request. Strale handles the rest.`
- Body: `Your agent asks for an outcome. Strale selects the right capability—or runs a multi-source workflow—handles the providers, and returns a structured result with its source.`

### Latest approved visual direction

A horizontal three-stage flow:

1. Ask for the outcome — a compact request panel.
2. Strale routes the request — a larger central router showing `ONE CAPABILITY` and `MULTI-SOURCE WORKFLOW` branches.
3. Get a usable result — a completed result panel with source, status, and audit trail.

The stages are joined by a fine horizontal line with small route/complete controls. Step numbers are Signal Red circles. Product panels remain mostly white with subtle borders and restrained blue routing accents.

Reference image: `C:\Users\pette\AppData\Local\Temp\codex-clipboard-934c98ef-66d3-46f5-a516-d5a83b1ba324.png`

This visual was chosen, but implementation was stopped before it was built. Treat it as approved direction, not as current code.

## 13. Other established section patterns

### Tool breadth catalogue

- Cobalt atmospheric outer frame.
- White inner catalogue panel.
- Five category columns with Warm Porcelain/strong-neutral tool groups.
- Compact mono capability slugs.
- Bottom payoff: HTTP API / MCP Server and an `Explore all tools` link.

### Workflows

- White section, three Warm Porcelain workflow cards.
- Thin green top rule.
- White circular nodes connected by a green line.
- Mono capability slugs and a light mint structured-result strip.
- Motion should reveal the route slowly enough to understand and should be replayable.

### Integration

- White section.
- Light-blue primary tabs: SDK & API, MCP, Agent Frameworks, A2A.
- Navy code panel with high-contrast code colors.
- Language choices: TypeScript, Python, cURL.
- Do not use identical visual treatment for both tab levels.

### Trust and traceability

- Warm neutral outer container.
- Left: a clear Strale response/receipt.
- Right: provenance, visible cost, execution, and audit-trail timeline.
- Use the standard row height and section typography; do not let this section become disproportionately tall.

### Pricing

- White main cards, subtle top color rules.
- Grey/Warm Porcelain table for capability, price, and status.
- Explicitly mention x402 machine payments and Stripe-funded prepaid balance.

### Closing CTA and footer

- Closing CTA may use the Spectrum atmospheric surface.
- Footer returns to white.
- Footer logo uses the same deliberately reduced visual scale as the navbar.

## 14. Motion system

Use a small number of clear behaviors:

1. Hero request cycles: slow, stable, readable.
2. Capability carousel: continuous ambient motion with direct manual control.
3. Workflow route: deliberate explanatory sequence; replay on explicit interaction rather than frantic automatic repetition.
4. Sticky navigation: restrained size/surface transition on scroll.
5. Section entrances: optional low-amplitude fade/translate, only if they improve pacing.

Avoid parallax overload, continuous animation in every section, hover transforms that shift surrounding layout, and any motion that interrupts reading.

## 15. Accessibility rules

- Maintain WCAG-appropriate contrast; never put black text on a dark blue surface.
- Dark cards use inverse text. Light cards use Ink.
- Buttons and tabs must be keyboard operable with visible focus.
- Pause/Resume state must be announced accurately.
- Honor `prefers-reduced-motion`.
- Do not encode status using color alone; retain text labels.
- Ensure carousel cards remain reachable without trapping horizontal or vertical scrolling.

## 16. Design review checklist

Before accepting a section, verify:

- Does its eyebrow use canonical Signal Red and mono type?
- Are heading, lead, and content gaps using the semantic spacing tokens?
- Is the heading measure controlled and wrapping intentional?
- Does the section have one clear visual idea?
- Is color purposeful rather than repetitive?
- Are all card typefaces and roles consistent?
- Can a user tell where the section starts and ends?
- Does motion explain something, remain readable, and respect reduced motion?
- Are controls visibly interactive and keyboard accessible?
- Does the section remain balanced at desktop, tablet, and mobile widths?

