Intent: withhold `gdpr-fine-lookup`, as Petter chose on 2026-11-11 (option "a: withhold it now"). He did not choose to contact CMS, and no email was drafted or sent.

Why: the only source is enforcementtracker.com (CMS). It licenses its database under CC BY-NC-SA 4.0 (credit: "enforcementtracker.com, provided by CMS") and reserves reproduction for text and data mining under §§ 44b and 87c UrhG. Strale sold the lookup per call. DEC-20261023-A's checks lane allows per-call reads of public sources Strale chooses only when the source's terms permit automated per-call access, and these terms do not. Never item 6 (reselling against vendor terms) applies only by analogy. The licence page and robots.txt were read once each on 2026-11-11 and are recorded in `apps/api/src/lib/vendor-terms.data.json`.

Branch `fix/withhold-gdpr-fine-lookup`, cut from `origin/main` at b38aa124. What changed:

- The capability is in DEACTIVATED (`apps/api/src/capabilities/auto-register.ts`) with a dated reason and the two ways back.
- Both host spellings are on `PROHIBITED_UPSTREAM_HOSTS`, and a vendor-terms record says resale is prohibited.
- The manifest description starts "Currently unavailable.". Its first limitation says, neutrally, that the source licenses the database for non-commercial use only.
- `audit-helpers.ts` no longer names the source URL for new audit records.
- Startup-migration block 0153 (ledger row M096) runs every boot, guarded on the withheld state. It writes the capability's reason once the boot sync has cleared the flags. It then switches off, on both rails, every solution with a gdpr-fine-lookup step that is still on a rail or vendor-suspended; in the catalogue that is ai-act-assess.

Open, for Petter: whether enforcementtracker.com is also a never item 5 aggregator. CMS reserves rights under § 87c UrhG, the database-maker right, and the adoption table in `docs/strategy/2026-10-23-data-access-risk-rule-proposal.md` asks for that check. Until he decides, the site is not on `tos-blocklist.ts`, so a customer-directed single fetch of it is not refused.

Not done:

- A rebuild on the regulators' own decisions. That is out of scope.
- A production read. Nothing has been deployed.
- The published `strale-capabilities@0.1.2` snapshot still lists the capability, as it does eu-trademark-search. The next regeneration fixes it.

Tests: `apps/api/src/lib/startup-migration-0153.test.ts`. Round 1 evidence: `archive/receipts/2026-11-11-test-run-withhold-gdpr-fine-lookup-fail-before.json` and `archive/receipts/2026-11-11-test-run-withhold-gdpr-fine-lookup-after.json`. The review fixes have their own `-round2-` receipts.

Next: an independent review in a separate context, then the label ready-to-merge. After the deploy, run the queries named in the PR body to check that the capability carries block 0153's reason with all three flags false, that ai-act-assess is off on both rails, and that the block appears in the startup-migration ledger.
