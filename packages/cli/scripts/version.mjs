import { readFileSync, writeFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
writeFileSync(new URL("../src/package-version.ts", import.meta.url), `// Generated from package metadata by scripts/version.mjs.\nexport const CLIENT_ID = ${JSON.stringify(`strale-cli/${version}`)};\nexport const VERSION = ${JSON.stringify(version)};\n`);
