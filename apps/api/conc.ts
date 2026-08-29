import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import { concentration, payerFacts } from './src/lib/metrics/commercial.js';
import type { Window } from './src/lib/metrics/types.js';

const w = (a: string, b: string, label: string, partial = false): [Window, boolean] => ([{
  from: new Date(`${a}T00:00:00.000Z`), to: new Date(`${b}T23:59:59.999Z`), label,
}, partial]);

const windows = [
  w('2026-08-10','2026-08-16','week 08-10 (completed)'),
  w('2026-08-17','2026-08-23','week 08-17 (completed)'),
  w('2026-08-24','2026-08-25','week 08-24 (2 days)', true),
];

for (const [win, partial] of windows) {
  const pf = await payerFacts(win);
  if (pf.status !== 'observed') { console.log(win.label, 'unavailable', JSON.stringify(pf.reason)); continue; }
  const v = await concentration(win, pf.value.payers, pf.value.unattributedCents, { partialWindow: partial });
  console.log(`\n### ${win.label}`);
  console.log(`  payers=${v.payers} topShare=${(v.topShare*100).toFixed(1)}% top=€${(v.topCents/100).toFixed(2)} others=€${(v.othersCents/100).toFixed(2)} unattr=€${(v.unattributedCents/100).toFixed(2)}`);
  console.log(`  attributed=${(v.attributedShare*100).toFixed(1)}% comparable=${v.comparable} repeat=${v.repeatPayers} exclTop=${v.repeatPayersExcludingTop} payingDays=${v.activePayingDays} new=${v.newPayers} returning=${v.returningPayers}`);
  for (const p of [...pf.value.payers].sort((a,b)=>b.cents-a.cents)) {
    console.log(`   ${p.key.slice(0,12)}… €${(p.cents/100).toFixed(2)} calls=${p.calls} days=${p.activeDays} first=${p.firstSeen.slice(0,10)} last=${p.lastSeen.slice(0,10)} firstSlug=${p.firstSlugInWindow}`);
  }
}
process.exit(0);
