import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import { revenueCents, payerIdentities } from './src/lib/metrics/metrics.js';
import type { Window } from './src/lib/metrics/types.js';

const day = (iso: string): Window => ({
  from: new Date(`${iso}T00:00:00.000Z`),
  to: new Date(`${iso}T23:59:59.999Z`),
  label: iso,
});

const days = ['2026-08-16','2026-08-17','2026-08-18','2026-08-19','2026-08-20','2026-08-21','2026-08-22','2026-08-23','2026-08-24','2026-08-25'];
for (const d of days) {
  const r = await revenueCents(day(d));
  console.log(d, r.status === 'observed' ? `€${(r.value/100).toFixed(2)}` : `unavailable(${JSON.stringify(r.reason)})`);
}
const p28 = await payerIdentities({ from: new Date('2026-08-15T00:00:00Z'), to: new Date(), label: 'since identity instrument' });
console.log('payerIdentities since 08-15:', JSON.stringify(p28));
process.exit(0);
