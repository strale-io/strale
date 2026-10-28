Intent: bring Strale in line with the fleet security rule Petter agreed on 2026-10-27 (wow-core SECURITY_CORE §1a). The rule was relayed on the agent bus, moonlighter-ab/agent-bus#2. This handoff records it as DEC-20261027-C, narrowing DEC-20261027-A, and lists the keys Petter needs to add.

## What changed

- **CLAUDE.md:** DEC-20261027-C is recorded, and DEC-20261027-A is marked as narrowed.
- **`docs/operations/accounts-and-email.md`** is rewritten:
  - Sessions prepare the sign-up; Petter signs up, accepts the terms, sets up TOTP and pastes the secret.
  - The Bitwarden project is `strale` (EU). Cloud sessions use the read-only `BWS_ACCESS_TOKEN` and `BWS_SERVER_URL` from the account's `fleet` environment, through `bws run -- '<command>'`.
  - Secret names are `STRALE_<PROVIDER>_<WHAT>`.
  - Only read- and test-tier keys go in the store; production keys stay in Railway.
  - Mail is read and sent only by the local "Strale checkin morning" session. Cloud sessions draft rows with `status: draft`.
- **CHARTER.md item 2, DAILY-RUN.md A2 and the OUTBOX header** are updated to match.
- **DECISION-QUEUE.md** has a decided entry for the change.
- **The distribution outreach draft** names the project `strale`.

## Keys for Petter to add

One line per key: the secret name, the provider and sign-up URL, what it unblocks, and whether it exists anywhere today. A session cannot see Railway or the inbox, so "exists" comes from `config/env-manifest.yaml`, `docs/company/OUTBOX.yaml` and the handoffs. Free sign-ups only; paid ones are listed separately below.

**Already exist; nothing to add unless a session must test locally:**
1. `STRALE_NTA_HOUJIN_APP_ID` (production). NTA Corporate Number Web-API, https://www.houjin-bangou.nta.go.jp/webapi/. Unblocks the Japanese company lookup, which is live. It is already in Railway as `NTA_HOUJIN_APP_ID`, so do not copy it to Bitwarden: it is a production key.

**Waiting on a reply to an email already sent:**

2. `STRALE_NTA_INVOICE_APP_ID`. NTA qualified-invoice-issuer Web-API, https://www.invoice-kohyo.nta.go.jp/web-api/index.html. Unblocks the Japanese T-number check (portfolio 1.13). Requested by email on 2026-10-27 (OUTBOX `nta-invoice-app-id`); it does not exist yet.
3. `STRALE_HMRC_CLIENT_ID` and `STRALE_HMRC_CLIENT_SECRET` (production). HMRC Developer Hub, https://developer.service.hmrc.gov.uk. Unblock the UK VAT check and the GB EORI check (portfolio 1.11 and 1.15). Production credentials are pending (OUTBOX `hmrc-production-cns433`). When they are issued, they go to **Railway** as `HMRC_CLIENT_ID` and `HMRC_CLIENT_SECRET`, not to Bitwarden.

**Exists on your PC; add it now:**

4. `STRALE_HMRC_SANDBOX_CLIENT_ID` and `STRALE_HMRC_SANDBOX_CLIENT_SECRET` (test). HMRC Developer Hub sandbox app. These are in your local `.env` as `HMRC_SANDBOX_CLIENT_ID` and `HMRC_SANDBOX_CLIENT_SECRET`. **Add both now.** HMRC deletes the sandbox app around 2026-11-12 unless it makes an API call, and with these in the store a cloud session can make that call.

**New free sign-ups:**

5. `STRALE_DATAGOVIN_API_KEY` (read). data.gov.in, https://data.gov.in (sign up, then My Account, then API key). Unblocks Indian company master data from MCA (portfolio 1.4). New.
6. `STRALE_DATAGOKR_SERVICE_KEY` (read). Korea public data portal, https://www.data.go.kr (the NTS business status API). Unblocks the Korean business-status and tax-type check (portfolio 1.7 and 1.14). New. The portal may ask for phone verification.
7. `STRALE_NZBN_API_KEY` (read). New Zealand Business Number API, https://api.business.govt.nz. Unblocks the New Zealand company lookup (portfolio 1.7). New.

**Not before its build is approved:**

8. `STRALE_SAMGOV_API_KEY` (read). SAM.gov, https://sam.gov (the API key is in the account profile). Unblocks the debarment check (portfolio 1.19). New. Its build is a DEC-20260428-B-grade build that still needs your decision.

For items 5–8, a session prepares the form contents before you sign up.

**Not on the list:**
- Taiwan GCIS and Israel data.gov.il: they need no key.
- KVK, Wathq, Cobalt, and the speech-to-text and OCR vendors: they cost money, so they stay your decision.
- The x402scan probe wallet (distribution track D3): it is not a sign-up. It comes up when that track starts.

## Not done here

- No secret was read or written.
- No account was touched.
- No email was sent.
