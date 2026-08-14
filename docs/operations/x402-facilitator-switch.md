# x402 facilitator switch — CDP rollout runbook

**Status:** shipped behind a flag, not yet rolled out.
**Money path.** Read this before flipping anything.

## Why

The CDP Bazaar is the x402 discovery index that Agentic.Market and several
downstream aggregators read from. It catalogues a resource when **Coinbase's own
facilitator** processes a `PaymentPayload` carrying the bazaar extension —
cataloguing happens at settlement time, not at declaration time.

Strale already emits a complete `extensions.bazaar` block on every 402
(`buildBazaarDiscovery` in `apps/api/src/routes/x402-gateway-v2.ts`), including
the v1 `outputSchema` descriptor shape and the v2 top-level `extensions`. That
metadata is currently emitted into a facilitator that does not catalogue it, so
none of the paid catalog is indexed. Routing settlement through CDP makes the
whole paid catalog self-index off organic traffic — no per-endpoint submission.

Source: `audit-output/parallel-audits-2026-08-12/distribution-playbook.md` §0 and §1.1.

## What shipped

`X402_FACILITATOR` selects the facilitator explicitly. Before this change,
selection was an implicit consequence of credential presence: mainnet + CDP keys
→ CDP, silently. That meant setting a credential moved the money path, and
rolling back meant deleting the credential.

| Mode | Behaviour |
|---|---|
| `auto` (default) | Base mainnet **and** CDP keys present → CDP; otherwise the HTTP facilitator at `X402_FACILITATOR_URL`. Identical to the pre-switch rule. |
| `cdp` | Always Coinbase CDP. Requires both CDP keys; **refuses to boot** without them. The rollout target. |
| `legacy` | Always the HTTP facilitator at `X402_FACILITATOR_URL`, even with CDP keys present. The rollback lever. |

The default is `auto` rather than `legacy` so that deploying this change on its
own moves no traffic under any existing Railway configuration. `legacy` is
available as an explicit pin, which is what makes rollback a one-variable edit.

Selection is resolved once at module load (`resolveFacilitatorSelection`), so a
bad value or a half-configured `cdp` stops the deploy rather than surfacing
mid-payment. The resolved selection is logged at boot:

```
[startup] x402 facilitator: cdp (mode=cdp) https://api.cdp.coinbase.com/platform/v2/x402
```

**Ordering is unchanged.** This switch decides *which* facilitator is called,
never *when*. The verify → execute → settle order (DEC-14) is untouched, and
`x402-gateway-v2.settlement-order.test.ts` still pins it.

## Required config

| Variable | Value | Notes |
|---|---|---|
| `X402_FACILITATOR` | `cdp` | Absent/`auto` keeps today's behaviour. |
| `CDP_API_KEY_ID` | *(from CDP portal)* | Already read by the pre-existing auto path. |
| `CDP_API_KEY_SECRET` | *(from CDP portal)* | Both required, or boot fails. |

Obtain the pair from the Coinbase Developer Platform portal under the account
that owns the receiving wallet. Both are secrets — set them in Railway
variables, never in a committed file.

## Rollout

1. **Rehearse on testnet.** `X402_NETWORK=base-sepolia` + `X402_FACILITATOR=cdp`
   in a non-production environment. Mode `cdp` is deliberately not gated on
   mainnet so this rehearsal is possible. Confirm the boot log names CDP and
   that a test call verifies and settles.
2. **Flip on Railway.** Set `X402_FACILITATOR=cdp` (plus both CDP keys).
   Redeploy. Confirm the boot log line names `cdp`.
3. **Confirm the discovery surfaces agree.** Both now report the live
   facilitator rather than a hardcoded URL:
   ```
   curl -s https://api.strale.io/x402/catalog        | jq .facilitator
   curl -s https://api.strale.io/.well-known/x402.json | jq .facilitator
   ```
   Both must return the CDP URL. If either still returns `x402.org`, the
   selection did not take effect — stop and investigate before sending traffic.
4. **Run a real paid call on Base mainnet.** A cheap endpoint is enough
   (`/x402/iban-validate`). Verify: the capability returns output, the
   `X-Payment-Response` header carries a tx hash, the on-chain transfer landed,
   and the amount matches the advertised `maxAmountRequired` exactly.
5. **Verify Bazaar indexing.** Cataloguing happens on settlement, so it needs at
   least one successful paid call through CDP first. Check the CDP discovery
   API / Bazaar listing for `api.strale.io` resources. Expect propagation lag —
   do not conclude failure from an immediate empty result. Downstream
   (Agentic.Market, x402-list.com) cascades later still.
6. **Watch for a green week.** Settlement success rate, orphan settlements
   (`x402_orphan_settlements`), and `/v1/do` x402 error rates should be
   unchanged from the legacy baseline.
7. **Remove the legacy path after a green week.** Once CDP has run clean for
   seven days: drop the `auto`/`legacy` branches, `X402_FACILITATOR_URL`, and
   `DEFAULT_LEGACY_FACILITATOR_URL`, and make CDP unconditional. Not before —
   the branch is the rollback.

## Rollback

Set `X402_FACILITATOR=legacy` and redeploy. Leave the CDP keys in place; the
mode pin wins over credential presence. Confirm the boot log names `legacy`.

## Known gaps

- **Indexing is not verifiable from this repo.** Whether CDP actually catalogues
  Strale's endpoints can only be confirmed by observing the Bazaar after a real
  paid call. The facilitator *API* contract is verified (`@coinbase/x402@2.1.0`
  is a repo dependency and `createFacilitatorConfig` is read directly); the
  *indexing* behaviour is taken from Coinbase's seller docs via the distribution
  audit and is unverified here.
- **CDP drops v2 extensions on mainnet** (upstream issue referenced in
  `buildBazaarDiscovery`). The v1 `outputSchema` descriptor shape is already
  emitted as a hedge. If indexing does not appear after step 5, that hedge —
  not the facilitator — is the first thing to examine.
- **Optional Bazaar metadata not yet emitted.** The spec supports `serviceName`
  (≤32 ASCII), up to 5 `tags`, and `iconUrl` on the resource object; Bazaar
  search ranks partly on metadata completeness. Cheap follow-up, deliberately
  out of scope here to keep the money-path diff reviewable.
- **`platform-facts.ts` describes payments as "Coinbase x402 facilitator"**
  (`payments_x402`). That string is accurate only once mode `cdp` is live. It is
  a subprocessor-disclosure surface, so it was left untouched rather than
  changed speculatively — update it as part of the flip.
