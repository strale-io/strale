Intent: Codex builder brief: bound the jsdom parse in url-to-markdown, so a hostile page cannot stall the API.

# Brief: url-to-markdown parse bound

- **Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw), on Petter's instruction of 2026-11-06.
- **Branch:** push only `codex/url-to-markdown-parse-bound`. Never push `main`, and never label, approve, merge or comment.
- **Data:** the repository only. There are no secrets. Every test runs offline on synthetic HTML.

## Why

`url-to-markdown` is a free-tier capability, so anyone can call it with no key. It hands the fetched page to jsdom in `apps/api/src/capabilities/lib/readability-convert.ts` (around line 50), and pages can be up to `MAX_FETCHED_HTML_BYTES` (16 MB).

While hardening company-enrich (PR #947), reviews measured jsdom (parse5) on adversarial markup. Parse time grows much faster than input size, and on deep nesting it ends in a stack overflow (RangeError):

| Adversarial markup | Measured cost |
|---|---|
| nested `<div>`, 16 KB | 1.5 s |
| nested `<div>`, 32 KB | 7 s, then a stack overflow |
| `<b><i><u><a>` repeated, 32 KB | 34 s |
| one tag with a 1.4 MB attribute flood | 452 s |

A size cap limits how much jsdom reads, not how long it takes. The parse is synchronous, so it blocks the whole API process.

## What to do

1. **Measure first.** Run `convertHtmlToMarkdown` (or whatever `readability-convert.ts` exports) on each input below. Record the times in your report.
   - nested `<div>` at 16, 32 and 64 KB;
   - nested formatting tags at 16 and 32 KB;
   - a 1 MB attribute flood on one tag;
   - 16 MB of flat `<p>x` tags;
   - a normal 200 KB article page.
2. **Bound the parse** so every adversarial input finishes in well under 1 s, or fails cleanly with a thrown error.
   - Preferred: a linear pre-pass, before jsdom, that:
     - limits nesting depth (for example, past depth 256, drop opening tags of non-void elements until the depth falls);
     - limits attributes per tag (for example, 64);
     - limits attribute value length.
   - It must skip `<script>`, `<style>` and comment contents linearly, never with a backtracking regex.
   - Alternatively, parse in a worker thread with a hard timeout that terminates the worker. If you choose this, explain the trade-off.
3. **Fail cleanly.** A page that cannot be converted within bounds must throw, so the call is never billed. It must never return empty Markdown as a success.
4. **Keep normal pages working.** The Markdown output for normal pages must be unchanged. Use the existing tests and fixtures as the guard.

## Tests

Add these tests:
- each adversarial input above finishes under a generous bound, for example 2 s, or throws;
- normal pages convert exactly as before.

The adversarial tests must fail, or time out, on main. Show this by checking out the file from `origin/main`. Never use `git stash`.

## Done when

- The new tests pass, the existing url-to-markdown and readability tests pass, and `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- `docs/lanes/codex/url-to-markdown-parse-bound-report.md` lists the before and after measurements, the approach, and anything not done.
