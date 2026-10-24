// strale.dev redesign (DEC-20260902-A). Static output: every page is generated
// at build time from the live API (src/lib/site-data.ts). No adapter, no server.
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  site: process.env.STRALE_SITE_URL ?? "https://strale.dev",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  devToolbar: { enabled: false },
  vite: {
    resolve: { alias: { "@design": fileURLToPath(new URL("../../design", import.meta.url)) } },
    server: { fs: { allow: [repoRoot] } },
  },
});
