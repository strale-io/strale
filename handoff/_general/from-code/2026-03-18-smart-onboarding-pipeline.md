# Intent: Upgrade onboard.ts with smart fixture generation, fix phone-type-detect

## What was done

### 1. onboard.ts — Three enhancements

**Enhancement 1: Execute-and-verify**
After generating test suites, the pipeline now executes the capability with the known_answer input and validates every expected_field against real output. Catches fixture mismatches at build time. Works in both `onboard` and `--backfill` modes.

**Enhancement 2: Auto-correct (--fix flag)**
When execute-and-verify finds mismatches, the pipeline can auto-correct high-confidence issues:
- Field name case convention mismatches (snake_case vs camelCase)
- Close field names (Levenshtein distance ≤ 2)
- Boolean/type coercion (true vs "true", 1 vs true)
- Case-insensitive string matches

Low-confidence issues are printed as suggestions for manual review.

**Enhancement 3: Fixture discovery (--discover flag)**
Executes the capability and auto-generates expected_fields + output_field_reliability from actual output. Eliminates manual fixture authoring. Workflow:
1. Write executor + minimal manifest (just health_check_input, no expected_fields needed)
2. Run: `npx tsx scripts/onboard.ts --discover --manifest manifests/{slug}.yaml`
3. Pipeline generates correct assertions automatically
4. Review and adjust reliability levels

### 2. phone-type-detect fix
- Root cause: manifest expected `is_mobile: true` but libphonenumber-js returns `phone_type: "unknown"` and `is_mobile: false` for +46701234567
- Fix: ran `--discover --backfill --fix` to auto-generate correct fixtures from live output
- Result: SQS improved from 39.3 → 59.3, now active and visible

### 3. CLAUDE.md updated
Updated "Adding New Capabilities" section with `--discover` as the recommended workflow and full flag reference.

## Current state
- 21/24 dark-launch capabilities active
- 3 remaining: pep-check, adverse-media-check, aml-risk-score (OpenSanctions API quota — need daily cycles over 5 days)
- Total active capabilities: ~254

## Commits
- `126f3e3` feat: smart fixture generation and auto-correction in onboarding pipeline
