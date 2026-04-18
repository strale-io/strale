# Handoff: Frontend v2 Redesign — Session 1

**Intent:** Initiate frontend redesign project — design system foundations, tooling decisions, visual specs.
**Date:** 2026-04-16
**Notion Journal:** https://www.notion.so/34467c87082c81b781e5e960234ab63b

---

## What was done

Full design system foundation for the Strale frontend v2 redesign. Eight files produced in `strale-frontend/`:

1. **`design-inspiration/inspiration.md`** — 25 screenshots walked through with Petter. Sites: StackAI, Paygentic, Hyperagent, Mintlify, OpenAPI. Consolidated direction: monochrome + one accent, generous whitespace, bg-color shifts between sections, bespoke line illustrations, stacked cards, real product UI.

2. **`design-system/_research/tooling-2026.md`** — 16 stack decisions, all locked:
   - Next.js 15 (App Router) for v2
   - Tailwind CSS v4 (fresh tokens)
   - Radix UI + hand-built components (NOT shadcn/ui)
   - Inter + JetBrains Mono + Mona Sans (A/B)
   - lucide-react, Motion v11, Shiki v1, Biome, pnpm
   - v2 lives in `strale-frontend/v2-app/`
   - Deploy to Railway (consolidated)

3. **`design-system/01-foundations.md`** (v1.1) — Brand principles, visual/verbal rules, forbidden/required patterns, decision framework. Three corrections applied during review:
   - Broadened audience (smart professionals, not just staff engineers)
   - Two-tier data strategy (marketing = curated/rounded, product = live)
   - Two-tier color (primary accent for interaction + 3-4 muted secondaries for decoration)

4. **`design-system/02-color.md`** — Full color system. Warm gray scale, two accent candidates (forest green vs deep teal for A/B), four secondary decorative tones (Sand, Sage, Honey, Mist), semantic states, SQS grade mapping, code palette (4 tokens), contrast compliance.

5. **`design-system/03-typography.md`** — Inter (body) + JetBrains Mono (code) + Mona Sans (display A/B candidate). 1.250 ratio scale, four weights (400/500/600/700), full context-to-token mapping, font loading strategy.

6. **`design-system/08-code-blocks.md`** — Two modes (marketing = styled illustration, product = functional). Custom 4-token Shiki theme "Strale Quiet". Anatomy specs for standalone blocks, request/response pairs, inline code, interactive playground.

7. **`design-system/09-sqs-visualization.md`** — Five-level progressive disclosure:
   - L0 (Ambient): homepage hero — quality mentioned, no score
   - L1 (Chip): catalog/cards — grade circle + SQS + number
   - L2 (Card): capability detail — adds QP/RP, trend, latency, source
   - L3 (Full): quality page — factor breakdowns, test history, limitations
   - L4 (Decomposition): solution detail — per-step SQS, floor step
   Complete component inventory (11 components), all states, animation rules, a11y spec.

8. **`design-mockups/hero-1-quiet.html`** — First mockup attempt (pre-design-system). For reference only. Feedback: "better but not great" — led to decision to build foundation first, mockup second.

---

## What was NOT done (next session priorities)

### Immediate next steps (in order):
1. **Skills files** — `.claude/skills/strale-design-system/SKILL.md` + `strale-design-review/SKILL.md` + `strale-copy-voice/SKILL.md` + `strale-component-build/SKILL.md`. These enforce the design system in every future session. Must happen before any building.

2. **Mockup round 2** — built on actual Next.js + Tailwind v4 stack using documented tokens. Two A/B tests:
   - Inter-only vs Mona Sans display (typography)
   - Forest green vs deep teal (accent color)
   Hero section first, then expand to solutions showcase + SQS section in the chosen direction.

3. **Messaging draft 2** — revised homepage copy incorporating all session decisions (broader audience, curated numbers, FAQ, x402 promoted, global positioning, professional tone).

### Deferred:
4. Remaining design system specs: `04-layout.md`, `05-motion.md`, `06-iconography.md`, `07-illustration.md`, `10-data-display.md`, `11-components.md`, `12-accessibility.md`
5. `/v1/stats` endpoint on the API (rounded counts for marketing mode)
6. Scaffold `v2-app/` directory (Next.js 15 project)
7. Pricing audit (parked until messaging is locked)
8. Notion page: "Homepage v2 — Positioning & Messaging" under Go-to-market (after draft 2 approved)
9. Site IA sub-pages (Capabilities catalog, Solution detail, Quality page, etc.)

---

## Key decisions to remember

| Decision | Detail |
|---|---|
| Audience | Smart professionals across roles, not just hardcore devs |
| Tone | Professional, direct, specific, warm but not breezy |
| Data on homepage | Curated/rounded, NOT live. Code blocks = styled illustrations. |
| Data on product pages | Live from API |
| Color | Two-tier: primary accent (interactive) + 4 muted secondaries (decorative) |
| `.do()` method | Kept. Renaming would cascade through SDKs/plugins/API route. |
| x402 | Promoted to visible CTA chip on homepage |
| Nordic/EU focus | Removed from homepage. Global positioning. |
| SQS on homepage | Level 0 (ambient) or Level 1 (curated chips in showcase). Never live. |
| Catalog page | Product mode — live SQS Level 1 chips |
| FAQ | Added to homepage scope (near bottom, above final CTA) |
| AI-native docs | Flagged as product feature — inline Ask AI, Copy page, MCP-discoverable |

---

## Open A/B decisions (resolve in mockup round 2)

1. **Accent color:** Forest green `#0B5E3B` vs Deep teal `#004D52`
2. **Display font:** Inter-only vs Mona Sans Variable for H1/H2

---

## Files the next session should read first

1. `strale-frontend/design-system/01-foundations.md` — the constitution
2. `strale-frontend/design-system/02-color.md` — tokens
3. `strale-frontend/design-system/03-typography.md` — type system
4. `strale-frontend/design-inspiration/inspiration.md` — what we're aiming for
5. This handoff file
