Intent: robustness R1, batch 2. `htmlToText` (`apps/api/src/capabilities/lib/browserless-extract.ts`) is used by about 8 tools that fetch a caller's URL. It is now linear on hostile markup. Before, 256 KB of repeated `<p` took 26.8 s on the old regex chain.

[BACKFILL] Cloud session; no Notion write was made.

## How it was built

- **Codex runs:**
  - The first run produced no diff.
  - f17dc0f2 failed review: a stray quote emptied the page, a closing `</script>` started a skip, and the growth test was flaky.
  - 9f6a3aa7 failed review: two quadratic paths a caller can control, and the fix for the stray-quote bug was incomplete.
- **Claude's round 3:** first-`>` tag ends, as in the old function; `lastIndexOf` guards for `-->` and `>`; a literal `<` when nothing closes it.
- **Details:** see the "Round 3" section of `docs/lanes/codex/html-to-text-linear-report.md`.

## Still open (R1)

- **Per-caller fairness** in the url-to-markdown converter.
- **The jsdom sweep:** `lib/company-enrich/structured-metadata.ts` and `lib/nta-corporate.ts`.
- **A receipt** for one ordinary url-to-markdown conversion in production.
