Intent: add a temporary, privacy-safe `xff-shape` log measurement so the production X-Forwarded-For shape can be recorded as a receipt before WP12 batch 4 is retried.

- Middleware `apps/api/src/middleware/xff-shape.ts`, default on, 200 lines per process cap, `XFF_SHAPE_LOG=0` disables. Logs class labels, counts and booleans only.
- Runbook: `docs/operations/xff-shape-measurement.md`.
- Next: after merge and deploy, read `xff-shape` lines, write the receipt (`npm run receipt`), then remove the middleware, its test, the app.ts lines and the env row.
