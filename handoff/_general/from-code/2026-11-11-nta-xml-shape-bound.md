Intent: the Japanese registry (NTA) XML response is shape-checked in one linear pass before jsdom, so a malformed upstream body cannot block the event loop.

- **Problem:** the R1 jsdom sweep (receipt 2026-11-11) measured jsdom's XML parse at 20 s for 1 MiB of nesting, and 2.7 s for 16 KiB. The review then found 1 MiB of attributes takes 64 s.
- **Change:** `assertXmlShape` caps depth at 8, elements at 5,000, nodes at 5,000 and attributes at 64 before `new JSDOM`. A refusal maps to the existing "NTA returned an unexpected response" error.
- **Authors:** built by Codex (43c91fad); the attribute and node caps were added by Claude after a NO-GO review. See `docs/lanes/codex/nta-xml-shape-bound-report.md`.
- **Next:** after deploy, a real japanese-company-data call (paid) needs the morning run, or a fixture-mode smoke.
