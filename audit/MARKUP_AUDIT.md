# Markup & Link Audit

**Date:** 2026-02-28
**Scope:** All `.tsx` files in `apps/web/src/` (28 files)
**Routes audited:** 14 page routes + 4 components + 3 error boundaries + 3 loading skeletons + 1 skeleton component

---

## 1. Link Wrapping Issues

### FIXED — Bare `<a>` on signup page (mailto)
- **Severity:** Minor (valid for mailto)
- **File:** `apps/web/src/app/signup/page.tsx:37`
- **Issue:** Uses `<a href="mailto:...">` — this is correct for mailto links. No fix needed.

### Previously Fixed — Getting-started Next Steps
- **File:** `apps/web/src/app/docs/getting-started/page.tsx:89-95`
- **Issue:** All `<a>` tags converted to `<Link>` with proper separation of link text and plain text. ✅

### Previously Fixed — Bare `<a>` in docs pages
- **Files:** `http-api/page.tsx:97`, `mcp/page.tsx:85`
- **Issue:** Converted to `<Link>`. ✅

### No Issues Found:
- ✅ No nested links (link inside link)
- ✅ No entire sections wrapped in a single link
- ✅ No multiple links accidentally in one `<Link>` tag

---

## 2. Semantic HTML Issues

### C1 — CRITICAL: Pricing page skips h2 → uses h3 directly after h1
- **File:** `apps/web/src/app/pricing/page.tsx:41,46,50,95,100,106,119`
- **Issue:** Page has `<h1>` then jumps to `<h3>` inside the pricing model cards and comparison cards. Violates heading hierarchy (h1 → h3 skips h2).
- **Fix:** Change card headings from `<h3>` to `<h2>` since there's no parent `<h2>` grouping, OR restructure with section `<h2>` headings. The section `<h2>` headings exist ("Example prices", "How Strale compares") but the cards inside them use `<h3>` for items that are siblings of those h2s — this is actually correct. However, the first 3 cards (lines 41, 46, 50) under the model section have NO parent `<h2>`, jumping h1→h3.
- **Status:** ✅ FIXED — Added `<h2>` section heading for pricing model cards.

