Intent: correct what the email and phone validation tools claim, after an external benchmark showed them reporting made-up addresses and numbers as valid.

What changed:
- **email-validate:** the limitation now says that no mailbox is ever contacted. Any made-up or bouncing address at a domain with mail servers can return valid; catch-all domains are only one example.
- **phone-validate, phone-type-detect and phone-normalize:** each gains a limitation saying that "valid" means the number fits the country's numbering plan, not that it is assigned or in service. phone-type-detect's adds that line type and SMS capability are inferred from numbering-plan data.
- **Unchanged:** the email-validate description. #760 had already replaced the "deliverability verdict" wording, so no startup block was needed.
- No executor, schema or output field changed. The `valid` field keeps its name.

Evidence: archive/receipts/2026-10-27-test-run-email-phone-validation-copy.json. The quiet-material opening study was rebound to the changed email-validate manifest.

Left:
- The limitation texts reach production with the limitations sync run (Actions → Onboard capability → mode limitations, slugs all), which waits on Petter's one-time onboarding secret setup.
- Petter has a reply drafted to the benchmarker (datacircle.dev) explaining what the checks cover.
