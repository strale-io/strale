# Quiet Material: rendered redesign review

Reviewed 5 September 2026. Status: observations and recommendations, not adoption of a design direction. Continue through the [brand and website program](../../docs/programs/brand-website/PROGRAM.md).

## What was reviewed

The founder identified the unfinished redesign with a screenshot of the folded light background, “One connection to the tools your agent needs” headline and red-to-blue request illustration. That screenshot establishes the intended direction. The exact Claude Design presentation could not be inspected below the hero because browser inspection timed out; no claim is made about unseen sections of that exact revision.

For a full-page review, the later Quiet Material v0.7 implementation was restored from the [preserved frontend release](https://github.com/strale-io/strale-frontend/releases/tag/preserve-2026-09-02), asset `Strale-website-design-system-2026-09-01-213316.zip`. Its SHA-256 matched the release checksum: `891e905f8f7e53f466fba4b10c62c868680310bab119429d901268c42c1ce1b2`. This archive includes imagery omitted from the text-only candidate snapshot. Its copy differs from the founder's screenshot; findings below distinguish the screenshot from the later implementation.

Rendered routes were `/homepage-v2` and `/homepage-v2-how-process-field`. Review covered the opening, process tabs, enrichment, research, documents, counterparty verification and catalogue, at desktop and narrow mobile sizes. The reduced-motion presentation and selected interactions were inspected. This was not a complete motion, accessibility, asset-library or light/dark audit. No implementation files were changed.

The findings were initially recorded in an immutable [historical Journal entry](https://app.notion.com/p/3d267c87082c81c087dee074a3e75561). This repo report is the continuation reference for the visual review; the Journal remains a historical record. It does not change the operating-model cutover status.

## Judgment

**Keep Quiet Material as a control and improve its composition before replacing its identity.** The material vocabulary is more coherent than the original brief feared. The strongest problem is repeated presentation structure and the amount of competing explanation inside each composition.

The folded imagery has a recognisable family resemblance across the viewed applications. Black actions, quiet typography and technical labels give the design useful contrast. The product illustrations attempt to show actual work rather than relying only on abstract decoration. These are valuable foundations. This review does not establish that every existing atmosphere asset belongs in the final library, or that the logo and fonts need no further work.

## Findings and actions

| Area | Observation | Recommended action |
| --- | --- | --- |
| Screenshot hero | The headline, broad task list, protocol paragraph, two actions, commercial microcopy and detailed email card all compete. The card demonstrates validation more clearly than it demonstrates the integration promise. | Choose one opening message and one supporting example. Move access detail to its next useful location. Match the plural email request to a plural result or make the example singular. |
| Page rhythm | Four large use-case sections repeat a rounded outer panel, heading/copy, icon strip and atmospheric demonstration. Colour changes do not change the reading experience enough. | Alternate open proof, compact catalogue and selected framed moments. Let the reader's question determine the structure. |
| Process | Connection and return explanations repeat information across prose, labels and the illustration. The alternative open process treatment reduces the outer framing but retains much of the repetition. | Remove duplicated explanation before refining spacing. Qualify output/provenance claims by actual route rather than implying universal parity. |
| Document example | A recognisable document becomes useful fields: this is the clearest transformation in the viewed set. The illustrated source and output differ in the company name (“Northstar Systems” versus “Northstar Systems Ltd.”). | Retain the transformation, make the fixture internally faithful and label it illustrative. Enlarge the important fields instead of adding more metadata. |
| Research example | Result, article and series counts show activity more clearly than they show useful evidence. An explanation of what the agent does also consumes valuable space. | Show a short sourced finding or comparison input. Distinguish Strale's returned evidence from reasoning performed by the agent. |
| Enrichment and verification | Input-to-output relationships are understandable, but feature taxonomies and repeated mini-cards make the visual busy. | Keep the minimum evidence that proves the task. Recheck current tool/solution availability before using these examples as launch promises. |
| Catalogue alternative | The editorial shelves provide a useful change of pace compared with another large panel. Some elevation still feels stronger than necessary. | Use this as an existing refinement to test; reduce shadows where grouping is already clear. |
| Mobile | The inspected layouts did not show horizontal page overflow, but introductory copy and icon strips substantially delay the visual proof. Stacking the full desktop content makes the unfinished page long. | Recompose examples around the essential transformation. Judge where proof appears and how quickly it is understood, not only whether everything fits. |

The later implementation is unfinished: connection/transaction, dependability, pricing and closing/footer chapters were not all built into the viewed page. Their absence is remaining work, not evidence that the designer intended a finished page without them. Similarly, visual inspection cannot establish whether a depicted product feature is shipped; the product-proof track owns that verification.

## Next application

Use this report with the [positioning brief](../../docs/programs/brand-website/POSITIONING-BRIEF.md). Compare the preserved direction with a refined version using the same copy and task across a homepage opening, contrasting benefit section, social post and PDF example. Audit the logo, type roles and atmosphere families in those contexts. Do not generate an entire replacement asset library before the comparison establishes what should change.
