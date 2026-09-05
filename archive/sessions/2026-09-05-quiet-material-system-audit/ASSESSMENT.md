# Quiet Material: cohesion and completeness audit

Date: 5 September 2026. Status: evidence and recommendations, not a new brand authority.

**Keep the existing direction. Quiet Material has a coherent visual foundation and substantial written guidance; it is not yet a complete, consistently governed brand kit.** The work needed is consolidation, coverage and verification. A new visual identity is not the next step.

The founder clarified: “i prefer what we already had, but i wanted us to review the design system to make sure it's complete and that all gradients and atmospheric images make sense as a cohevise brandkit”. This corrects the agent's detour into Instrument and Fieldwork. Those concepts are rejected for this project; the existing redesign is the development baseline. This preference does not certify every old asset, product claim or implementation as ready for production.

## Scope and evidence

Audited the full preserved package `Strale-website-design-system-2026-09-01-213316.zip` from the [preservation release](https://github.com/strale-io/strale-frontend/releases/tag/preserve-2026-09-02), digest `891e905f8f7e53f466fba4b10c62c868680310bab119429d901268c42c1ce1b2`. The [asset inventory](asset-inventory.json) records source-document digests, current image tokens, exact files, dimensions, hashes and manifest coverage. Counts below describe this preserved package, not today's served website.

Read the current-system pointer, system contract, brand-application, imagery, asset, adaptive-layout, spacing and lifecycle contracts; inspected relevant CSS, component census and drift checker. Visually inspected all fourteen current atmospheric raster assets, the three editorial/product-support manifest assets, and the older midnight plate as a lineage comparison. Reviewed the existing HTML catalogue's gradient swatches and representative surface combinations in a local browser. The earlier [full-page redesign review](../2026-09-05-quiet-material-review.md) supplies page-rhythm evidence; the exact founder screenshot covers only its visible opening.

This is not a complete pixel-level accessibility certification, a new full responsive/motion test, a legal originality audit, or a visual review of every legacy image in the entire frontend. No existing image, gradient or production token was changed. The archived checker ran read-only and passed; the limitations below explain why that does not establish completeness.

## 1. Do the atmospheric images belong together?

**Mostly yes, with distinct subfamilies and some outliers that need narrower usage rules.** Shared traits are restrained colour, layered material, soft light, clear spatial depth and areas of low detail. They do not all have identical geometry or texture, and should not be treated as interchangeable wallpaper.

| Existing asset/group | Visual assessment | Recommended treatment |
| --- | --- | --- |
| Hero folded light | Broad pearl sweep, restrained mineral/cobalt warmth, genuinely quiet left field. Strongest link to the founder's preferred opening. | Keep as the major-opening anchor. Preserve its actual composition; do not regenerate or approximate it with CSS. |
| Light Balanced, Mineral and Warm | Closely related geometry and soft material; tonal differences are subtle and credible. Their sharper fold/cusp differs from the broad hero sweep but is a documented process-plate variant. | Keep as a light process family. Use Balanced by default; use the others for a deliberate contextual change, not to rotate colours mechanically. |
| Light Cobalt | Same light material vocabulary, stronger rising blue edge and different focal distribution. | Keep. Give it its own crop/focal instructions; it cannot inherit every Balanced crop unchanged. |
| Dark Midnight and Cobalt v2 | Closely related diagonal translucent flow, controlled edge light and quiet dark areas. Cobalt has a brighter focal seam. | Keep as closely related neutral/technical options. Test the actual overlay near the bright seam. |
| Dark Mineral v2 | Geometry fits the above; colour is subdued blue/green, much quieter than the saturated Mineral CSS gradient. | Keep. Explain that the raster and gradient are related choices for different uses, not colour-identical equivalents. |
| Dark Dusk, Spectrum and Ember v2 | Same flowing membrane language. Warm/cool balance and focal intensity vary; Dusk and Spectrum can feel close at small size. | Keep provisionally in the existing library. Clarify emphasis and frequency rather than inventing more variants. Spectrum should remain a concentrated expressive moment. |
| Dark Mulberry v2 | Compatible curves and muted hue, but visibly grainier and more fabric-like; light concentrates around a bend rather than the common diagonal crossing. | Keep for review in its existing bounded role. Calibrate texture/light intensity in a real specimen before expanding use. No replacement commissioned. |
| Burnished Amber v1 | Thin, strongly illuminated ribbon with warmer, denser material and a lower focal seam. More divergent than the core blue family. | Restrict to the existing exceptional role; the system itself says its matched card recipe is unfinished. Do not treat it as another default dark stage. |
| Graphite Pearl v1 | Restrained monochrome, but the enclosing curved composition and central field differ from diagonal flow. | Keep as an exceptional neutral composition, with its own crop and surface test. It is not a drop-in Midnight replacement. |

The older Midnight v1 has the faceted light-plate geometry. The current token correctly selects v2. That distinction matters: a folder scan that selects files by colour name could reintroduce a different generation. Preserve older files with explicit lineage; do not delete them or let them become defaults.

There is no evidence here that Strale needs more colour variants. The current atmosphere masters total 19,350,743 bytes; this is a library footprint, **not a measured page transfer**. Before shipping, derive appropriate export sizes/formats and load only what a surface needs.

## 2. Do the gradients form a coherent system?

The nine `--atmosphere-*` CSS gradients are visually related: concentrated warm/cool dark fields plus pale Frost/Mint. The existing original hero's folded-light background + Spectrum frame + near-white proof card remains a valid anchor to retain.

| Gradient | Existing purpose worth retaining | Clarification needed |
| --- | --- | --- |
| Spectrum | Main expressive proof/opening | Bound its frequency. It is also prescribed for the closing CTA in one place, while another prescribes Dusk. |
| Cobalt | Tools, routing, technical framing | Distinguish flat CSS frame from dark folded Cobalt artwork. |
| Midnight | Quiet code and technical surfaces | Distinguish neutral framing from Cobalt's stronger colour; name compatible text/focus roles. |
| Mineral | Validation/evidence framing | Decorative green is not a passed check. A result state still needs a label and real evidence. |
| Mulberry | Warm capability/evidence expression | Role shifts from general capability stories to verification across documents; reconcile it. |
| Ember | Concentrated action/warmth | Avoid making ordinary errors or urgency appear merely through background choice. |
| Dusk | Restrained warm-to-cool transition | Resolve whether this or Spectrum is the default closing recipe. |
| Frost | Quiet explanatory surface | Distinguish from flat cool canvas; it is not a second mandatory atmospheric layer. |
| Mint | Quiet mineral support | Distinguish from Mineral's stronger expression and actual success-state colour. |

The dark raster list has Amber and Graphite while the CSS gradient list has Frost and Mint. That asymmetry is not automatically a missing-asset defect. The kit needs an explicit mapping of **role → permitted gradient or image → compatible surface → text/state tokens → crop**, rather than an assumption that every colour needs every variant.

Retain the existing separation of jobs: a gradient may model a surface, provide a bounded atmospheric frame or focus a state. Do not layer a second semantic gradient over a dark plate, which already includes its colour and lighting. The written system explicitly forbids this, but the general four-layer diagram is easy to read as requiring all four layers. Add examples of valid one-, two- and three-layer compositions, including plain white sections.

## 3. Concrete inconsistencies and missing records

Source paths below are relative to the preserved package. Recommendations are proposed repairs; historical source files have not been silently rewritten.

| ID | Evidence | Why it matters / repair |
| --- | --- | --- |
| QM-01 | `assets/design-tokens.css` references fourteen atmosphere images; `assets/brand-library/asset-manifest.json` records only three of those. All six existing manifest records have matching hashes/dimensions and available brief files. | Governance exists but covers only part of the library. Add the eleven missing current-image records, with source confidence, roles, crops, parent/version and rights status. Unknown provenance stays unknown. |
| QM-02 | `CURRENT-DESIGN-SYSTEM.md` calls `references/*.png` and `assets/capability-illustrations/` available; both directories are absent from this full extracted release. `design-system.html` references `references/quiet-material-direction-v1.png`. | The kit cannot be reconstructed solely from its advertised package. Locate the originals or explicitly mark unavailable; do not replace them with unrelated new artwork. Check every linked asset, not just the manifest entries. |
| QM-03 | The written card compatibility matrix includes dark Mulberry, Amber and Graphite; the HTML matrix omits those rows. The written Mineral row allows a neutral inverse result; the HTML row names a mineral inverse inspector. | A human and an agent can follow different “canonical” answers. Generate both views from one structured recipe register. |
| QM-04 | `DESIGN-SYSTEM.md` featured verification recipe names Midnight; its component census, later Mulberry recipes and drift checker require Mulberry. The closing pattern names Spectrum, while the surface recipe table and catalogue name Dusk. | Resolve each as a named current recipe with explicit scoped exceptions. Use the actual reviewed chapter/version as evidence; do not let “stricter wins” decide aesthetic conflicts. |
| QM-05 | Brand applications allow Constellation/Global field archetypes; imagery strategy rejects the generic generated examples. The manifest correctly keeps those two images at exploration. | Distinguish an explanatory, live diagram from the rejected decorative raster. The rule needs a medium and semantic-purpose field, not a blanket archetype name. |
| QM-06 | `public/favicon.svg` and `src/components/StraleMark.tsx` use a four-point compass; the preferred homepage lockup is the flowing S. The system separately calls the four-point shape a transformation glyph. | Freeze the current S as the audit reference and reconcile identity vs functional symbol. Audit favicon/avatar sizes and inverse variants before export. This is not permission for another logo redesign. |
| QM-07 | Type families and many roles are already defined. CSS still imports fonts remotely and contains local values; a nav rule hardcodes the family. Display, paragraph and data roles are much better covered than email/print fallbacks, language specimens and font packaging. | Complete the register around Instrument Sans/IBM Plex Mono first. Test weights, numerals, glyphs, reading measure and fallback reflow before concluding the families are wrong. |
| QM-08 | Motion timings and behaviours are detailed in prose, but `design-tokens.css` has no corresponding duration/easing role register. Complete application dark mode is explicitly provisional in the catalogue. | A dark stage inside a light page is not a complete user-selectable dark theme. Define channel/component mode support and motion tokens/states before calling either complete. |
| QM-09 | Guidelines encourage composition variation, yet the featured-use-case contract mandates a shared outer stage/header/rail/responsive geometry. Earlier full-page review found four repetitive large framed chapters. | Preserve the brand while allowing named open, compact and framed composition patterns. Fix the system-level recipe that encourages repetition, not just individual spacing. |
| QM-10 | `check-homepage-design-system-drift.mjs` passes on the preserved package despite the gaps above; it checks selected rules, tokens, files and recorded manifest entries. The current monorepo design linter covers selected internal-report consumers. | Existing enforcement is useful but not comprehensive. Add whole-library reference validation and actual apps/web/channel consumers when those are introduced. Passing a linter does not prove visual cohesion. |

## 4. Completeness by area

| Area | Already present | Still needed for a reliable initial brand kit |
| --- | --- | --- |
| Positioning/voice | Adopted benefit hierarchy; plain-language rules; claim register; original copy principles. | Short marketing/detail/docs examples; optional subtitle slots; apply claim checks to the actual website and channel exports. |
| Identity | Homepage lockup and separate legacy marks. | One identity manifest, relationship between mark and functional glyphs, clear space, minimum sizes, favicon/avatar/inverse assets and co-branding treatment. |
| Typography | Two families, weight choices, extensive website roles and responsive sizes. | Font-file/licence package, glyph/numeral specimens, email/print fallbacks and longer reading/document roles. |
| Colour/gradients | Palette, nine atmospheric gradients, role guidance and inverse tokens. | One authoritative recipe map, contextual contrast evidence and distinction between decorative colour and product state. |
| Atmospheric imagery | Fourteen current masters and a meaningful material grammar. | Complete manifest, per-asset focal/crop records, context-tested pairings, export sizes and legacy lineage. |
| Cards/surfaces | Extensive light/inverse/glass vocabulary and compatibility matrix. | Reconcile prose/catalogue disagreements; reduce overlapping choices; complete only the missing recipes needed for actual uses. |
| Navigation/controls | Detailed header behaviour, buttons, focus/touch rules, some tabs/menu implementations. | Reviewed primary/secondary/mobile navigation and state matrix: hover, focus, active, disabled, loading, error, empty. Do not assume a rule or component import proves every state. |
| Icons/illustrations | Lucide-derived roles, geometry, medium hierarchy and rejection criteria. | Identity-symbol separation, source inventory, contextual examples; locate missing illustration library. Avoid blanket icon replacement. |
| Density/rhythm | Fact/card limits, quiet-space guidance, responsive compression order. | Resolve shared-frame repetition; define optional copy slots and section briefs; prove long content and mobile reading without shrinking text. |
| Motion/video | Detailed hero/workflow behaviour and reduced-motion intent. | Shared machine-readable timings/easing, verified pause/off-screen/reduced-motion states, video storyboard/poster/caption/export rules. |
| Cross-channel | General ratios, image jobs, social/editorial aspirations. | Tested social/avatar/banner/OG, blog, email and document templates; source masters and real exports. Channel rules cannot be inferred from website CSS alone. |
| Operations/enforcement | Tokens, status concepts, selected drift checks and partial manifest. | One versioned source hierarchy, resolved asset links, generated human/machine views, consumer enforcement and a bounded extension process. |

## 5. Recommended repair order

1. Reconcile the current sources, missing files, identity variants and recipe conflicts. Extend the manifest around the existing assets. This produces one dependable answer to “which asset/recipe do I use?”
2. Build a specimen matrix using those unchanged assets: image/gradient × permitted card/text treatment × the relevant desktop/narrow/social crop. Measure contrast on the rendered combination, assess focal competition, and identify only the specific assets or recipes that need refinement. Include image-free compositions.
3. Fill the actual coverage gaps: type/font package, controls and states, density/rhythm patterns, motion and first channel templates. Keep the existing visual language as the reference throughout.
4. Adopt the completed kit and connect the website/channel consumers to it. Design the website using that system; do not return to alternative identity boards without a new founder request.

The [system completion plan](../../../docs/programs/brand-website/SYSTEM-COMPLETION.md) and its structured coverage record are the canonical continuation documents. This audit is evidence; it does not itself promote preserved tokens or authorise new public product claims.
