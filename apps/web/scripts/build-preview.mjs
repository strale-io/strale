// Builds the preview (repository manifests instead of the live API) on any OS:
// sets STRALE_SITE_DATA for the child process rather than relying on shell syntax.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["astro", "build"], { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, STRALE_SITE_DATA: "manifests" } });
process.exit(r.status ?? 1);
