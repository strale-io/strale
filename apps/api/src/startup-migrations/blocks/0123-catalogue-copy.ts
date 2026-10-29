import { sql } from "drizzle-orm";
import { CATALOGUE_COPY_0123_CAPABILITIES, CATALOGUE_COPY_0123_SOLUTIONS, type CatalogueCopyCapabilityRow, type CatalogueCopySolutionRow } from "../data/catalogue-copy-0123.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0123 (2026-10-26): the catalogue copy rewrite.
//
// Rewrites the public name and description of 296 tools (capabilities) to the
// final catalogue copy the manifests now carry, and corrects three
// bundled-check (solution) copy problems: web-extract-clean's claim that it
// gets past blocked pages ("even behind anti-bot walls" in description, "pages
// that block direct requests" in long_description, "page blocked need content"
// and "web scraping with anti-bot" in agent_description; false under
// DEC-20261023-A: the fetch path stops at blocks), ai-act-assess's stale
// "before the August 2026 deadline", and the kyb-essentials/kyb-complete/
// invoice-verify families' "... for United Kingdom" template in description and
// long_description. Copy only: no price, step or flag moves.
//
// The per-row data lives in ./catalogue-copy-0123.ts (old and new value per
// slug). The `// migration-data:` line inside the block makes the migration
// ledger hash that file together with this block, so editing the data is
// caught exactly like editing the block.
//
// Every write is guarded on the exact value production held in the
// 2026-10-26 snapshot (GET /v1/capabilities, GET /v1/solutions, and
// GET /v1/solutions/:slug for long_description and agent_description): a
// value someone changed since is never overwritten. Every column is its own
// UPDATE, so a tool whose name was edited still gets its new description and
// vice versa. Each UPDATE joins a VALUES list built with
// sql.join, never ANY(${array}) (that crash-loops boot; see block 0092). The
// block records itself and runs once. Rows chained from 0121 and 0122 (the
// five narrowed descriptions and sanctions-check) are guarded on those
// blocks' targets, so on a fresh database they apply in order.
// Authority: Petter's catalogue copy brief, 2026-10-26; the solution fixes are
// narrowing only (DEC-20260822-A part 2).
// `data` exists for the real-database test, which runs the block on synthetic
// slugs; boot calls the block with the executor alone, so production always
// applies the frozen rows in ./catalogue-copy-0123.ts.
export async function runMigration0123_catalogueCopy(
  tx: MigrationExecutor,
  data: {
    capabilities: readonly CatalogueCopyCapabilityRow[];
    solutions: readonly CatalogueCopySolutionRow[];
  } = { capabilities: CATALOGUE_COPY_0123_CAPABILITIES, solutions: CATALOGUE_COPY_0123_SOLUTIONS },
): Promise<BlockResult> {
  // migration-data: apps/api/src/lib/catalogue-copy-0123.ts
  const startedAt = Date.now();
  const BLOCK = "0123_catalogueCopy";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  // (slug, old_value, new_value) rows, one bound text parameter per cell.
  type Change = readonly [slug: string, oldValue: string, newValue: string];
  const values = (rows: readonly Change[]) =>
    sql.join(
      rows.map(([slug, oldValue, newValue]) => sql`(${slug}::text, ${oldValue}::text, ${newValue}::text)`),
      sql`, `,
    );

  const nameChanges: Change[] = data.capabilities
    .filter((r) => r.old_name !== r.name)
    .map((r) => [r.slug, r.old_name, r.name] as const);
  const descriptionChanges: Change[] = data.capabilities
    .filter((r) => r.old_description !== r.description)
    .map((r) => [r.slug, r.old_description, r.description] as const);
  const solutionChanges = (column: CatalogueCopySolutionRow["column"]): Change[] =>
    data.solutions
      .filter((r) => r.column === column && r.old_value !== r.value)
      .map((r) => [r.slug, r.old_value, r.value] as const);
  const solutionDescriptionChanges = solutionChanges("description");
  const solutionLongChanges = solutionChanges("long_description");
  const solutionAgentChanges = solutionChanges("agent_description");

  // No UPDATE here touches updated_at, deliberately. capabilities.updated_at is
  // read as "the capability itself changed": invariant-checker.ts flags an
  // auto-generated known_answer test as stale ground truth when
  // c.updated_at > ts.generation_capability_updated_at (check 5), and measures
  // how long a suspended tool has been suspended from updated_at. A copy-only
  // rewrite of 296 tools must move neither signal. Solutions follow the same
  // rule: this block changes words, not the bundle.

  const names = nameChanges.length === 0 ? [] : ((await tx.execute(sql`
    UPDATE capabilities AS c
       SET name = v.new_value
      FROM (VALUES ${values(nameChanges)}) AS v (slug, old_value, new_value)
     WHERE c.slug = v.slug
       AND c.name = v.old_value
     RETURNING c.slug
  `)) as unknown as Array<{ slug: string }>);

  const descriptions = descriptionChanges.length === 0 ? [] : ((await tx.execute(sql`
    UPDATE capabilities AS c
       SET description = v.new_value
      FROM (VALUES ${values(descriptionChanges)}) AS v (slug, old_value, new_value)
     WHERE c.slug = v.slug
       AND c.description = v.old_value
     RETURNING c.slug
  `)) as unknown as Array<{ slug: string }>);

  const solutionDescriptions = solutionDescriptionChanges.length === 0 ? [] : ((await tx.execute(sql`
    UPDATE solutions AS s
       SET description = v.new_value
      FROM (VALUES ${values(solutionDescriptionChanges)}) AS v (slug, old_value, new_value)
     WHERE s.slug = v.slug
       AND s.description = v.old_value
     RETURNING s.slug
  `)) as unknown as Array<{ slug: string }>);

  const solutionLongDescriptions = solutionLongChanges.length === 0 ? [] : ((await tx.execute(sql`
    UPDATE solutions AS s
       SET long_description = v.new_value
      FROM (VALUES ${values(solutionLongChanges)}) AS v (slug, old_value, new_value)
     WHERE s.slug = v.slug
       AND s.long_description = v.old_value
     RETURNING s.slug
  `)) as unknown as Array<{ slug: string }>);

  const solutionAgentDescriptions = solutionAgentChanges.length === 0 ? [] : ((await tx.execute(sql`
    UPDATE solutions AS s
       SET agent_description = v.new_value
      FROM (VALUES ${values(solutionAgentChanges)}) AS v (slug, old_value, new_value)
     WHERE s.slug = v.slug
       AND s.agent_description = v.old_value
     RETURNING s.slug
  `)) as unknown as Array<{ slug: string }>);

  const total =
    names.length + descriptions.length +
    solutionDescriptions.length + solutionLongDescriptions.length + solutionAgentDescriptions.length;

  // Written last: if anything above throws, boot aborts with nothing recorded and the next boot retries.
  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${total})
    ON CONFLICT (block) DO NOTHING
  `);

  const left = (done: number, planned: number) => (done < planned ? ` (${planned - done} left alone: changed since the snapshot or absent)` : "");
  return {
    block: BLOCK,
    outcome:
      `capabilities: ${names.length}/${nameChanges.length} name(s)${left(names.length, nameChanges.length)}, ` +
      `${descriptions.length}/${descriptionChanges.length} description(s)${left(descriptions.length, descriptionChanges.length)}; ` +
      `solutions: ${solutionDescriptions.length}/${solutionDescriptionChanges.length} description(s)${left(solutionDescriptions.length, solutionDescriptionChanges.length)}, ` +
      `${solutionLongDescriptions.length}/${solutionLongChanges.length} long_description(s)${left(solutionLongDescriptions.length, solutionLongChanges.length)}, ` +
      `${solutionAgentDescriptions.length}/${solutionAgentChanges.length} agent_description(s)${left(solutionAgentDescriptions.length, solutionAgentChanges.length)}`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
