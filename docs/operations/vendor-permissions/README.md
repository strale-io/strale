# Vendor and source permissions

One archived file per permission, named `YYYY-MM-DD-vendor.md` using the
reply date. Each file records the wording available, sender role address,
sent date, how it was read, scope and exclusions, and Petter’s acceptance.

Files are written once and never edited. Archive any later change in a new
file, preserving the earlier evidence. The current typed permission record
lives in `apps/api/src/lib/vendor-terms.data.json`; `vendor-terms:check`
checks evidence and prevents silent downgrades against the merge-base.

A `written_permission` accepted by Petter is settled. Reopen only when one
of its `reopen_only_if` events happens, citing the event, new evidence and
superseding decision. A removed vendor row cannot carry `superseded`;
retain a row with its new resale status when reopening it.
