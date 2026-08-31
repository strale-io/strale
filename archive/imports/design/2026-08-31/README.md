# Design evidence preservation checkpoint — 2026-08-31

This directory is a byte-for-byte preservation checkpoint created during M0
of the repo-native operating-model migration.

Its contents are evidence, not product truth. Importing an artifact here does
not mean that its design, copy, implementation, or commercial claims have been
reviewed, accepted, merged, or deployed.

## Sources

- `website-design-handoff/` preserves the former non-Git handoff directory at
  `C:/Users/pette/Projects/strale-website-design-handoff-2026-08-25`.
- `brandkit-strale-website/` preserves the untracked Strale website experiment
  formerly held under the Brandkit working copy at
  `C:/Users/pette/Projects/brandkit-lab-strale-design/experiments/strale-website`.

`manifest.json` records the original absolute path, repository archive path,
byte size, and SHA-256 digest of every imported source file. The 56 entries
total 41,890,178 bytes. All archived copies were re-hashed after copying and
matched their sources.

The active frontend redesign working state is preserved separately on remote
branch `codex/homepage-redesign-batch-a` at commit
`998964716c8601be67d4e71a508a803160434517`. That branch remains a
preservation branch, not an accepted or deployable design baseline.

The frontend's owning session continued to make changes after the remote
checkpoint. `frontend-live-delta-after-9989647/` is a point-in-time,
byte-for-byte snapshot of the 28 modified/untracked files visible immediately
after that push (24,525,521 bytes), with its own manifest. It preserves the
cutoff without claiming that the independently active working session is done.
