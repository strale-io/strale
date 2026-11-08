Intent: onboarding failures name their safe cause, so a failed run can be diagnosed without database access.

- **Trigger:** the image-resize backfill (2026-11-08) failed at `persistence` with `pipeline_error` and nothing else.
- **Change:** the run's final catch in `apps/api/src/lib/onboarding-pipeline.ts` now logs and returns:
  - `error_class`, when the constructor name is identifier-shaped;
  - for an `AuthorityViolationError`, code `authority_violation` plus the drifted field names and their fixed reasons, never the values.
- **Authors:** built by Codex (a47362c6); the review fixes and hardening were done by Claude. See `docs/lanes/codex/onboarding-error-detail-report.md`.
- **Next:** after deploy, re-run the image-resize backfill. Its failure, if any, now names the drifted fields.
