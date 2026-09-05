# Quiet Material: forms, symbols and composition

**Accepted for continued design work.** The founder accepted this companion on 6 September 2026. This records design acceptance; the packaged candidate status and production tokens remain unchanged. [Start at the complete kit index](../../README.md).

The current extension of the founder-accepted controls companion. Start with [the interactive guide](index.html), or its [eight-page PDF review](output/pdf/forms-symbols-composition.pdf). The current logo and existing type/control/gradient values are retained. This is candidate design work, not a production token adoption.

## What to assess

1. Form clarity and feedback: submit without a name, correct it, save, then try the failure simulation. Entries survive recovery. Nothing is stored or sent.
2. Utility icons at 16, 20 and 24px: consistent weight, readable silhouettes and restrained use beside text.
3. Content budgets and page rhythm: fewer competing messages, less nesting and distinct compositions.
4. The [website sequence](website.html), [social artwork](social.html) and [email composition](email.html): the same illustrative story adapted to each channel.

The website sequence is an extraction example, not the full Strale homepage or a narrowing of the platform's positioning. The social master is fixed at 1200×630; [the PNG](exports/social-landscape.png), caption and alternative text come from the same story. Email uses Arial and includes a [plain-text companion](email.txt). It is a browser composition study, not a sendable email campaign.

## Source hierarchy

- [registry.json](registry.json): candidate interaction rules, original icon paths, density defaults, application copy, roles and limits.
- [RULES.md](RULES.md): generated human-readable view of those rules.
- [Pattern tokens](../../../tokens/candidates/quiet-material-patterns.json): retained controls/type values plus named form, icon and application geometry.
- [Reference evidence](../../../../docs/research/2026-09-05-quiet-material-pattern-references.md): the existing kit is the visual lock; external references supply bounded interaction/composition evidence.
- [Icon manifest](icons/manifest.json): generated masters, purposes, sizes and hashes. These are a proposed functional family; brand illustration remains separate.
- [verification.json](verification.json): exact source/output bindings and the scope of automated verification.

Existing atmosphere, foundation and control packages remain valid inputs. This companion does not supersede them. No private values or separate palettes may be invented inside an application. Unsupported patterns stay unsupported until added to the shared registry and token source, rendered in context, verified and reviewed.

## Extension and exception process

For a new need, first identify the nearest permitted pattern and its reading task. Add a missing semantic token before using it. Record the new pattern or density exception with its audience need, visible content, deeper destination and narrow-screen acceptance image. Review hierarchy, rhythm, density, consistency and craft together. Do not reduce font size, silently truncate content or add a nested card to evade a budget. Candidate changes require review; production adoption follows the existing decision process.

## Rebuild

```powershell
node design/brand-kit/quiet-material/patterns/build.mjs
node design/brand-kit/quiet-material/patterns/verify.mjs <playwright/index.mjs>
python design/brand-kit/quiet-material/patterns/verify-pdf.py
node design/brand-kit/quiet-material/patterns/build.mjs --check
```

Keep the kit directory structure: HTML loads the retained fonts and logo files. The social export is generated before the guide/PDF. Browser checks cover the declared widths, local error/recovery, keyboard focus, native selection, labels, targets, bounded contrast, and page bounds. PDF font embedding and geometry are checked separately. These checks do not certify all email clients, assistive technologies or browsers. The source-image rights gaps and launch proof requirements remain open.
