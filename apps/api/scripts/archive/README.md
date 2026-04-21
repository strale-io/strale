# Archived one-shot scripts

This directory holds scripts that were used for specific historical operations and are preserved as pattern reference, not for reuse. Each script references the DEC that produced it.

## Current contents

### phase-dec-b-backfill.ts

Used for Stage C.1 of DEC-20260423-A (capability onboarding pipeline coverage fix, 2026-04-23). Backfilled 21 active capabilities with NULL `output_field_reliability` via live `--discover` execution. 18 passed, 3 failed due to missing known_answer fixtures (parked in Stage C.2).

Not for reuse. Backfill for future capabilities flows through `persistCapability` + `checkReadiness` per DEC-20260423-B. If a similar mass backfill is ever needed again, this script is pattern reference for how to sequence discovery runs safely against prod.

### phase-dec-b-park.ts

Used for Stage C.2 of DEC-20260423-A. Parked 12 capabilities permanently: 9 UK-property per DEC-20260421-L pattern, 3 blocked-backfill pending fixtures. Wrote `deactivation_reason` with tombstone context (the prompt assumed `deactivated_at` and `deactivation_note` columns which don't exist on the `capabilities` table; schema substitution documented in DEC-20260423-A Outcome).

Not for reuse. Park pattern is documented in DEC-20260421-L.
