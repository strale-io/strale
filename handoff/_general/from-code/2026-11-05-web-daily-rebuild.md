Intent: a daily rebuild of the public site through the Cloudflare Pages deploy hook, and readiness item 8 brought up to date after Petter created the Pages project.

- `.github/workflows/web-daily-rebuild.yml`: 03:17 UTC and on demand; POSTs the deploy hook held in the repository secret `CF_PAGES_DEPLOY_HOOK`; no permissions, no checkout, never prints the URL; fails loudly when the secret is missing or Cloudflare does not accept the build.
- First observation: run it once by hand (Actions > Website daily rebuild > Run workflow) after the secret exists, and confirm a new production deployment of `main` appears in the strale-web project (a deploy hook builds the branch chosen when it was created).
