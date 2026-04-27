# Empirical VAT Coverage — 2026-04-27

**Method:** One real-world VAT per Payee Assurance target country, called via Strale /v1/do → vat-validate. Throttled 1.5s between calls (VIES rate limit). v1.1 (US) has no VAT — sales tax instead, out of scope for this capability.

| Country | Code | VAT | valid | Name returned | Provider | Status | Notes |
|---|---|---|---|---|---|---|---|
| Austria | AT | `ATU13585627` | ✗ false | — | — | completed |  |
| Belgium | BE | `BE0203068811` | ✗ false | — | — | completed |  |
| Bulgaria | BG | `BG175325652` | ✗ false | — | — | completed |  |
| Cyprus | CY | `CY10110089R` | ✗ false | — | — | completed |  |
| Czech Republic | CZ | `CZ45272956` | — | — | — | ERR | {"error_code":"execution_failed","message":"The capability failed to execute. Yo |
| Germany | DE | `DE811128135` | — | — | — | ERR | {"error_code":"execution_failed","message":"The capability failed to execute. Yo |
| Denmark | DK | `DK13063894` | ✗ false | — | — | completed |  |
| Estonia | EE | `EE100247201` | ✗ false | — | — | completed |  |
| Greece | EL | `EL094014730` | ✗ false | — | — | completed |  |
| Spain | ES | `ESA28005018` | ✗ false | — | — | completed |  |
| Finland | FI | `FI16602075` | ✗ false | — | — | completed |  |
| France | FR | `FR40303265045` | ✓ true | — | — | completed |  |
| Croatia | HR | `HR75550412900` | ✗ false | — | — | completed |  |
| Hungary | HU | `HU13991013` | ✗ false | — | — | completed |  |
| Ireland | IE | `IE6388047V` | ✓ true | — | — | completed |  |
| Italy | IT | `IT00892410010` | ✗ false | — | — | completed |  |
| Lithuania | LT | `LT100001331613` | ✗ false | — | — | completed |  |
| Luxembourg | LU | `LU22416707` | ✗ false | — | — | completed |  |
| Latvia | LV | `LV40103184480` | ✗ false | — | — | completed |  |
| Malta | MT | `MT15121333` | ✗ false | — | — | completed |  |
| Netherlands | NL | `NL859048691B01` | ✗ false | — | — | completed |  |
| Poland | PL | `PL5260250274` | ✓ true | — | — | completed |  |
| Portugal | PT | `PT500100144` | ✓ true | — | — | completed |  |
| Romania | RO | `RO15068500` | ✗ false | — | — | completed |  |
| Sweden | SE | `SE556703748501` | ✓ true | — | — | completed |  |
| Slovenia | SI | `SI23998441` | ✗ false | — | — | completed |  |
| Slovakia | SK | `SK2020443693` | ✗ false | — | — | completed |  |
| United Kingdom | GB | `GB220430231` | — | — | — | ERR | {"error_code":"execution_failed","message":"The capability failed to execute. Yo |
| Norway | NO | `NO971526157MVA` | ✓ true | — | — | completed |  |
| Switzerland | CH | `CHE116281710` | — | — | — | ERR | {"error_code":"execution_failed","message":"The capability failed to execute. Yo |

## Summary
- Capability returned a structured response: 26 / 30
- Response included an entity name: 0 / 30 (Payee Assurance name-match availability per country)