import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM_ACCOUNT_EMAIL } from "./lib/internal-accounts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, "../../../.claude/state/last-activity-check.json");
const EXCLUDED_EMAILS = ["petter@strale.io", "test@strale.io", "test2@strale.io", SYSTEM_ACCOUNT_EMAIL, "test@example.com"];

function fmtCET(d: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm", timeZoneName: "short",
  }).formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "CET";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${tzName}`;
}

async function main() {
  const dryRun = process.argv.includes("--no-update");

  let since: Date;
  if (existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    since = new Date(state.last_checked_at);
  } else {
    since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log("(no prior state — defaulting to last 24h)");
  }

  const now = new Date();
  console.log(`\n=== Activity window ===`);
  console.log(`  from: ${fmtCET(since)}  (${since.toISOString()})`);
  console.log(`  to:   ${fmtCET(now)}  (${now.toISOString()})\n`);

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  const overview = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE t.payment_method = 'x402')::int AS x402,
           COUNT(*) FILTER (WHERE t.is_free_tier = true)::int AS free_tier,
           COUNT(*) FILTER (WHERE t.payment_method = 'wallet')::int AS wallet,
           COUNT(*) FILTER (WHERE t.solution_slug IS NOT NULL)::int AS solutions,
           COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed,
           COUNT(DISTINCT t.user_id)::int AS unique_users
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at > ${since.toISOString()}
      AND (u.email IS NULL OR u.email <> ALL(${EXCLUDED_EMAILS}))
      AND t.status <> 'health_probe'
  `;
  const o = overview[0];
  console.log(`External transactions: ${o.total} (${o.completed} completed, ${o.failed} failed)`);
  console.log(`  wallet: ${o.wallet}, free_tier: ${o.free_tier}, x402: ${o.x402}, solutions: ${o.solutions}`);
  console.log(`  unique users (incl. anon): ${o.unique_users}`);

  const byCap = await sql`
    SELECT c.slug AS capability, t.solution_slug, t.payment_method, t.is_free_tier, t.status, COUNT(*)::int AS count
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at > ${since.toISOString()}
      AND (u.email IS NULL OR u.email <> ALL(${EXCLUDED_EMAILS}))
      AND t.status <> 'health_probe'
    GROUP BY c.slug, t.solution_slug, t.payment_method, t.is_free_tier, t.status
    ORDER BY count DESC
  `;
  if (byCap.length > 0) {
    console.log(`\n--- Breakdown by capability ---`);
    for (const r of byCap) {
      const tier = r.is_free_tier ? "free" : (r.payment_method || "wallet");
      const label = r.capability || (r.solution_slug ? `solution:${r.solution_slug}` : "unknown");
      console.log(`  ${label} (${tier}, ${r.status}): ${r.count}`);
    }
  }

  const signups = await sql`
    SELECT u.email, u.created_at, COALESCE(w.balance_cents, 0) AS balance_cents
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    WHERE u.created_at > ${since.toISOString()}
      AND u.email <> ALL(${EXCLUDED_EMAILS})
    ORDER BY u.created_at DESC
  `;
  console.log(`\nSignups: ${signups.length}`);
  for (const r of signups) {
    console.log(`  ${fmtCET(r.created_at)}  ${r.email}  balance=${(r.balance_cents / 100).toFixed(2)} EUR`);
  }

  // Excludes internal accounts on the same basis as every other query above —
  // without the users join this counted our own curl testing as customer signal.
  const failedReqs = await sql`
    SELECT f.failure_type, COUNT(*)::int AS n
    FROM failed_requests f
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.created_at > ${since.toISOString()}
      AND (u.email IS NULL OR u.email <> ALL(${EXCLUDED_EMAILS}))
    GROUP BY f.failure_type
    ORDER BY n DESC
  `;
  if (failedReqs.length > 0) {
    // Gloss the DB enums so the report stays readable at a glance
    const gloss: Record<string, string> = {
      no_match: "no capability matched",
      missing_fields: "required inputs missing",
      input_confusion: "sent /v1/do body as inputs",
      input_misplaced: "inputs at top level",
    };
    const total = failedReqs.reduce((sum, r) => sum + r.n, 0);
    const breakdown = failedReqs
      .map(r => {
        const key = r.failure_type ?? "unknown";
        return `${key}${gloss[key] ? ` — ${gloss[key]}` : ""}: ${r.n}`;
      })
      .join(', ');
    console.log(`Failed request logs: ${total}  (${breakdown})`);

    // Split by crawler vs plain-client user agents
    const crawlerSplit = await sql`
      SELECT
        COUNT(*) FILTER (WHERE user_agent ~* 'bot|probe|monitor|crawl|explorer|healthcheck|health check|survey|oracle|census|index|discovery')::int AS crawler,
        COUNT(*) FILTER (WHERE user_agent IS NULL OR user_agent !~* 'bot|probe|monitor|crawl|explorer|healthcheck|health check|survey|oracle|census|index|discovery')::int AS plain
      FROM failed_requests f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE f.created_at > ${since.toISOString()}
        AND (u.email IS NULL OR u.email <> ALL(${EXCLUDED_EMAILS}))
    `;
    const cs = crawlerSplit[0];
    console.log(`  crawler-UA probes: ${cs.crawler}, plain-client: ${cs.plain}`);

    // Top plain-client x402_* slugs — the closest thing to a real demand
    // signal this table offers. Grouped by task (the slug asked for), with
    // the failure kind alongside so not_on_rail and unknown_slug stay
    // distinguishable.
    const plainClientX402 = await sql`
      SELECT f.task, f.failure_type, COUNT(*)::int AS n
      FROM failed_requests f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE f.created_at > ${since.toISOString()}
        AND (u.email IS NULL OR u.email <> ALL(${EXCLUDED_EMAILS}))
        AND f.failure_type LIKE 'x402_%'
        AND (f.user_agent IS NULL OR f.user_agent !~* 'bot|probe|monitor|crawl|explorer|healthcheck|health check|survey|oracle|census|index|discovery')
      GROUP BY f.task, f.failure_type
      ORDER BY n DESC
      LIMIT 8
    `;
    if (plainClientX402.length > 0) {
      console.log(`\n--- x402 demand misses (plain-client UAs only; heuristic — enumerators sometimes use plain UAs) ---`);
      for (const r of plainClientX402) {
        console.log(`  ${r.task} (${r.failure_type}): ${r.n}`);
      }
    }
  } else {
    console.log(`Failed request logs: 0`);
  }

  await sql.end();

  if (!dryRun) {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ last_checked_at: now.toISOString() }, null, 2));
    console.log(`\n(state updated → ${STATE_FILE})`);
  } else {
    console.log(`\n(--no-update passed, state not written)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
