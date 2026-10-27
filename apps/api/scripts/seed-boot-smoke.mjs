// Offline catalogue fixture for the disposable image-smoke database ONLY.
// Does not onboard capabilities, run executors or generate test suites.
import postgres from "postgres";
import yaml from "js-yaml";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireInputs } from "../../../scripts/require-inputs.mjs";

const url = new URL(process.env.DATABASE_URL_TEST ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/strale_boot_test") {
  throw new Error("Boot fixture requires loopback strale_boot_test; never use a production database");
}
const db = postgres(url.href, { max: 1 });
try {
  const [{ count }] = await db`SELECT count(*)::int AS count FROM capabilities`;
  if (count !== 0) throw new Error("Boot fixture requires an empty catalogue");
  const dir = resolve(import.meta.dirname, "../../../manifests");
  const files = requireInputs(readdirSync(dir).filter((f) => f.endsWith(".yaml")), "boot fixture: manifests/*.yaml");
  for (const file of files) {
    const m = yaml.load(readFileSync(resolve(dir, file), "utf8"));
    await db`INSERT INTO capabilities
      (slug, name, description, category, input_schema, output_schema, price_cents,
       transparency_tag, is_active, visible, marketplace_eligible, lifecycle_state, cost_class)
      VALUES (${m.slug}, ${m.name}, ${m.description}, ${m.category},
        ${db.json(m.input_schema ?? {})}, ${db.json(m.output_schema ?? {})}, ${m.price_cents},
        ${m.transparency_tag}, true, true, true, 'active', 'free_unlimited')`;
  }
  console.log(`Offline boot fixture: ${files.length} catalogue rows; no executors invoked`);
} finally {
  await db.end();
}
