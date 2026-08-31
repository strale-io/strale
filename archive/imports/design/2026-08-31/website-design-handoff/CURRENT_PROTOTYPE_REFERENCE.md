# Current prototype reference

Captured: 25 August 2026.

## Exact review target

`http://127.0.0.1:4180/index.html?motion=1&review=20260825-folded-light-image-v3`

The current local server uses port 4180. If the URL does not load in a new session, start a local static server from the prototype directory and preserve the same relative asset paths.

## Source files

- HTML: `C:\Users\pette\Projects\brandkit-lab-strale-design\experiments\strale-website\hero-v1\design-system.html`
- Tokens: `C:\Users\pette\Projects\brandkit-lab-strale-design\experiments\strale-website\hero-v1\assets\design-tokens.css`
- Hero background: `C:\Users\pette\Projects\brandkit-lab-strale-design\experiments\strale-website\hero-v1\assets\hero-folded-light-background-v1.png`

The work is a static combined HTML prototype, separate from the production frontend implementation.

## Current navigation

- Sticky.
- Transparent/quiet at the top of the hero.
- Rounded translucent white treatment after scrolling.
- Small Strale logo, centered nav links, `Sign in`, and black `Start building` CTA.
- Current links: Tools, Use cases, Developers, Pricing, Docs.

## Current section order

1. Hero
2. Capabilities carousel
3. How Strale works
4. Tools breadth catalogue
5. Workflows
6. Integration
7. Trust & traceability
8. Pricing
9. Closing CTA
10. Footer

## Current implementation status by section

### 1. Hero — implemented and currently locked

- Folded Light raster background extends behind the navigation and hero.
- Copy and right-side product illustration are approved.
- 52px desktop heading.
- Animated request examples.
- Known historical issues already addressed in the working direction: no `Pause` text inside product status; concise Spotify prompt to avoid layout shift.

Do not redesign this section unless the user explicitly reopens it.

### 2. Capabilities carousel — implemented and currently locked

- 30+ capability cards.
- Five dark color families plus one Warm Porcelain light family.
- No background patterns.
- Continuous automatic movement plus native touch/trackpad scrolling.
- Pill Pause/Resume control.

This section had repeated regressions involving static motion, visible scrollbars, focus outlines, hover jumps, and accidental stopping. Any future edit near its CSS or JavaScript must verify the carousel in the browser rather than assuming it still works.

### 3. How Strale works — current implementation is superseded visually

The current HTML still uses the older three-step layout with a highlighted central step. The background has been set toward Warm Porcelain during exploration.

The newer preferred image is the horizontal request → router → completed result design:

`C:\Users\pette\AppData\Local\Temp\codex-clipboard-934c98ef-66d3-46f5-a516-d5a83b1ba324.png`

The user asked to implement that visual, then immediately said `stop`. No implementation should be assumed. This is the clearest next design task, but reconfirm before editing if the new chat begins with a different priority.

### 4. Tools breadth catalogue — implemented

- Cobalt frame.
- White catalogue.
- Warm neutral tool groups.
- Category headers and capability slugs.

### 5. Workflows — implemented

- Three cards: vendor risk assessment, lead enrichment & qualification, and UK KYB Complete.
- Warm neutral card surfaces, green route nodes, structured output strips.
- Animation was deliberately slowed and made more explanatory in concept; verify actual timing before making claims.

### 6. Integration — implemented

- SDK & API, MCP, Agent Frameworks, A2A.
- TypeScript, Python, and cURL choices.
- Navy code panel.

### 7. Trust & traceability — implemented

- Response receipt plus provenance/cost/execution/audit explanation.
- Review concern was excessive height; sizing was tightened to align with other sections.

### 8. Pricing — implemented

- Clear per-call pricing table.
- x402 machine payments.
- Stripe prepaid balance.

### 9–10. Closing CTA and footer — implemented

- Spectrum closing CTA.
- White footer with reduced-size Strale logo.

## Current exact hero copy

- `DATA INFRASTRUCTURE FOR AI AGENTS`
- `Give your agent the tools they need.`
- `Search the web, research companies, enrich leads and validate data—without integrating every provider separately.`
- `Explore tools`
- `Read the docs`
- `HTTP API · MCP SERVER · PAY PER SUCCESSFUL CALL`

## Current exact section-two copy

- `CAPABILITIES`
- `See what your agent can do.`
- `Real tools for search, company data, validation, risk and research.`

## Current exact section-three copy

- `HOW STRALE WORKS`
- `One request. Strale handles the rest.`
- `Your agent asks for an outcome. Strale selects the right capability—or runs a multi-source workflow—handles the providers, and returns a structured result with its source.`

## Important visual references

- Folded Light hero target: `C:\Users\pette\AppData\Local\Temp\codex-clipboard-5c9b98f7-2715-441c-8c79-29627c3d1a05.png`
- Current Folded Light transition screenshot: `C:\Users\pette\AppData\Local\Temp\codex-clipboard-9ed2fdb4-96bb-479f-afea-2aa4addcf974.png`
- Preferred How Strale works design: `C:\Users\pette\AppData\Local\Temp\codex-clipboard-934c98ef-66d3-46f5-a516-d5a83b1ba324.png`
- Six-color capability carousel reference: `C:\Users\pette\AppData\Local\Temp\codex-clipboard-66aff59b-1b2d-4b9f-b569-ca73611bafd8.png`

## What this prototype is not

- It is not production.
- It is not the final application integration.
- It is not authorization to deploy or update infrastructure.
- It is not evidence that every link, route, or responsive state is complete.

