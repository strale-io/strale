Intent: withhold `gdpr-fine-lookup`, as Petter chose on 2026-11-11 (option "a: withhold it now"). He did not choose to contact CMS, and no email was drafted or sent.

Why: the only source, enforcementtracker.com (CMS Hasche Sigle), licenses its database under CC BY-NC-SA 4.0 (credit: "enforcementtracker.com, provided by CMS") and reserves reproduction for text and data mining under §§ 44b and 87c UrhG. Strale sold the lookup per call, which is resale against the source's terms: the never lane of DEC-20261023-A. The licence page and robots.txt were read once each on 2026-11-11 and are recorded in `apps/api/src/lib/vendor-terms.data.json`.

Branch `fix/withhold-gdpr-fine-lookup`, cut from `origin/main` at b38aa124. What changed:

- The capability is in DEACTIVATED (`apps/api/src/capabilities/auto-register.ts`) with a dated reason and the two ways back.
- Both host spellings are on `PROHIBITED_UPSTREAM_HOSTS`, and a vendor-terms record says resale is prohibited.
- The manifest description starts "Currently unavailable." and has a first limitation that names the licence.
- `audit-helpers.ts` no longer names the source URL for new audit records.
- Startup-migration block 0153 (run policy once, ledger row M096) writes the reason on the capability once the boot sync has cleared its flags. It then switches off, on both rails, every solution with a gdpr-fine-lookup step; in the catalogue that is ai-act-assess.

Not done:

- A rebuild on the regulators' own decisions. That is out of scope.
- A `tos-blocklist.ts` entry. It would also bar customer-directed single fetches of the site, which DEC-20261023-A allows with checks, so that is a separate policy call.
- A production read. Nothing has been deployed.

Tests: `apps/api/src/lib/startup-migration-0153.test.ts`. Six of its tests fail before the change and all pass after. Evidence: `archive/receipts/2026-11-11-test-run-withhold-gdpr-fine-lookup-fail-before.json` and `archive/receipts/2026-11-11-test-run-withhold-gdpr-fine-lookup-after.json`.

Next: an independent review in a separate context, then the label ready-to-merge. After the deploy, run the queries named in the PR body to check that the capability carries block 0153's reason with all three flags false, that ai-act-assess is off on both rails, and that the block appears in the startup-migration ledger.
