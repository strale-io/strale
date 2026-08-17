# Link Behavior Audit

**Date:** 2026-02-28
**Scope:** All `.tsx` files in `apps/web/src/` (28 files)

---

## 1. Card-as-Link Patterns

### F1 — Homepage category cards: title has no hover highlight
- **File:** `apps/web/src/app/page.tsx:232`
- **Issue:** Card `<Link>` has `group` and border/bg hover effects, icon has `group-hover:text-accent`, but the `<h3>` title has no hover color change. User can't tell which text is the link target.
- **Fix:** Added `transition-colors group-hover:text-accent` to `<h3>`.
- **Status:** FIXED

### F2 — Capability catalog cards: title has no hover highlight
- **File:** `apps/web/src/components/capability-catalog.tsx:117`
- **Issue:** Card `<Link>` has `group` and hover effects on border/bg, but the `<h3>` title stays `text-foreground` on hover.
- **Fix:** Added `transition-colors group-hover:text-accent` to `<h3>`.
- **Status:** FIXED

### F3 — Docs quick link cards: missing `group` class and title hover
- **File:** `apps/web/src/app/docs/page.tsx:22-37`
- **Issue:** Four `<Link>` cards wrapping `<h3>` + `<p>`. Cards have border/bg hover, but no `group` class and no title color change on hover. Description stays `text-muted` (correct), but title gives no visual feedback.
- **Fix:** Added `group` to each `<Link>`, added `transition-colors group-hover:text-accent` to each `<h3>`.
- **Status:** FIXED

### F4 — Capability detail related cards: already correct
- **File:** `apps/web/src/app/capabilities/[slug]/page.tsx:232-249`
- **Status:** Already has `group` on `<Link>` and `group-hover:text-accent` on `<h3>`. No fix needed.

---

## 2. Links Containing Multiple Text Elements

### F5 — Getting-started Next Steps: bare `<a>` tags instead of `<Link>`
- **File:** `apps/web/src/app/docs/getting-started/page.tsx:91-94`
- **Issue:** Four `<a href="...">` tags used instead of Next.js `<Link>`. Also, line 92 wraps "Set up the MCP server" link text together with "for Claude, Cursor, or Windsurf" plain text — the plain text should be visually distinct.
- **Fix:** Converted all `<a>` to `<Link>`. Separated descriptive text into `<span className="text-muted">`.
- **Status:** FIXED

### F6 — MCP docs page: bare `<a>` for internal link
- **File:** `apps/web/src/app/docs/integrations/mcp/page.tsx:86`
- **Issue:** `<a href="/capabilities">` used instead of `<Link>`. Misses client-side navigation.
- **Fix:** Converted to `<Link>`.
- **Status:** FIXED

### F7 — HTTP API docs page: bare `<a>` for internal link
- **File:** `apps/web/src/app/docs/integrations/http-api/page.tsx:98`
- **Issue:** `<a href="/docs/api-reference">` used instead of `<Link>`. Misses client-side navigation.
- **Fix:** Converted to `<Link>`.
- **Status:** FIXED

### F8 — Signup page mailto: correctly uses bare `<a>`
- **File:** `apps/web/src/app/signup/page.tsx:37`
- **Status:** `<a href="mailto:...">` is correct for mailto links. No fix needed.

---

## 3. Inherited Underlines

### F9 — Docs layout prose styles: scoped correctly
- **File:** `apps/web/src/app/docs/layout.tsx:74`
- **Styles:** `[&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline`
- **Analysis:** These styles apply inside the `<article className="prose">` wrapper. The docs page quick link cards use `not-prose` to opt out. Inline links in paragraphs correctly get accent color + hover underline. Card links are excluded.
- **Status:** No fix needed.

### F10 — No global `a` styles in globals.css
- **File:** `apps/web/src/app/globals.css`
- **Analysis:** No `a { text-decoration: ... }` or similar global link styles. All link styling is component-level via Tailwind classes.
- **Status:** No fix needed.

---

## 4. Accent Color Bleed

### No issues found.
- All `<Link>` cards use explicit `text-foreground` or `text-muted` on children — no color inheritance from parent links.
- The `text-accent` class is only applied directly to elements that should be accent-colored (price tags, step numbers, icons).
- Browser default link colors are overridden by explicit Tailwind classes on every link.

---

## 5. Clickable Area vs Visual Feedback Mismatch

### All card patterns verified correct:

| Component | Clickable Area | Hover Feedback | Match? |
|---|---|---|---|
| Homepage category cards | Entire card | Border + bg + icon + title highlight | ✅ |
| Capability catalog cards | Entire card | Border + bg + title highlight | ✅ |
| Docs quick link cards | Entire card | Border + bg + title highlight | ✅ |
| Related capability cards | Entire card | Border + bg + title highlight | ✅ |
| Pricing table capability name | Name text only | Text color change | ✅ |
| Header nav links | Text only | Text color change | ✅ |
| Footer links | Text only | Text color change | ✅ |
| CTA buttons | Button area | Background color change | ✅ |

### No issues found:
- No cards with missing hover states
- No cards where only part is visually linked but entire card is clickable
- All clickable areas have appropriate visual feedback

---

## Summary

| Category | Issues Found | Fixed |
|---|---|---|
| Card hover titles | 3 | 3 |
| Bare `<a>` → `<Link>` | 4 | 4 |
| Inherited underlines | 0 | — |
| Accent color bleed | 0 | — |
| Clickable area mismatch | 0 | — |
| **Total** | **7** | **7** |

### Fixes Applied:
1. `page.tsx:232` — Homepage category card `<h3>` gets `group-hover:text-accent`
2. `capability-catalog.tsx:117` — Catalog card `<h3>` gets `group-hover:text-accent`
3. `docs/page.tsx:22-37` — Four docs quick link cards get `group` on `<Link>` + `group-hover:text-accent` on `<h3>`
4. `getting-started/page.tsx:91-94` — Bare `<a>` converted to `<Link>`, descriptive text separated into `<span>`
5. `mcp/page.tsx:86` — Bare `<a>` converted to `<Link>`
6. `http-api/page.tsx:98` — Bare `<a>` converted to `<Link>`
