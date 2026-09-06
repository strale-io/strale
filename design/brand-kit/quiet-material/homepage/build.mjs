import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const check = process.argv.includes('--check');
const registryArg = process.argv.indexOf('--registry');
const evidenceArg = process.argv.indexOf('--evidence');
const briefArg = process.argv.indexOf('--brief');
const lf = value => String(value).replace(/\r\n/g, '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));

const registry = registryArg >= 0
  ? JSON.parse(await readFile(resolve(process.argv[registryArg + 1]), 'utf8'))
  : await readJson('design/brand-kit/quiet-material/homepage/registry.json');
const brief = briefArg >= 0
  ? JSON.parse(await readFile(resolve(process.argv[briefArg + 1]), 'utf8'))
  : await readJson('docs/programs/brand-website/homepage-brief.json');
const patterns = await readJson('design/brand-kit/quiet-material/patterns/registry.json');
const controls = await readJson('design/brand-kit/quiet-material/controls/registry.json');
const patternTokens = await readJson('design/tokens/candidates/quiet-material-patterns.json');
const pageTokens = await readJson('design/tokens/candidates/quiet-material-homepage.json');
const atmosphereRegistry = await readJson('design/brand-kit/quiet-material/registry.json');
const illustrationRegistry = await readJson('design/brand-kit/quiet-material/illustrations/registry.json');

for (const binding of registry.source_bindings) {
  const bytes = await readFile(resolve(root, binding.path));
  const input = binding.mode === 'text-lf' ? Buffer.from(lf(bytes.toString('utf8'))) : bytes;
  if (hash(input) !== binding.sha256) throw new Error(`Source binding changed: ${binding.id}`);
}
for (const asset of registry.assets) {
  const bytes = await readFile(resolve(here, asset.file));
  if (hash(bytes) !== asset.sha256) throw new Error(`Asset binding changed: ${asset.id}`);
}
if (pageTokens.status !== 'proposed' || pageTokens.provenance.source !== registry.reference_lock) throw new Error('Homepage token candidate must remain proposed and reference-locked.');
if (registry.production_adopted || registry.publication_approved || registry.status !== 'composition-study') throw new Error('Homepage study state cannot imply production or publication approval.');
for (const [name, value] of Object.entries(pageTokens.layout.retained_css_variables)) {
  if (patternTokens.layout.css_variables[name] !== value) throw new Error(`Retained token role drifted: ${name}`);
}
if (controls.navigation.pattern !== 'disclosure' || controls.navigation.escape !== 'close-and-return-focus') throw new Error('Accepted navigation behavior changed.');
if (patterns.story.fixture_label !== 'Illustrative example' || patterns.story.result.length !== 3) throw new Error('Accepted fixture contract changed.');
const executionRecord = brief.sections.find(section => section.id === 'execution-record');
const executionGate = 'Outline only until successful own-transaction retrieval. Do not render invented product fields or a fictional dashboard.';
if (!executionRecord || executionRecord.design_gate !== executionGate) throw new Error('Execution-record design gate is missing or changed.');
const heroAsset = atmosphereRegistry.assets.find(asset => asset.id === 'hero-folded-light-background');
const localHero = registry.assets.find(asset => asset.id === 'hero-folded-light-background');
if (!heroAsset || localHero.source_id !== heroAsset.id || localHero.role !== 'opening-atmosphere-only' || heroAsset.role !== 'Opening anchor' || heroAsset.sha256 !== localHero.sha256 || heroAsset.width !== localHero.width || heroAsset.height !== localHero.height) throw new Error('Opening atmosphere registry binding changed.');

const sections = Object.fromEntries(brief.sections.map(section => [section.id, section]));
if (JSON.stringify(registry.sections) !== JSON.stringify(['opening', 'breadth', 'shared-access', 'begin'])) throw new Error('Homepage must retain the exact four-section order.');
if (registry.excluded_sections.length !== 1 || registry.excluded_sections[0].id !== 'execution-record') throw new Error('Blocked execution-record exclusion must remain explicit.');
for (const id of registry.sections) if (!sections[id]) throw new Error(`Missing canonical section: ${id}`);
if (registry.sections.includes('execution-record')) throw new Error('Blocked execution-record section cannot be rendered.');
if (JSON.stringify(registry.outputs.generated) !== JSON.stringify(['index.html', 'details.html', 'tokens.css', 'manifest.json']) || JSON.stringify(registry.outputs.authored) !== JSON.stringify(['stylesheet.css', 'interactions.js']) || JSON.stringify(registry.outputs.evidence) !== JSON.stringify(['verification.json', 'output/homepage-desktop.png', 'output/homepage-mobile.png'])) throw new Error('Homepage output inventory changed.');

const destinationHref = id => id === 'catalogue' ? '#breadth' : `details.html#${encodeURIComponent(id)}`;
const action = (item, kind) => `<a class="action ${kind}" href="${destinationHref(item.destination)}">${esc(item.label)}</a>`;
const logo = `<img class="brand-lockup" src="../foundations/exports/lockup-ink.svg" width="116" height="34" alt="Strale">`;
const navLinks = `
  <a href="#breadth">Tools</a>
  <a href="#shared-access">How it works</a>
  <a href="details.html#pricing">Pricing</a>
  <a href="details.html#access-guide">Read the docs</a>`;
const resultRows = patterns.story.result.map(row => `<div><dt>${esc(row.label)}</dt><dd>${esc(row.value)}</dd></div>`).join('');
const arrow = patterns.icons.items.find(icon => icon.id === 'arrow-right');
if (!arrow) throw new Error('Accepted arrow-right utility is missing.');
const arrowIcon = `<svg class="task-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${esc(arrow.path)}"/></svg>`;
const documentIconSource = patterns.icons.items.find(icon => icon.id === 'document');
if (!documentIconSource) throw new Error('Accepted document utility is missing.');
const documentIcon = `<svg class="document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${esc(documentIconSource.path)}"/></svg>`;
const choiceRows = sections.breadth.choices.map(choice => `<a class="task-row" href="details.html#${esc(choice.destination)}"><span><strong>${esc(choice.headline)}</strong><small>${esc(choice.body)}</small></span>${arrowIcon}</a>`).join('');
const document = patterns.story.document;

const index = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Strale — Homepage composition study</title>
  <link rel="stylesheet" href="tokens.css">
  <link rel="stylesheet" href="stylesheet.css">
  <script src="interactions.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="nav-shell">
      <a class="brand-link" href="index.html" aria-label="Strale homepage study">${logo}</a>
      <nav class="desktop-nav" aria-label="Primary">${navLinks}</nav>
      <button class="menu-trigger" type="button" data-disclosure aria-expanded="false" aria-controls="mobile-menu"><span>Menu</span><span class="caret" aria-hidden="true"></span></button>
      <nav class="mobile-menu" id="mobile-menu" aria-label="Mobile" hidden>${navLinks}</nav>
    </div>
  </header>
  <main id="main">
    <section class="opening" id="opening" data-section="opening">
      <div class="hero-shell">
        <div class="hero-copy">
          <h1>${esc(sections.opening.headline)}</h1>
          <p>${esc(sections.opening.body)}</p>
          <div class="action-group">${action(sections.opening.primary, 'primary')}${action(sections.opening.supporting, 'text')}</div>
        </div>
        <div class="hero-visual" aria-label="Illustrative invoice extraction example">
          <img class="folded-light" src="assets/hero-folded-light.png" alt="" width="${localHero.width}" height="${localHero.height}">
          <div class="example-composition">
            <article class="invoice-paper" aria-label="Illustrative invoice from ${esc(document.company)}, ${esc(document.number)}, total ${esc(document.total)}">
              <div class="document-heading">${documentIcon}<span>${esc(document.title)}</span></div>
              <h2>${esc(document.company)}</h2>
              <p class="document-number">${esc(document.number)}</p>
              <div class="document-lines" aria-hidden="true"><i></i><i></i><i></i></div>
              <div class="document-total"><span>Total</span><strong>${esc(document.total)}</strong></div>
            </article>
            <article class="result-panel">
              <p class="fixture-label">${esc(patterns.story.fixture_label)}</p>
              <h2>Useful fields</h2>
              <dl>${resultRows}</dl>
            </article>
          </div>
        </div>
      </div>
    </section>
    <section class="breadth" id="breadth" data-section="breadth">
      <div class="open-shell">
        <h2>${esc(sections.breadth.headline)}</h2>
        <div class="task-list">${choiceRows}</div>
      </div>
    </section>
    <section class="shared-access" id="shared-access" data-section="shared-access">
      <div class="open-shell">
        <div class="access-copy">
          <h2>${esc(sections['shared-access'].headline)}</h2>
          <p>${esc(sections['shared-access'].body)}</p>
          ${action(sections['shared-access'].supporting, 'text')}
        </div>
        <picture class="access-picture">
          <source media="(max-width: 760px)" srcset="../illustrations/exports/shared-access-narrow-light.svg">
          <img src="../illustrations/exports/shared-access-desktop-light.svg" alt="${esc(illustrationRegistry.alt)}" width="1080" height="360">
        </picture>
      </div>
    </section>
    <section class="begin" id="begin" data-section="begin">
      <div class="closing-shell">
        <div>
          <h2>${esc(sections.begin.headline)}</h2>
          <p>${esc(sections.begin.body)}</p>
        </div>
        <div class="action-group">${action(sections.begin.primary, 'inverse')}${action(sections.begin.supporting, 'inverse-text')}</div>
      </div>
    </section>
  </main>
  <footer class="site-footer">
    <div class="footer-shell">
      <span>Strale</span>
      <nav aria-label="Footer"><a href="#breadth">Tools</a><a href="details.html#access-guide">Documentation</a><a href="details.html#pricing">Pricing</a></nav>
    </div>
  </footer>
</body>
</html>
`;

const detailSections = brief.destinations.filter(destination => destination.id !== 'catalogue').map(destination => `<section id="${esc(destination.id)}"><p class="fixture-label">Study destination</p><h2>${esc(destination.id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '))}</h2><p>${esc(destination.purpose)}</p><p class="detail-status">Current study status: ${esc(destination.status.replaceAll('-', ' '))}.</p><a class="action text" href="index.html">Return to the homepage study</a></section>`).join('');
const details = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Strale study destinations</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="stylesheet.css"></head>
<body class="details-page"><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="nav-shell"><a class="brand-link" href="index.html" aria-label="Return to the Strale homepage study">${logo}</a><a class="action text" href="index.html">Return to study</a></div></header><main id="main" class="details-shell"><header><p class="fixture-label">Local composition study</p><h1>Intended destinations.</h1><p>These notes describe where each study link is meant to lead. They do not stand in for qualified production routes.</p></header>${detailSections}</main></body></html>
`;

const variables = {...pageTokens.layout.retained_css_variables, ...pageTokens.layout.page_css_variables};
const tokensCss = `/* Generated from design/tokens/candidates/quiet-material-homepage.json. */\n:root {\n${Object.entries(variables).map(([name,value]) => `  ${name}: ${value};`).join('\n')}\n}\n`;
const outputs = {'index.html': index, 'details.html': details, 'tokens.css': tokensCss};
const sourceFiles = ['registry.json', 'build.mjs', 'stylesheet.css', 'interactions.js', 'verify.mjs'];
const sourceHashes = {};
for (const file of sourceFiles) sourceHashes[file] = hash(Buffer.from(lf(await readFile(resolve(here, file), 'utf8'))));
const manifest = {
  schema_version: 1,
  generated_by: 'design/brand-kit/quiet-material/homepage/build.mjs',
  sources: Object.fromEntries(registry.source_bindings.map(binding => [binding.id, binding.sha256])),
  candidate_token: hash(Buffer.from(lf(await readFile(resolve(root, 'design/tokens/candidates/quiet-material-homepage.json'), 'utf8')))),
  local_sources: sourceHashes,
  assets: Object.fromEntries(registry.assets.map(asset => [asset.file, asset.sha256])),
  outputs: Object.fromEntries(Object.entries(outputs).map(([file, content]) => [file, hash(Buffer.from(lf(content)))]))
};
outputs['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`;

for (const [file, content] of Object.entries(outputs)) {
  const target = resolve(here, file);
  if (check) {
    const current = lf(await readFile(target, 'utf8'));
    if (current !== lf(content)) throw new Error(`Generated output drift: ${file}`);
  } else {
    await writeFile(target, lf(content), 'utf8');
  }
}
if (check) {
  const evidence = evidenceArg >= 0
    ? JSON.parse(await readFile(resolve(process.argv[evidenceArg + 1]), 'utf8'))
    : await readJson('design/brand-kit/quiet-material/homepage/verification.json');
  const expectedManifestHash = hash(Buffer.from(lf(outputs['manifest.json'])));
  if (evidence.status !== 'passed' || evidence.manifest_sha256 !== expectedManifestHash) throw new Error('Homepage verification evidence is stale.');
  if (JSON.stringify(evidence.widths) !== JSON.stringify([320, 375, 760, 761, 1120, 1440])) throw new Error('Homepage verification widths are incomplete.');
  const expectedInputs = {sources: manifest.sources, candidate_token: manifest.candidate_token, local_sources: manifest.local_sources, assets: manifest.assets, generated_outputs: manifest.outputs};
  if (JSON.stringify(evidence.inputs) !== JSON.stringify(expectedInputs)) throw new Error('Homepage verification input/output inventory is stale.');
  const requiredChecks = ['retained_source_hashes','output_integrity','execution_gate_contract','responsive_bounds','breakpoint_switch','image_decode','bundled_fonts','contrast','density_limits','execution_record_absent','access_label_size','picture_sources','mobile_disclosure_keyboard','disclosure_dismissal','local_link_targets','zero_remote_requests','browser_console_clean','screenshot_exports'];
  if (JSON.stringify(Object.keys(evidence.checks)) !== JSON.stringify(requiredChecks) || requiredChecks.some(key => evidence.checks[key] !== true)) throw new Error('Homepage verification required checks are incomplete.');
  const requiredScreenshots = ['output/homepage-desktop.png','output/homepage-mobile.png'];
  if (JSON.stringify(Object.keys(evidence.screenshots)) !== JSON.stringify(requiredScreenshots)) throw new Error('Homepage screenshot evidence is incomplete.');
  for (const [file, expected] of Object.entries(evidence.screenshots)) {
    if (hash(await readFile(resolve(here, file))) !== expected) throw new Error(`Screenshot evidence drift: ${file}`);
  }
}
console.log(check ? 'Homepage generated outputs are current.' : 'Homepage study generated.');
