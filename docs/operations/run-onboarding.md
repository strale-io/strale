# Run capability onboarding

Use this after a capability's manifest and executor have been reviewed, merged
to `main`, and deployed to the API. You do not need a laptop terminal or a
database password. GitHub holds only a secret that can trigger this operation.

## One-time setup (Petter)

1. In your password manager, open its password generator. Generate a random
   password of at least 32 characters (64 letters and digits works well).
   Save it as “Strale onboarding trigger”. Use a different password from
   `ADMIN_SECRET`. Keep it private.
2. Open Railway → the Strale project → the **API service** → **Variables**.
   Add `ONBOARDING_RUN_SECRET` and paste the password as its value. Apply the
   change and wait for deployment to finish.
3. Open the `strale-io/strale` repository in GitHub → **Settings** →
   **Environments** → **New environment**. Name it `production-onboarding`.
4. Inside that environment, under **Deployment branches and tags**, select
   **Selected branches and tags** and add the branch `main` only.
5. Under **Environment secrets**, click **Add environment secret**. Name it
   `ONBOARDING_RUN_SECRET` and paste the same password. Save it.
6. The API address defaults to `https://api.strale.io`. If it changes, set the
   environment variable `STRALE_API_URL` under **Environment variables**.
   Use an HTTPS API address.

The secret is optional for API startup: until it is set correctly, this runner
is disabled. After setup, the maintainer should update the environment register
(`config/env-manifest.yaml`) from `set_in: [none]` to `railway` and `workflow`.
The register currently records setup as pending, rather than claiming it has
already happened.

## Each use

1. Open the repository in GitHub and click **Actions**.
2. Select **Onboard capability** in the left sidebar.
3. Click **Run workflow**. Keep the branch set to **main**.
4. In **slug**, type the capability slug, such as `eurostat-data`. For several
   capabilities, separate slugs with commas. Maximum: 50 for onboard/backfill,
   or 1000 for limitations; no duplicates. Only limitations accepts `all`.
5. Choose **onboard** to create a capability, or **backfill** to update an
   existing capability's tests, reliability, personal-data classification and
   limitations. Backfill preserves database-owned settings such as pricing.
   Choose **limitations** when only the limitation text needs updating.
   Choosing backfill acknowledges the existing CLI's manifest-drift warning;
   the manifest and column-authority checks still run.
6. Leave **discover** checked for a new capability. In **limitations** mode,
   **discover** and **fix** are ignored, so either checkbox setting is safe.
   Discovery in onboard/backfill executes the capability using
   its manifest fixtures and returns suggested fixtures and reliability values.
