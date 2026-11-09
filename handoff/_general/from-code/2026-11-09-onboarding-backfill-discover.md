Intent: a backfill with discover on no longer fails on its own discovery.

- **Trigger:** the image-resize backfill failed twice on 2026-11-09 with `authority_violation` on `output_field_reliability`, then succeeded with discover off. Discovery had merged the unlisted `format` field into the manifest that the database check compares.
- **Change:** in backfill mode, discovery no longer changes any manifest-canonical field before persistence.
  - The discovered fields go to the review YAML.
  - A `discovered_fields_not_applied` notice names them, and it now shows in the workflow summary on success too.
- **Authors:** built by Codex (7794f2df); review fixes by Claude. See `docs/lanes/codex/onboarding-backfill-discover-report.md`.
- **Follow-up (PC):** add `format: guaranteed` to `manifests/image-resize.yaml` and to its `output_schema` properties, then sync the database row with `sync-manifest-canonical-to-db.ts image-resize --fields output_field_reliability,output_schema`.
