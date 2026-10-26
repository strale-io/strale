Intent: Rewrite the public names and descriptions of the catalogue's tools, fix three bundled-check copy problems, and make production pick the copy up on deploy.

Mode: Quick, content plus one ledgered startup migration. Branch `content/catalogue-copy`; PR opened for Petter's review, not merged.

What changed: 296 manifests carry the final catalogue copy (password-strength refused, social-profile-check excluded by brief). Block 0123 (`runMigration0123_catalogueCopy`, ledger M066) rewrites capabilities.name and capabilities.description, and solutions.description for web-extract-clean, ai-act-assess and the kyb-essentials/kyb-complete/invoice-verify families, each UPDATE guarded on the exact production value of the 2026-10-26 snapshot. Data lives in `apps/api/src/lib/catalogue-copy-0123.ts`; the migration ledger now hashes a block together with any file it declares with `// migration-data: <path>`.

Not done: no production write was run. web-extract-clean's long_description and agent_description still describe getting past blocked pages, and the KYB families' long_description still reads "invoices from United Kingdom"; both are outside this brief. Production password-strength still says "Password is NOT stored", which is false while inputs are kept 90 days; the manifest's narrowed text never reached production.

Resume: after merge and deploy, verify block 0123 in the boot log and query production for the count of capabilities whose description matches the manifests (expected 296, less any row edited since the snapshot; the block's outcome line names that number).
