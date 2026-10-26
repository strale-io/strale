Intent: Carry out the 2026-10-25 visual review's fix order on apps/web (homepage first, then the catalogue), and leave the work so a different Claude account can pick it up without losing anything.

# Website: homepage and catalogue fixes, and the account-switch handoff

Continues `2026-10-25-website-daylight-switchboard.md`. Directed by Petter in session:
"start fixing in the order you listed. Show me the homepage before moving on to the
catalogue" (approved: "Homepage looks good. Move on to the catalogue copy pass"), then
"harden what we've built and write down our learnings so that they survive" before he
switches Claude account.

## Where the work is

- Worktree `C:/Users/pette/Projects/strale-wt-design`, branch `design/site-polish`,
  PR #736 (draft). It is stacked: #725 (`claude/loving-newton-mxoo9l`) ← #726 (`-tools`)
  ← #727 (`-company-data`) ← #736. None is merged, and nothing reaches strale.dev until
  the founder-reserved cutover (FD-20260901-PUBLIC-DOMAIN).
- On 2026-10-26 `origin/main` (bbd8f0d4, with the DEC-20261023-A data-access PRs #731–#735)
  was merged up the whole stack, so every branch contains main. The recipe for doing that
  again is in `WORKTREES.md` ("Bringing a stack of PRs up to date with main").

## Done

1. **Homepage**, commit 2a27f191. Seven sections, about 7 screens at 1440×860 (was 10):
   - hero;
   - kinds of work;
   - one call;
   - company data on a deep-violet stage;
   - pay per call two ways (merged; no raw 402 JSON, no table);
   - tested;
   - closing band with the ways in.

   Also:
   - Matched v2 illustration set (transparent, works in both themes; `provenance.json`
     rewritten).
   - Nav right-aligned and translucent once scrolled.
   - Footer grid fixed.
   - Scroll reveals, off under reduced motion.
   - Subset WOFF2 fonts (466 KB to 118 KB).

   Petter saw it and approved.
2. **Catalogue**, commit 5c39c85d plus the follow-up commit with this handoff.
   - `/tools` has a sticky filter column, and tools are grouped by job as cards. Each
     group opens at six, with "Show all". The page goes from about 44 screens to 9.6.
   - Bundled checks: the quick company check, full company check and invoice issuer check
     are one card per family, with country links.
   - Internal scaffolding rows (`test-solution-*`) are filtered out.
   - Tool pages show input beside answer only when they visibly match. The "may not come
     from the same call" disclaimer is gone.
   - The site reads tool names and descriptions from `manifests/`, because they are
     manifest-canonical.

   Screenshots taken with the new copy applied are **not yet shown to Petter**.
3. **Catalogue copy pass** (names and descriptions for 297 tools).
   - What changed: British English, one naming pattern, no plumbing or method tags. The
     rules are now in `docs/company/VOICE.md`.
   - Working files: the copy is in the session scratchpad as `catalogue-copy.json`, with
     an applier `apply-copy.mjs`.
   - It ships as its own PR to `main` on branch `content/catalogue-copy`, built by a
     worktree agent. The PR carries the manifests and one ledgered startup migration,
     guarded on today's exact production values, so production picks the copy up on
     deploy with no manual write.
   - The same PR fixes three bundled-check copy faults:
     - `web-extract-clean` claimed to fetch "even behind anti-bot walls", which is false
       under DEC-20261023-A;
     - `ai-act-assess` had a stale August 2026 deadline;
     - the KYB families said "for United Kingdom".
   - It became PR #738. The outcome is in "Catalogue copy PR #738" below.
   - This branch deliberately does **not** carry the manifest edits, so the two never
     conflict. Merge main into the stack after the copy PR lands.
4. **Learnings made durable**:
   - `docs/company/VOICE.md`: marketing confidence, catalogue copy rules, manifest-canonical
     copy.
   - `apps/web/README.md`: how to preview (dev server hangs on live data; build then
     preview; never two live builds; MSYS_NO_PATHCONV).
   - `design/brand-kit/open-flow/README.md`: how the illustration set is made.
   - `WORKTREES.md`: merging main up a PR stack.
   - Claude's own memory is backed up privately in `strale-io/strale-context-archive`,
     `claude-memory/` (PR #3, merged), with restore steps.

## Next, in the agreed order

1. Show Petter the catalogue (`/tools`, `/tools/vat-validate`, a bundle page). Polish to do:
   - "More bundled checks" is a long grid of about 40 cards and should open collapsed.
   - `/tools` on a phone is 22 screens: collapse the groups harder there.
2. Company data hub tidy (raw source names, density) and thicker country pages.
3. Detail bugs:
   - pricing overflows 14px on phones;
   - the stat numeral "1" glyph looks odd;
   - header images are hidden on phones but still downloaded (one counts as broken at
     390px on /tools).
4. Missing pages: `/signup`, `/topup`, `/terms`, `/privacy`, `/guides` (footer and CTAs
   link to them).
5. Before #736 merges: an independent review in a separate context of the homepage and
   catalogue commits. Neither has had one yet; the earlier batches did.

## Catalogue copy PR #738 (outcome)

- Built by a worktree agent, reviewed independently by a fresh agent in a separate context.
  - First review: FAIL on copy truth only. Three new descriptions repeated old false claims:
    - Price Comparison: Google Shopping, which was removed;
    - Startup Name Availability: X handles, which it does not check;
    - Phone Validation: carrier, which is always empty.
  - The review also flagged that bumping `updated_at` on 296 tools would reset invariant-checker
    clocks and could hide alerts.
  - All fixed in 1d301f62, plus `charity-lookup-uk`, whose real source is Find that Charity.
- Block 0123 writes name, description, long_description and agent_description only, each
  guarded on today's exact production value, and never `updated_at`. The ledger now hashes a
  block's declared data file (`// migration-data:`).
- After deploy: the ledger row `0123_catalogueCopy` should show about 571 rows. Fewer means
  some values changed since the 2026-10-26 snapshot, which is safe.
- Deliberately excluded from #738:
  - `password-strength`: production still says "Password is NOT stored", which is false because
    inputs are kept 90 days. It needs its own guarded fix.
  - `social-profile-check`: its newer copy from #731 is not yet in production.

## Open items found along the way

- **Data-access rule:**
  - `price-compare` reads PriceRunner, a commercial price aggregator. DEC-20261023-A puts
    commercial aggregators in the never lane, even per call. Switch the tool off, or record a
    decision.
  - `charity-lookup-uk` reads Find that Charity; whether that counts as an aggregator is
    undecided.

- `GET /v1/solutions` lists `test-solution-delete-me`. The A2A card filters it with
  `isInternalArtifact`; the solutions route does not. The site now filters it too.
- `social-profile-check`: the manifest on main is "Developer Registry Name Check" (#731),
  but production still serves the old copy naming Reddit. It needs the manifest sync or
  the migration route.
- The `invoice-verify-*` example output disclaimer still names OpenSanctions (vendor is
  Dilisense).
- The KYB Complete bundle activation predicate gap from earlier is still open.

## For the next account or session

- The repo carries everything an agent needs. Start with `docs/programs/README.md`, the
  brand-website `tracks.yaml` T6 `next_action`, and this file.
- Claude memory on this PC is unaffected by an account switch on the same PC. On another
  machine or in the cloud, restore it from the private archive (README in
  `claude-memory/`).
- Petter's own `C:\Users\pette\.claude\CLAUDE.md` is not in that backup: Claude Code's
  permissions block reading it, so he copies it by hand if he moves machines.
- The local clone `C:/Users/pette/Projects/strale-context-archive` had an unpushed commit
  and was 24 commits behind on 2026-10-26. It was left untouched. Look at it before using
  it.
