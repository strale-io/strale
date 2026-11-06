Intent: ship the Codex phone-fictional-ranges build (task_e_6aeddd0b1bd883298a6b9f49fe5781fb) after independent review.

phone-validate reports North American numbers in 555-0100 to 555-0199 (any area code) as not valid with `reason: reserved_fictional_range`; an external benchmark scored 555-01xx answers as wrong. Review: PASS-WITH-FIXES; both fixes applied by the orchestrator: the reason applies only to numbers that are otherwise valid (an invalid area code is no longer called fictional), and the limitation text names only the North American range. The new tests fail on the pre-fix code.

After merge: the limitation text reaches production only through the Onboard capability workflow in `limitations` mode for phone-validate. Follow-up, not done: phone-normalize and phone-type-detect still treat 555-01xx as real.
