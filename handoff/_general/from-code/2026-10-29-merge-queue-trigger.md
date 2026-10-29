Intent: let the required CI checks run in a GitHub merge queue, so the founder can turn the queue on without it stalling.

- `.github/workflows/ci.yml` now also triggers on `merge_group`. `classify` treats any non-`pull_request` event as "run everything", so queued merge commits get the full gate, with no docs-only fast path. The four required checks (`classify`, `check`, `integration-db`, `image-boot-smoke`) are all in this workflow.
- The queue itself is a repository setting, and is a founder ask on the bus (needs-founder). Until it's on, the trigger never fires and nothing changes.
- After the queue is on: watch the first queued merge, and confirm all four checks report on the `gh-readonly-queue/main/...` ref, and that `stale-branches.yml` and the handoff gate ignore those temporary branches.
