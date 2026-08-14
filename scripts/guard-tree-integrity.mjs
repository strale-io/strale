#!/usr/bin/env node
/**
 * Working-tree integrity guard.
 *
 * Problem this exists for (2026-08-14, hit three times in one session):
 * multiple Claude Code sessions and background agents share this single
 * checkout. When an agent runs `git checkout <branch>` in the shared tree
 * while another process holds file locks — `tsc`, `vitest`, `npm`, an editor —
 * Windows makes git's delete-then-rewrite sequence fail partway. Git has
 * already unlinked the old files; it never writes the new ones. The result is
 * hundreds of tracked files simply gone from disk while the index still lists
 * them. Observed blast radius each time: apps/api/** and packages/** — exactly
 * where node processes hold handles.
 *
 * It looks alarming and is completely benign: the blobs are all in the object
 * store, so `git restore` rewrites them. The danger is not data loss, it's a
 * session spending its time confused by ENOENT on files that are supposedly
 * committed — or worse, "fixing" the phantom breakage.
 *
 * This guard detects that state and repairs it automatically. It ONLY ever
 * restores paths that are tracked-and-deleted (`git ls-files -d`), which
 * recreates them byte-for-byte from the index. It never touches modified
 * files, never touches untracked files, never checks out a different ref, and
 * never discards work. In the worst case it is a no-op.
 *
 * The real prevention is agent worktree isolation (see CLAUDE.md). This is the
 * safety net for when that slips.
 */

import { execFileSync } from "node:child_process";

const THRESHOLD = Number(process.env.TREE_GUARD_THRESHOLD ?? 20);

function git(args, opts = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
}

try {
  // Deleted-but-tracked paths. Cheap: index scan, no object reads.
  const out = git(["ls-files", "-d", "-z"]).trim();
  if (!out) process.exit(0);

  const deleted = out.split("\0").filter(Boolean);
  if (deleted.length < THRESHOLD) {
    // A handful of deletions is normal, intentional work (someone removing a
    // file). Only a mass deletion is the failure signature.
    process.exit(0);
  }

  // Restore in batches — Windows command-line length limits bite well before
  // 1,000 paths.
  const BATCH = 200;
  let restored = 0;
  for (let i = 0; i < deleted.length; i += BATCH) {
    const batch = deleted.slice(i, i + BATCH);
    git(["restore", "--", ...batch]);
    restored += batch.length;
  }

  const stillGone = git(["ls-files", "-d"]).trim();
  const remaining = stillGone ? stillGone.split("\n").filter(Boolean).length : 0;

  const msg =
    `[tree-guard] Repaired ${restored} tracked files that had been deleted from the ` +
    `working tree (interrupted branch switch in a shared checkout — see ` +
    `scripts/guard-tree-integrity.mjs).` +
    (remaining ? ` ${remaining} still missing — investigate.` : "");
  console.error(msg);
  process.exit(0);
} catch (err) {
  // Never fail the tool call this hook is attached to. A broken guard must not
  // become a broken session.
  console.error(`[tree-guard] skipped: ${err?.message ?? err}`);
  process.exit(0);
}
