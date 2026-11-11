# NTA XML shape-bound report

## Files changed

- `apps/api/src/lib/nta-corporate.ts` — adds the pure, forward-only `assertXmlShape` scanner; sets the NTA limits to depth 8 and 5,000 elements; invokes the scanner after the existing DOCTYPE/count checks and before jsdom; maps scanner refusals to the existing generic unexpected-response error.
- `apps/api/src/lib/nta-corporate.test.ts` — unit coverage for comments, CDATA, self-closing elements, an unclosed comment, and the 1 MiB hostile-input time bound.
- `apps/api/src/capabilities/japanese-company-data.test.ts` — transport-level coverage for deep nesting, excessive siblings, and a generated real-shaped 50-record response with about 30 fields per record.
- `docs/lanes/codex/nta-xml-shape-bound-report.md` — this report.

## Measured times

The before figures are the measurements supplied in the builder brief, taken on this repository's jsdom before this change. The after figures were measured in this worktree on Node 20.20.2 with the same installed dependency set.

| Input | Before (jsdom, brief) | After (shape check) |
|---|---:|---:|
| 64 KiB unclosed `<a>` nesting | 21.4 s | 0.366 ms helper-only; 20.438 ms through mocked fetch and response parsing |
| 1 MiB unclosed `<a>` nesting | 20.4 s | 4.828 ms helper-only (including flattening the generated string) |

The committed tests enforce looser, CI-safe ceilings: the 64 KiB transport case must finish under 100 ms and the 1 MiB helper case under 200 ms.

## Tests and what they pin

### Transport and mapping tests

- **64 KiB deep nesting:** a mocked NTA response containing unclosed `<a>` nesting is rejected before jsdom, uses exactly `NTA returned an unexpected response. Retry later.`, and completes under 100 ms.
- **6,000 sibling elements:** a mocked response beyond the 5,000-element limit is rejected with the same sanitized error.
- **Real-shaped 50-record response:** generates 50 corporations with about 30 fields each and pins the pre-existing mapped company name, number, type, status, address, assignment/update dates, and exclusion flag.

### Pure helper tests

- **Comment and CDATA:** apparent tags inside either construct do not affect depth or element count.
- **Self-closing element:** counts as an element but does not add nesting depth.
- **Unclosed comment:** terminates the scan without hanging, including when the input is padded to 1 MiB.
- **1 MiB hostile nesting:** rejects within 200 ms.

### Existing coverage

- The focused Japanese-company-data suite and new helper suite pass together: 2 files, 95 tests.
- The repository-wide API run completed with unrelated performance-threshold failures; every failing file observed is listed below. The NTA files passed in that run.

## Commands and results

- `npm ci` — **failed** because the `c2pa-node` postinstall could not reach GitHub (`ENETUNREACH`).
- `npm install --ignore-scripts` — **passed**; installed the locked dependency tree without the network-dependent postinstall (with Node-engine and audit warnings).
- `cd apps/api && npx vitest run src/capabilities/japanese-company-data src/lib/nta-corporate.test.ts` — **passed**: 2 files, 95 tests.
- `cd apps/api && npx tsx -e '<shape benchmark>'` — **passed**: 64 KiB helper 0.366 ms; 1 MiB helper 4.828 ms; 64 KiB mocked transport 20.438 ms.
- `npm run build --workspace=packages/mcp-server && npm run build --workspace=packages/sdk-typescript && npm run typecheck` — **passed**.
- `cd apps/api && npx vitest run` — **failed** on pre-existing/host-load-sensitive performance ceilings. Failing files observed:
  - `src/lib/company-enrich/structured-metadata.test.ts` — 2 timing failures (`millions of İ`, 1,442 ms; worst-known 16 MiB page, 1,179 ms; each ceiling is 1,000 ms).
  - `src/capabilities/lib/stripped-text-length.test.ts` — 1 timing failure (`stays linear where the regexes were quadratic`, 1,127 ms vs a 1,000 ms ceiling).
  - `src/capabilities/url-to-markdown-parse-bound.test.ts` — 1 timing failure (`converts 16 MiB of ordinary text`, 690 ms event-loop gap vs a 500 ms ceiling).
  - `src/capabilities/lib/web-provider-text-check.test.ts` — 1 timing failure (`16 MiB of ordinary text`, 530 ms event-loop gap vs a 500 ms ceiling).
  - Overall: 4 failed / 477 passed / 47 skipped files; 5 failed / 10,155 passed / 459 skipped tests. Duration 451.98 s.

## Claude review round (2026-11-11)

The independent read-only review of 43c91fad gave **NO-GO**. The scanner bounded depth and element count, but not attributes or non-element nodes. Every input below passed `assertXmlShape` and the pre-checks:

| Input (1 MiB) | jsdom time |
|---|---|
| attributes on one element | 63.8 s |
| `xmlns` declarations | 25.8 s |
| namespaced attributes | 24.6 s |
| `<!---->` repeated | 523 ms |
| `<?p?>` repeated | 697 ms |

Fixed by Claude:

- **Attributes:**
  - `assertXmlShape` takes an optional `maxAttributes` and counts each `=` outside quotes in an opening tag.
  - `parseResponse` uses `MAX_XML_ATTRIBUTES = 64`. Real NTA type-12 responses carry no attributes, as every fixture in `apps/api/src/capabilities/__fixtures__/nta-corporate/` confirms.
- **Nodes:**
  - The scanner takes an optional `maxNodes`. Comments, processing instructions and CDATA sections now count as nodes, alongside elements.
  - `parseResponse` uses `MAX_XML_NODES = 5000`.
- **Tests:**
  - **Helper:** attribute counting, with `=` in a quoted value or in text not counted, and a 1 MiB attribute flood refused in under 200 ms. Comments, processing instructions and CDATA each count toward the node limit.
  - **End to end:** 1 MiB of attributes on one element and 6,000 comments are each refused with the generic response error in under 200 ms.
  - **Fail-before:** all six tests fail against 43c91fad. The end-to-end attribute case takes 49 s there.
- **Commands:** `npx vitest run src/lib/nta-corporate src/capabilities/japanese-company-data` gives 101 passed.
