Intent: Update x402 ecosystem listings after gateway launch (256 caps + 88 solutions)

## PR Status
| PR | Repo | Status | Action Taken |
|----|------|--------|-------------|
| #162 | xpaysh/awesome-x402 | OPEN | Updated description + commented |
| #111 | Merit-Systems/awesome-x402 | OPEN | Updated description + commented |
| #1709 | coinbase/x402 | OPEN | Updated description + commented with ecosystem entry proposal |

## Actions Taken
- Updated all 3 PR descriptions with new capability count (256 + 88 solutions)
- Added example x402 flow to each PR description
- Commented on coinbase/x402 PR proposing ecosystem directory entry
- Commented on awesome-x402 PRs with update notification
- Created canonical listing text at `docs/x402-listing.md`

## Coinbase x402 Ecosystem Directory
Strale is NOT yet in `typescript/site/app/ecosystem/partners-data/`.
Proposed `strale/metadata.json`:
```json
{
  "name": "Strale",
  "category": "Services/Endpoints",
  "logoUrl": "/logos/strale.png",
  "description": "250+ compliance, KYC/KYB, and business verification APIs via x402.",
  "websiteUrl": "https://strale.dev"
}
```
Asked maintainers if we should add this to the existing PR or create a separate one.

## Manual Actions Needed
- [ ] Wait for coinbase maintainer response on ecosystem entry format
- [ ] If separate PR needed: fork coinbase/x402, add partners-data/strale/metadata.json + logo
- [ ] 402index.io: Verification token deployed at /.well-known/402index-verify.txt. Check if auto-indexed or manual submission needed.
- [ ] x402.org/ecosystem: Appears to pull from coinbase/x402 repo. Getting into partners-data should auto-list.

## Listing Content
See `docs/x402-listing.md` for the canonical listing text.
