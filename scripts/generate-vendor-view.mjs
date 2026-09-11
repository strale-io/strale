#!/usr/bin/env node
// CLI: writes the agent-context view of config/vendors.yaml to
// docs/project/VENDORS.md (M3 batch 5, T6, shadow mode, not authoritative).
//
// This is the only writer of docs/project/VENDORS.md - never hand-edit it.
// `npm run vendors:check` fails with VENDOR_VIEW_STALE when the committed
// file no longer matches what this script would write.
//
// Usage: node scripts/generate-vendor-view.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderVendorView, repoRootFrom, VENDOR_VIEW_PATH } from "./vendors-lib.mjs";

const root = repoRootFrom(import.meta.url);
const content = renderVendorView(root);
const absolute = resolve(root, VENDOR_VIEW_PATH);
mkdirSync(dirname(absolute), { recursive: true });
writeFileSync(absolute, content, "utf8");
console.log(`wrote ${VENDOR_VIEW_PATH}`);
