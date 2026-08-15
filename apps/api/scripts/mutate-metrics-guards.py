"""Mutation-test the metrics guards.

Rewritten after the first version crashed mid-run, left a mutation applied, and
then reported every subsequent mutation as CAUGHT — because the broken guard was
failing the suite regardless of what was mutated. Three fixes: a baseline check
before each mutation, a try/finally so a crash cannot leave the tree dirty, and
a skip is reported as a skip rather than counted as a pass.
"""
import io, subprocess, sys

API = r'C:\Users\pette\Projects\strale\apps\api'
INST = API + r'\src\lib\metrics\instruments.ts'
POP = API + r'\src\lib\metrics\populations.ts'
TYP = API + r'\src\lib\metrics\types.ts'
BASELINE = 'Tests  14 passed'

MUTATIONS = [
    (INST, 'return spec.enabledAt <= from ? { ok: true } : { ok: false, enabledAt: spec.enabledAt };',
           'return { ok: true };',
     'coversWindow always allows -> failure 2 (metric older than its instrument)'),
    (INST, 'return new Date(Math.max(...(dates as Date[]).map((d) => d.getTime())));',
           'return new Date(Math.min(...(dates as Date[]).map((d) => d.getTime())));',
     'commonWindowStart takes earliest -> failure 3 (steps over different windows)'),
    (POP, 'if (!ua) return "unknown";', 'if (!ua) return "customer_candidate";',
     'absent user agent counted as demand -> failure 4'),
    (POP, '''const KNOWN_MONITORS = [
  "glimind-probe", "mcpbeat", "yellowmcp-health", "aisec-registry-probe",
  "reliability-bureau-spike", "mcpscoringengine", "x402-observatory",
];''', 'const KNOWN_MONITORS = ["probe", "health", "beat", "registry", "monitor", "bot"];',
     'substring matching restored -> would discard a real company-registry-bot'),
    (TYP, 'trustworthy: false,\n      };', 'trustworthy: true,\n      };',
     'estimates presented as observed'),
]

def run():
    r = subprocess.run(['npx', 'vitest', 'run', 'src/lib/metrics/metrics.test.ts'],
                       cwd=API, capture_output=True, text=True, shell=True,
                       encoding='utf-8', errors='replace')
    return (r.stdout or '') + (r.stderr or '')

if BASELINE not in run():
    print('ABORT: suite is not green before mutating. Fix that first.')
    sys.exit(2)
print('baseline green\n')

caught, survived, skipped = [], [], []
for path, old, new, desc in MUTATIONS:
    src = io.open(path, encoding='utf-8').read()
    if old not in src:
        skipped.append(desc); print('SKIP     - ' + desc); continue
    try:
        io.open(path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
        out = run()
        if BASELINE in out:
            survived.append(desc); print('SURVIVED - ' + desc)
        else:
            caught.append(desc); print('CAUGHT   - ' + desc)
    finally:
        io.open(path, 'w', encoding='utf-8').write(src)  # always revert

print()
print('caught %d, survived %d, skipped %d (of %d)'
      % (len(caught), len(survived), len(skipped), len(MUTATIONS)))
if BASELINE not in run():
    print('ABORT: tree not clean after revert.'); sys.exit(2)
print('tree restored, suite green')
sys.exit(1 if (survived or skipped) else 0)
