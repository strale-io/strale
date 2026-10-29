# Better Stack log sink: setup and verification

Decision: DEC-20261029-A (Better Stack, EU region, free tier first). Code:
`apps/api/src/lib/log-sink.ts`, wired in `apps/api/src/lib/log.ts`. Until both
Railway variables below are set, the API ships nothing and logs one
`log-sink.disabled` line at boot.

The account, the terms, the source and the Railway variables are Petter's
(DEC-20261027-C). The session prepares and verifies.

## A. Sign up and create the EU source (Petter)

1. Open https://betterstack.com/users/sign-up and enter `petter@strale.io`.
   Open the magic link in that inbox. If a plan choice appears, pick **Free**.
2. In the left menu open **Telemetry**, then **Sources**, then **Connect source**.
3. Name: `strale-api-production`. Platform: **JavaScript • Node.js**.
4. **Data region: Europe.** If the free plan does not offer Europe, stop here
   and tell the session: the decision is EU, and a US source is not covered by it.
5. Click **Connect source**. The page shows a **Source token** and an
   **Ingesting host** (it looks like `s123456.eu-nbg-2.betterstackdata.com`).
6. In Railway, project `desirable-serenity`, service `strale`, open
   **Variables**, then **New Variable**, and add:
   - `BETTERSTACK_SOURCE_TOKEN` = the source token
   - `BETTERSTACK_INGEST_HOST` = the ingesting host, without `https://`
7. Railway redeploys. Tell the session it is done; it verifies (section C).

## B. Error-rate alert to petter@strale.io (Petter)

Better Stack's menus move; if a label differs, the intent is "email me when
the API logs more than 10 errors in 5 minutes".

1. **Telemetry**, then **Alerts** (on some accounts it is under the source,
   **Alerts** tab), then **Create alert**.
2. Source: `strale-api-production`.
3. Query or filter: `level = "error"` (the shipper sends `level` as text:
   `info`, `warn`, `error`, `fatal`).
4. Condition: count of matching lines **greater than 10** over **5 minutes**.
5. Notify: **Email**, `petter@strale.io`. Name: `strale-api error rate`.
6. Save. Optional: use **Send test** so you see what the email looks like.

## C. Verification (session)

1. `GET https://api.strale.io/v1/platform/facts` returns `"log_sink_shipping": true`.
2. Railway's boot log shows `log-sink.enabled` with `eu_region: true`.
3. Lines with `dt`, `level` and `label` arrive in the source's **Live tail**,
   and no line there carries an API key, an email address or a customer input.
4. Record the result on T8 in `docs/programs/platform-hardening/tracks.yaml`.

## D. Privacy notice text (Petter publishes)

The public privacy notice lives in the `strale-frontend` repository, outside
this one, and changing public legal text is Petter's. Proposed sub-processor
row:

> **Better Stack** — log storage and alerting for the Strale API. Data region:
> European Union. Receives server log lines; API keys, authorisation headers,
> customer inputs, payment details and email addresses are removed before a
> line is sent. Logs are kept for 3 days.

Use the legal entity name from Better Stack's DPA. The vendor, region and
retention are also published in platform facts (`static.log_sink`).

## Operating notes

- The shipper buffers at most 5,000 lines, sends up to 500 lines or about 1 MB per request every
  2 seconds with a 5-second timeout, drops a failed batch and pauses 60
  seconds. A drop is reported on stderr as `log-sink.batch-dropped`.
- Free tier: 3 GB a month, kept 3 days. A 402 from Better Stack means the
  quota is used up; lines are dropped until it resets. A paid plan is a new
  spend decision.
- `console.*` output is not shipped; only pino (`log`, `logError`, `logWarn`).
