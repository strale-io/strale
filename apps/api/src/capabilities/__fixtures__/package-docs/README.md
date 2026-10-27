# Package documentation fixtures

Captured once on 2026-10-27 with Python urllib, JSON Accept and
`Strale/1.0 (+https://strale.dev)`; only the registry endpoints below were read.
README/description content is cut to its first 240 characters, release histories
and metadata are reduced to the fields exercised, and published personal names
are replaced with `Fixture author` / `Fixture maintainer`. These substitutions
are test data, not claims about the package authors. No linked sites were read.

- `npm-scoped.json`: https://registry.npmjs.org/@babel%2fcode-frame
- `npm-deprecated.json`: https://registry.npmjs.org/request
- `pypi-project.json`: https://pypi.org/pypi/requests/json
- `pypi-yanked.json`: https://pypi.org/pypi/requests/2.32.0/json

`@babel/code-frame` had no packument README. Tests explicitly inject README
strings for version-specific, format and truncation branches, and a dist-tag
alias for tag resolution. Oversize, errors, ordering and timeout are synthetic
responses. README snippets remain package-author content under the published
package licence (MIT for these npm packages; Apache-2.0 for requests).

Round 2 adds synthetic example.invalid emails to npm object/string authors and maintainer lists, and to PyPI named/address-only email fields. These are regression inputs for contact-detail removal.
