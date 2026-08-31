#!/usr/bin/env node

import {
  assertIsolatedWorktree,
  isDirectInvocation,
  repoRootFrom,
  writeGeneratedFiles,
} from "./project-context-lib.mjs";

export function generate(root = repoRootFrom(import.meta.url)) {
  assertIsolatedWorktree(root);
  return writeGeneratedFiles(root);
}

if (isDirectInvocation(import.meta.url)) {
  const files = generate();
  console.log(`generated ${files.length} non-authoritative project-context files`);
  for (const file of files) console.log(`  ${file}`);
}
