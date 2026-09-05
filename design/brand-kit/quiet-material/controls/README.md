# Quiet Material: navigation, controls and cards

**Accepted for continued design work.** The founder accepted this companion on 5 September 2026. This records design acceptance; the packaged candidate status and production tokens remain unchanged. [Start at the complete kit index](../../README.md).

Current component companion candidate, revision 0.1, within the retained Quiet Material kit. Open [the interactive specimen](index.html) to try controls; [the PDF](output/pdf/navigation-controls.pdf) is its six-page review view. The same builder, tokens and rules produce both. The founder retained the existing flowing-S logo after a brief symbol exploration; generated alternatives are closed and are not build inputs. The identity/type companion and short direct-light-text dark-card direction were accepted for continued design work. Production adoption remains separate.

## What to assess

1. Overall relationship to the accepted kit, especially the direct-text Dusk card.
2. Primary, secondary, text and inverse actions; hover, pressed, keyboard, unavailable and loading behaviour.
3. Desktop disclosure and secondary topic navigation.
4. Mobile menu: open with Enter/Space, Tab through links, Escape to close and restore focus.
5. Marketing, discovery and result cards: different composition and interaction roles.
6. Clear success/error feedback and restrained motion.

The interactive document runs offline. Example links announce their intended destination in the specimen; loading and retry are local simulations and call no product API. Printed menus are shown open for review. The specimens do not establish any product claim, execution outcome or availability.

## Canonical inputs and boundaries

[registry.json](registry.json) owns permitted roles, behaviours, density and limits. [The token candidate](../../../tokens/candidates/quiet-material-controls.json) retains foundation typography, named CSS values and identity geometry and adds named control dimensions/states. [verification.json](verification.json) binds all build inputs and both outputs to the exact browser/PDF evidence. The original logo paths, fonts and previous catalogues remain unchanged.

The current minimum target is 44 CSS px. Ordinary navigation uses a disclosure button and native links, not ARIA menu roles. Keyboard testing and browser reflow are not full accessibility certification; screen-reader and cross-browser checks remain open. Form states and the utility icon family are now supplied by the accepted patterns companion. Modal dialogs, data tables and broader accessibility qualification remain unsupported. The arrow is a decorative glyph; the caret is a simple CSS functional indicator, not a new logo or icon system.

[W3C disclosure navigation guidance](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/) and [visible focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) inform the interaction patterns. This implementation is independently written and bounded as a specimen.

## Rebuild and verify

```powershell
node design/brand-kit/quiet-material/controls/build.mjs
node design/brand-kit/quiet-material/controls/verify.mjs <playwright/index.mjs>
python design/brand-kit/quiet-material/controls/verify-pdf.py
node design/brand-kit/quiet-material/controls/build.mjs --check
```

The checked-in HTML loads the original fonts from ../fonts/ and embeds the logo. Keep the kit directory structure when copying the specimen; the HTML is not a standalone download. The PDF contains embedded font resources. Verification generates ignored browser/PDF images under `.preview/`; inspect them after meaningful changes. Never update a tracked receipt: write a new one after rebuilding.
