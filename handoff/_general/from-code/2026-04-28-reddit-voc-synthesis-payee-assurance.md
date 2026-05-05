Intent: Read the Strale strategy + product Notion pages, review an r/fintechdev Reddit thread on manual fintech/compliance workflows, and surface meaningful takeaways for Payee Assurance positioning. Then write the synthesis up in Notion and execute the immediate follow-ups.

# Outcome

- **Journal entry written** — "Voice-of-customer synthesis — r/fintechdev manual-fintech-workflows thread (2026-04-28)" in Journal DB. URL: https://www.notion.so/35067c87082c816ca752e419e2c8f2ac. Type=brainstorm, Action Required=yes (spawned two follow-ups).
- **Payee Assurance product page edited** — added the "Master Excel" framing line directly under the opening pitch. New italicised sentence: *"Replaces the 'Master Excel' that AP and compliance teams build by hand from registry PDFs, sanctions screenshots, and bank-verification emails — the artifact that gets rebuilt every audit cycle because nothing is durably joined."* Page: https://www.notion.so/34867c87082c814999e5c668d7383fa7.
- **To-do logged** — "Evaluate customer_ref / external_id echo-back on Payee Assurance request → audit artifact." Status=Inbox, Owner=Petter, Priority=P2, Effort=s. URL: https://www.notion.so/35067c87082c81c19062cb103499d09e. Marked Inbox/P2 because changing the public request shape is a product decision Petter should make, not a unilateral edit.

# Synthesis content (high-signal)

Five practitioner quotes worth lifting verbatim into copy:
1. "KYB / UBO Verification: a manual 'detective work' loop involving PDFs and registry screenshots."
2. "Audit Trail Consolidation: teams spend weeks pulling logs from 5 different SaaS tools into a 'Master Excel' just to prove compliance."
3. "You don't 'pull logs'; you just export the immutable trail that the system built as it worked."
4. "Automated Governance — every step logged and immutable." (tighter than "auditable")
5. "Identifying the issue is usually quick, but getting the right data / confirmation takes way longer." (best argument for bundle pricing — the gather is the cost, not the decision)

Pattern-level takeaways (full reasoning in the Journal entry):
- Practitioners think in **evidence**, not "verification" / "screening" — vocabulary worth aligning on across landing page + MCP tool descriptions.
- Real pain is **"exceptions around the exceptions"**, not the happy path. Implication: the `suggested_action: review` + `critical_flags` + ranked-candidate shape is the differentiator vs a thin wrapper.
- Buyer's mental model is "one record per customer, joined across systems" → motivates the customer_ref echo-back evaluation.
- "Chasing people" eats more time than investigating data → audit URL durability is a pitch angle ("you stop chasing yourself").

Out-of-scope signals from the same thread (don't get pulled in): payment/accounting reconciliation, GRC platforms (Workiva/Drata/Vanta), security questionnaires.

# Open

- Two yellow items in close-check (`us-company-data.ts`, `provenance-builder.ts`) — pre-session uncommitted state, not from this chat session. Left alone per git-working-copy-safety rule.
- The customer_ref echo-back to-do is sitting in Inbox awaiting Petter's read.
- No code, DB, or governance changes this session.

# Non-obvious learnings

- Notion governance lands cleanly on this kind of work: research-synthesis → Journal (brainstorm), action items → To-do, content edit → product page directly. No new Decisions DB entry needed because nothing was authoritatively decided — just observations and one product-shape question deferred to Petter.
- "Master Excel" is now the named artifact Payee Assurance kills. Useful shorthand for outbound and homepage copy.

# Cost

Zero. Notion reads/writes only.
