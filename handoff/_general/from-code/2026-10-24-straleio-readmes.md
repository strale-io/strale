Intent: make the straleio SDK READMEs match the clients, as Petter asked in session on 2026-10-24.

The TypeScript and Python READMEs (`packages/sdk-typescript/README.md`, `packages/sdk-python/README.md`) documented an interface the clients never had:
- camelCase `capabilitySlug` and `maxPriceCents`, and Python keyword calls;
- `solution:` / `input:` bundled checks;
- `dryRun`, `getBalance`, `listCapabilities`, `do_async` and `dry_run()`;
- a free tier through an empty API key, which both constructors reject;
- error fields `code` and `message`.

They also hard-coded counts ("5 capabilities", "256 capabilities", "€2 trial credits").

Rewritten against the published packages, straleio 0.1.3 on npm and 0.1.4 on PyPI, whose `do()` interface equals the source. The TS snippets type-check against the published `.d.ts`. The Python names, fields and constructor options were exercised against the published wheel. Bundled checks and the keyless free tier now point to REST, and the counts point to `/v1/platform/facts`.

No code changed and nothing was published. The PyPI and npm pages keep showing the old README until the next release, which is a separate step.

Follow-ups, not done here:
- The TS `do()` overloads resolve `dry_run: true` to `DoResponse`, so the README casts to `DryRunResponse`; reordering the overloads fixes that.
- Neither client supports bundled checks.