### C2 — MAJOR: Docs landing page has `<h3>` inside `<Link>` cards
- **File:** `apps/web/src/app/docs/page.tsx:22-37`
- **Issue:** Each card is a `<Link>` wrapping an `<h3>` and `<p>`. The `<h3>` inside a link makes semantic sense (it's a card), but these `<h3>` elements follow an `<h2>` ("Quick links") so the hierarchy is correct. No fix needed.
- **Status:** No fix needed. Hierarchy h1 → h2 → h3 is correct.

### No Issues Found:
- ✅ All pages have exactly one `<h1>`
- ✅ Navigation sections use `<nav>` wrapper (header.tsx:26, 64; docs layout:64, 94)
- ✅ No clickable `<div>` elements — all clickable elements are `<button>` or `<Link>`/`<a>`
- ✅ No `<button>` used for navigation
- ✅ No `<img>` tags used (no images on the site)
- ✅ Lists use proper `<ul>`/`<li>` structure

---

## 3. Link Health

### All Internal Links Validated:
| Link Target | Used In | Exists? |
|---|---|---|
| `/` | header.tsx | ✅ |
| `/capabilities` | page.tsx, header, footer, docs pages, getting-started | ✅ |
| `/pricing` | header.tsx, footer.tsx | ✅ |
| `/docs` | page.tsx, header.tsx, footer.tsx | ✅ |
| `/signup` | page.tsx, header.tsx, pricing, capability detail | ✅ |
| `/docs/getting-started` | docs/page.tsx, signup/page.tsx | ✅ |
| `/docs/integrations/mcp` | docs/page.tsx, getting-started | ✅ |
| `/docs/integrations/langchain` | docs/page.tsx, getting-started | ✅ |
| `/docs/api-reference` | docs/page.tsx, getting-started, http-api | ✅ |
| `/capabilities/${cap.slug}` | capability-catalog.tsx | ✅ (dynamic) |
| `/capabilities?category=${slug}` | page.tsx | ✅ (query param) |
| `/dashboard` | (none — redirects to /signup) | ✅ |

### External Links:
| Link | Has target="_blank"? | Has rel="noopener noreferrer"? |
|---|---|---|
| `https://github.com/petterlindstrom79/strale` (footer.tsx:7) | ✅ Yes | ✅ Yes |
| `mailto:petter@strale.io` (signup/page.tsx:37) | N/A (mailto) | N/A |

### No Issues Found:
- ✅ No links pointing to `#` or empty strings
- ✅ No dead internal links
- ✅ All external links have proper attributes
- ✅ No duplicate adjacent links

---

## 4. Interactive Element Issues

### C3 — CRITICAL: CodeBlock copy button missing aria-label
- **File:** `apps/web/src/components/code-block.tsx:33-38`
- **Issue:** The copy button has no text content and no `aria-label`. Screen readers cannot identify its purpose. (Note: CodeTabs copy button at code-tabs.tsx:47 correctly has `aria-label="Copy code"`.)
- **Status:** ✅ FIXED

### C4 — MAJOR: Search input missing associated label
- **File:** `apps/web/src/components/capability-catalog.tsx:76-82`
- **Issue:** The search `<input>` has a `placeholder` but no `<label>` or `aria-label`. Placeholder text is not a substitute for a label in accessibility.
- **Status:** ✅ FIXED — Added `aria-label` attribute.

### C5 — MAJOR: Docs mobile nav toggle button missing aria-expanded
- **File:** `apps/web/src/app/docs/layout.tsx:56-62`
- **Issue:** Mobile docs nav toggle button doesn't communicate expanded/collapsed state to assistive technology.
- **Status:** ✅ FIXED — Added `aria-expanded` attribute.

### No Issues Found:
- ✅ Header mobile menu button has `aria-label="Toggle menu"` (header.tsx:55)
- ✅ All buttons use `<button>` elements, not `<div onClick>`
- ✅ No form inputs besides the search (which is now fixed)
- ✅ All interactive elements have proper cursor styles via Tailwind defaults

---

## 5. Code Block Issues

### C6 — MAJOR: Signup page uses raw `<pre>` instead of `<CodeBlock>`
- **File:** `apps/web/src/app/signup/page.tsx:25-30`
- **Issue:** Uses a raw `<pre>` tag for the cURL registration command. Missing syntax highlighting and copy button. All other pages use the `<CodeBlock>` component consistently.
- **Status:** ✅ FIXED — Replaced with `<CodeBlock>` component.

### C7 — MAJOR: Homepage integrations section uses raw `<pre>` tags
- **File:** `apps/web/src/app/page.tsx:211-213`
- **Issue:** The four integration code examples use raw `<pre>` tags. Missing syntax highlighting and copy buttons. Inconsistent with the rest of the site.
- **Status:** ✅ FIXED — Replaced with `<CodeBlock>` component.

### Code Block Consistency Check:
| Page | Uses CodeBlock? | Has Copy Button? | Syntax Highlighting? |
|---|---|---|---|
| Homepage hero | ✅ CodeBlock | ✅ (via title) | ✅ |
| Homepage integrations | ❌ Raw `<pre>` | ❌ | ❌ |
| Getting started | ✅ CodeBlock | ❌ (no title) | ✅ |
| API reference | ✅ CodeBlock | ❌ (no title) | ✅ |
| MCP docs | ✅ CodeBlock | ✅ (some have title) | ✅ |
| HTTP API docs | ✅ CodeBlock | ❌ (no title) | ✅ |
| LangChain docs | ✅ CodeBlock | ❌ (no title) | ✅ |
| CrewAI docs | ✅ CodeBlock | ❌ (no title) | ✅ |
| Semantic Kernel docs | ✅ CodeBlock | ❌ (no title) | ✅ |
| Signup page | ❌ Raw `<pre>` | ❌ | ❌ |
| Capability detail | ✅ CodeTabs | ✅ | ✅ |

### Note on copy buttons:
The `<CodeBlock>` component only shows the copy button when a `title` prop is provided. Code blocks without titles lack copy buttons. This is a **Minor** design decision — the copy button UX is available via CodeTabs and titled CodeBlocks, but untitled code blocks require manual text selection.

### Code Content Validation:
- ✅ All API URLs consistently use `https://api.strale.io`
- ✅ Import paths are correct (`straleio`, `langchain-strale`, `crewai-strale`, `strale-semantic-kernel`)
- ✅ API endpoint paths are correct (`/v1/do`, `/v1/capabilities`, `/v1/wallet/balance`, `/v1/auth/register`, `/v1/auth/api-key`, `/mcp`)

---

## 6. Meta and Head Issues

### Root Layout (`apps/web/src/app/layout.tsx`):
- ✅ `<title>` configured via `metadata.title` with template
- ✅ `description` set
- ✅ `openGraph.title` and `openGraph.description` set
- ✅ `metadataBase` set to `https://strale.dev`
- ✅ `robots` configured
- ⚠️ **Minor:** No `og:image` defined — social media shares will have no preview image
- ⚠️ **Minor:** No explicit favicon reference (relies on Next.js default behavior)

### Per-Page Metadata:
| Page | Has title? | Has description? |
|---|---|---|
| Homepage (page.tsx) | ✅ (default) | ✅ (default) |
| Capabilities | ✅ | ✅ |
| Capability [slug] | ✅ (dynamic) | ✅ (dynamic) |
| Pricing | ✅ | ✅ |
| Docs | ✅ | ✅ |
| Getting Started | ✅ | ✅ |
| MCP Server | ✅ | ✅ |
| LangChain | ✅ | ✅ |
| CrewAI | ✅ | ✅ |
| Semantic Kernel | ✅ | ✅ |
| HTTP API | ✅ | ✅ |
| API Reference | ✅ | ✅ |
| Signup | ✅ | ✅ |
| Dashboard | N/A (redirect) | N/A |

---

## Summary

| Severity | Count | Fixed | Remaining |
|---|---|---|---|
| Critical | 2 | 2 | 0 |
| Major | 5 | 5 | 0 |
| Minor | 3 | 0 | 3 |

### Minor Issues (left for manual review):
1. **No og:image** — `layout.tsx` — Social shares will have no preview image. Create an OG image and add to metadata.
2. **No explicit favicon** — `layout.tsx` — Add `app/favicon.ico` or reference in metadata if not already present via Next.js conventions.
3. **CodeBlock copy button only appears when title is set** — `code-block.tsx` — Consider always showing the copy button, or adding it to the untitled variant. Currently 15+ code blocks across docs pages have no copy button.

### Fixes Applied:
1. **C1:** Added `<h2>` section heading to pricing model cards
2. **C3:** Added `aria-label="Copy code"` to CodeBlock copy button
3. **C4:** Added `aria-label="Search capabilities"` to search input
4. **C5:** Added `aria-expanded` to docs mobile nav toggle
5. **C6:** Replaced raw `<pre>` with `<CodeBlock>` on signup page
6. **C7:** Replaced raw `<pre>` with `<CodeBlock>` on homepage integrations
