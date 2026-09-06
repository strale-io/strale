# Hook setup evidence notes

The original receipt is a historical capture and is not rewritten after commit.
Its `committed: false` and `published: false` fields describe the capture time.
The producing tool ran at integration base `ffe81323` with the proposed
configuration in its working tree; this is fixture evidence, not a clean-tree
test of an already-published commit.

The `independentReview` filename in that capture resolves to the adjacent
[strale-hook-review-disposition.json](strale-hook-review-disposition.json).
That review is of the path-resolution change, not an exact-commit review of
subsequently added archive files. The PR records its separate commit review.

## Hash interpretation

The captured config hashes are SHA256 of the Windows worktree bytes that were
compared with the fixture. They are not the inventory's composite hashes.
`scripts/project-context-lib.mjs` function `hashFiles` hashes each path, NUL,
Git object ID, and NUL. It therefore cannot be compared with file-content SHA256.
Git also normalizes CRLF to LF for these tracked files. At implementation
commit `25f997fd`, the parsed configuration objects matched the tested bytes:

| File | Windows bytes SHA256 | Git LF blob SHA256 |
|---|---|---|
| `.claude/settings.json` | `52f3459132fc0ff9e8801807d914f3b869a913b7d8f36ff0a42d075bba536d59` | `82d2e39cbf6535074a9167701e7bbd33268437ddf42b84f9fce9262d3f3bb39e` |
| `.codex/hooks.json` | `dd84b32613efc688deacc208adde7fcca7f6115018332c5ec173a59543279798` | `b55ccecba9508f26a81a89d43991a52618ab95c1bbf5c02e02c576a0d7603458` |

## Review clarifications

CLAUDE.md retains both the September 2 and September 3 amendments, including
the PROGRAM.md batch-loop step 6 reference. The partial AGENTS.md copy was
removed, not the canonical record. Explicit current founder instructions
remain higher priority than those historical records.

The unsupported `_comment` field was observed in the Codex v0.153.4 interactive
startup error: unknown field `_comment`, expected `description` or `hooks`.
After the metadata fix, `/hooks` listed the two definitions and normal trust
made both active. No bypass flag was used. The fixture-only trust is not proof
of trust in any product checkout.

The duplicated launcher string is intentional: an additional relative launcher
file would recreate the path-discovery failure. Current commands avoid shell
variable expansion and pass paths as argv. Child timeout hardening and friendlier
Git failure messages are deferred; this patch preserves the existing failure
policy. All target scripts are tracked, unchanged, and present in worktrees.

Fixture scripts and full host logs remain in the local machine-setup task's
`outputs/` directory (`test-strale-hook-paths.py`, `audit-strale-hooks.py`, and
`strale-codex-hook-host-trusted.jsonl`). This archive is a capture, not a claim
that the local fixture harness is available from a fresh clone.
