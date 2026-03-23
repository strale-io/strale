Intent: Update email subject lines, sender identity, and alert severity classification

## What was done

### 1. Alert severity classification

Added `INTERNAL_DEPENDENCIES` set and `getAlertSeverity()` to `interrupt-sender.ts`:
- **Internal** (browserless, anthropic) → `"critical"` → red header, `[ACTION REQUIRED]` prefix
- **External** (opensanctions, vies, gleif, brreg, etc.) → `"warning"` → amber header, `[MONITORING]` prefix

### 2. Subject line updates

| Email Type | Old Subject | New Subject |
|---|---|---|
| infrastructure_down (internal) | `browserless is not responding — test execution paused` | `[ACTION REQUIRED] browserless down — 47 capabilities affected` |
| infrastructure_down (external) | `opensanctions is not responding — action required` | `[MONITORING] opensanctions down — 4 capabilities affected` |
| mass_failure | `23 capabilities failed in test batch (11.5%)` | `[ACTION REQUIRED] Mass failure — 23/200 capabilities failed` |
| suspension_warning | `ssl-check will be suspended in ~24h` | `[WARNING] ssl-check approaching suspension — action needed within 24h` |
| validation_failure | `new-cap failed validation — review needed` | `[WARNING] new-cap failed validation — review needed` |
| billing_alert | `Wallet operations failing — revenue may be impacted` | `[ACTION REQUIRED] Wallet operations failing — revenue may be impacted` |
| digest (with items) | `Strale Weekly Report — 2 items need attention` | *(unchanged from prompt 03)* |
| digest (no items) | `Strale Weekly Report — Week of 17 Mar – 23 Mar` | *(unchanged from prompt 03)* |

### 3. Sender identity

Updated default `from` in `digest-sender.ts`:
- Old: `Strale Health Monitor <health@strale.io>`
- New: `Strale Health Monitor <noreply@strale.io>`

(Per Strale email address rules — `noreply@strale.io` is in the approved list.)

### 4. Header color adaptation

`infrastructure_down` now uses severity-based header:
- Internal deps → red header, "ACTION REQUIRED" label
- External deps → amber header, "MONITORING — SYSTEM HANDLING" label

## Files changed

- `apps/api/src/lib/interrupt-sender.ts` — severity classification, all 5 subject lines
- `apps/api/src/lib/digest-sender.ts` — sender `from` address

## Verification

- TypeScript: `npx tsc --noEmit` — zero errors
- All subjects have bracket prefix for inbox scanning
- Severity classification correctly distinguishes internal vs external dependencies
