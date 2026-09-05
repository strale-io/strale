# Reproduce the consolidation checks

Run the Python block below from the repository root with Python 3. It reads local files and Git only, prints JSON and performs no API call. The output binds the checked documentation, companion inputs and observation files using SHA-256 of canonical LF text or raw PNG bytes. It is a dated consolidation check, not ongoing production enforcement or proof of successful invoice extraction.

The original kit-index-proof receipt is retained as historical output; it did not bind the documentation checks reproducibly. The replacement kit-index-bound-proof receipt is the evidence for those checks. Existing `npm run design:check`, `programs:check`, `research:check`, `docs:check`, `claims:check` and `receipts:check` remain separate repository gates.

```python
from pathlib import Path
import datetime, hashlib, json, re, subprocess

root = Path.cwd()
base = '9ac4a378b7a87b15be207d0f073c513dd85784a9'
recipe = 'archive/sessions/2026-09-06-brand-kit-launch-proof/VERIFY.md'
docs = [
    'design/README.md', 'design/PROVENANCE.md', 'design/brand-kit/README.md',
    'design/brand-kit/quiet-material/README.md',
    'design/brand-kit/quiet-material/foundations/README.md',
    'design/brand-kit/quiet-material/controls/README.md',
    'design/brand-kit/quiet-material/patterns/README.md',
    'docs/programs/brand-website/PROGRAM.md',
    'docs/programs/brand-website/SYSTEM-COMPLETION.md',
    'docs/programs/brand-website/PROOF-QUALIFICATION.md',
    'docs/research/2026-09-06-invoice-demo-qualification.md',
    'handoff/_general/from-code/2026-09-06-quiet-material-consolidation.md',
    recipe,
]
record_path = 'docs/programs/brand-website/system-completion.json'
record = json.loads((root / record_path).read_text(encoding='utf8'))
assert record['kit_entry'] == 'design/brand-kit/README.md'
assert record['production_adoption'] is False
assert [p['id'] for p in record['kit_parts']] == ['atmosphere','foundations','controls','patterns']
inputs = set(docs + [record_path, 'docs/programs/brand-website/tracks.yaml'])
retained = ['design/tokens/active.json']
for part in record['kit_parts']:
    assert re.fullmatch(r'2026-09-0[56]', part['accepted_on'])
    for field in ['guide','rules','tokens','verification']:
        assert (root / part[field]).is_file(), part[field]
        inputs.add(part[field])
    rules = json.loads((root / part['rules']).read_text(encoding='utf8'))
    assert rules['production_adopted'] is False
    retained.extend([part['rules'], part['tokens']])
assert len(record['gaps']) == len({g['id'] for g in record['gaps']})
for gap in record['gaps']:
    assert (root / gap['evidence']).is_file(), gap['id']
    inputs.add(gap['evidence'])
for file in docs:
    text = (root / file).read_text(encoding='utf8')
    for dest in re.findall(r'\]\(([^)]+)\)', text):
        if re.match(r'^[a-z]+:', dest) or dest.startswith('#'):
            continue
        assert ((root / file).parent / dest.split('#')[0]).exists(), (file, dest)
def canonical(file):
    path = root / file
    return path.read_bytes() if path.suffix == '.png' else path.read_text(encoding='utf8').encode('utf8')
for file in retained:
    original = subprocess.check_output(['git','show',base + ':' + file])
    assert canonical(file) == original.replace(b'\r\n', b'\n'), file
    inputs.add(file)
folder = root / 'archive/sessions/2026-09-06-brand-kit-launch-proof'
inputs.update(str(p.relative_to(root)).replace('\\','/') for p in folder.iterdir() if p.is_file())
print(json.dumps({
    'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'producer': {'recipe': recipe, 'base_commit': base, 'runtime': 'Python 3 + Git'},
    'hash_basis': 'UTF-8 text with LF; raw PNG bytes',
    'checks': {'current_companion_paths': True, 'gap_evidence_paths': True,
               'document_links': True, 'retained_token_and_rule_bytes': True},
    'inputs': {f: hashlib.sha256(canonical(f)).hexdigest() for f in sorted(inputs)},
    'limits': 'Checks documentation and retained inputs only; no live execution, retrieval, price or latency qualification.'
}, indent=2))
```