7. Leave **fix** unchecked unless you want high-confidence fixture corrections
   (for example, matching a field's letter case).
8. Click the green **Run workflow** button. Open the new run to watch it.
9. When it finishes, read the **Summary**. “Completed” means the pipeline
   succeeded (and readiness is true for onboard/backfill). It lists rows created, updated and deleted,
   generated test types, known-answer verification and readiness issues.

For the four pending new capabilities, use mode **onboard**, discover checked:
`eurostat-data,entity-resolve,company-status-check,invoice-counterparty-check`.
## Update limitation text for the whole catalogue

Open **Actions → Onboard capability → Run workflow**. Keep branch **main**,
choose mode **limitations**, enter **all** in **slug**, and click the green
**Run workflow** button. Wait for the API deployment containing the merged
manifests before starting. You can also enter specific slugs separated by commas.

This copies only the limitations from the reviewed manifests into the database.
It syncs deactivated tools too, without turning them on. It never runs a tool,
calls a vendor, discovers or verifies fixtures, generates tests, runs onboarding
hooks, writes readiness, or changes pricing, visibility, activity, x402 payments,
lifecycle settings or any other capability data. It costs nothing: there are no
paid tool calls or vendor requests.

The workflow reads all manifest filenames from its copy of `main` and runs one
slug at a time. Onboard and backfill still accept at most 50 slugs; limitations
accepts up to 1000. A failure for one slug does not stop the others, except when
authentication/configuration fails, the API is busy, or a run times out.

Each slug reports **unchanged**, **updated**, **not_found**, or **failed**, with
a reason. Updated results include counts of rows created, updated and deleted.
A changed text entry can appear as one deletion and one creation; an update can
mean its display order changed. Unchanged means the existing text already
matches. Not found means there is no capability row, and nothing was written.
Each slug is saved as one transaction: if it fails, that slug keeps its previous
limitations. Earlier successful slugs remain saved. After the run, the
maintainer verifies the served text through **GET /v1/capabilities**.

## Read the result

- **Completed:** limitations synced or already matched; in onboard/backfill,
  onboarding finished and readiness passed. This does not make
  a new capability publicly visible. Creation still sets `visible=false` and
  `lifecycle_state=validating`; x402 remains off by its existing database
  default. The existing hook generates/checks tests and warns about visibility;
  it does not publish the capability. The first green week remains the gate
  for later promotion under DEC-20260812-A. Backfill preserves existing
  visibility, x402, activity and lifecycle settings, including when its hook fails.
- **Known-answer not verified or failed:** the existing CLI permits some
  execution refusals, transient errors and mismatches without strict mode.
  This runner preserves that behavior and reports it honestly, even if
  readiness passes. Ask the maintainer to inspect the JSON result.
- **Needs attention:** the job fails. Follow the summary's explanation, then
  ask the maintainer if needed. A failed hook or readiness check can follow
  committed rows; inspect the result before retrying. If creation already
  happened, use backfill rather than onboard.
- **Secret not configured / misconfigured / does not match:** check the one-time
  setup. A secret shared with `ADMIN_SECRET` is refused. The batch stops on
  authentication or configuration failure. Never
  paste the secret into a workflow input, issue or message.
- **Manifest missing:** wait for the deployment containing the merged manifest.
- **Busy:** one run is already active. Wait for it to finish. The workflow also
  queues batches, and runs slugs sequentially.
- **Timeout:** a run has a five-minute budget. The batch stops, new database
  queries are refused, and the lock releases even if an executor never settles.
  Route runs skip detached fixture validation. Late executor results cannot start
  further onboarding writes, but already-issued database queries may still drain.
  Some rows may have committed. Ask the maintainer to inspect the run
  status and API logs before trying again.
- **Run not found:** results live in the API process and disappear on restart,
  redeploy or after 100 newer runs. A different API replica also cannot see
  them. Keep this service on one replica for this in-process runner. Inspect
  readiness and logs before retrying; do not assume nothing happened.

Under **Artifacts**, download **onboarding-results** for the full JSON response
for each attempted slug. If discovery or fix produced a manifest, its `.yaml`
file is included too. Ask the maintainer to review and commit that file to
`main`, checking the generated reliability annotations. Discovery marks fields
as guaranteed initially, which still needs review. The API never rewrites its
baked-in manifest files. Artifacts are retained for 14 days.

## Maintainer deploy verification

Dependencies: the server must register the runner ahead of the admin wall,
the deployed image must contain `manifests/`, and Railway must supply the secret.
`apps/api/src/index.ts` imports `app.ts`; `app.ts` mounts `onboardingRunRoute`
at `/v1/internal/onboarding` before `adminOnly`. `Dockerfile` copies `manifests/`
and starts `apps/api/dist/index.js`. The handoff records the exact line numbers
from the implementation commit.

After deploying, before setting the secret, send the following harmless empty
request. It must return **503**, with code `not_configured`:

```sh
curl --silent --show-error --max-time 20 --include \
  -X POST https://api.strale.io/v1/internal/onboarding/run \
  -H 'Content-Type: application/json' -d '{}'
```

After Petter configures the secret and Railway redeploys, the same request
must return **401**, with code `unauthorized`. Repeat with
`-H 'Authorization: Bearer intentionally-wrong'`; expect **401**. These requests
cannot start onboarding. A **404** means this version is not deployed; an admin
message instead of the onboarding-specific message means wiring needs review.

The runtime uses the API's existing connection and vendor keys. It records the
existing `capability_onboarding` authority under DEC-20260812-A in structured
start/finish logs, along with the run id. The CLI continues to use its existing
operator-authority gate. No database URL belongs in GitHub.
