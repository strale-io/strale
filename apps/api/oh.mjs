import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const q = async (k, s) => { try { console.log('##', k, JSON.stringify(await s)); } catch (e) { console.log('##', k, 'ERR:', e.message); } };
await q('breakers', sql`SELECT capability_slug, state, consecutive_failures, opened_at FROM capability_health WHERE state <> 'closed' ORDER BY opened_at DESC NULLS LAST LIMIT 20`);
await q('withdrawn', sql`SELECT slug, is_active, x402_enabled FROM capabilities WHERE is_active = false OR (x402_enabled = false AND is_free_tier = true) ORDER BY slug LIMIT 40`);
await q('floor_events', sql`SELECT capability_slug, event_type, created_at, reason FROM quality_floor_events WHERE created_at > NOW() - INTERVAL '4 days' ORDER BY created_at DESC LIMIT 15`);
await sql.end();
