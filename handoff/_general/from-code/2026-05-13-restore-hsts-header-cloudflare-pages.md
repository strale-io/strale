Intent: Restore the `Strict-Transport-Security` header that strale.dev lost during the Lovable → Cloudflare Pages migration.

## Why

Pre-migration (Lovable), strale.dev emitted `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every response. Post-migration (Cloudflare Pages, 2026-05-12), the header was absent. Browsers with the existing HSTS pin would continue enforcing HTTPS for the remaining max-age window, but new visitors after the migration weren't getting a fresh pin. Security regression.

## What shipped — strale-frontend PR #7 (merged + deployed)

Branch: `chore/restore-hsts-header` → squash-merged into `main`.

One file added:

- **`public/_headers`**:
  ```
  /*
    Strict-Transport-Security: max-age=31536000; includeSubDomains
  ```

Cloudflare Pages convention. Vite copies `public/_headers` → `dist/_headers` at build (verified locally). CF Pages auto-applies on every deploy.

`preload` deliberately omitted — the HSTS preload list submission is operationally hard to reverse and not something to commit to pre-launch.

## Verification (post-deploy)

```
$ curl -sI https://strale.dev/ | grep -i strict-transport-security
Strict-Transport-Security: max-age=31536000; includeSubDomains

$ curl -sI https://www.strale.dev/ | grep -i strict-transport-security
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Both apex and `www.` subdomain emit the header. Security parity with pre-migration restored.

## Open

None for HSTS specifically. Adjacent future work that the `_headers` file makes cheap: adding CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy under the same `/*` block when there's a reason. Not doing them now — single-purpose PR.

## Non-obvious learnings

- Cloudflare Pages reads `_headers` from the build *output* directory (`dist/`), not the source `public/`. Vite's default `publicDir → outDir` copy is what makes the `public/_headers` placement work. If the project ever changes `publicDir` or pre-processes `public/` differently, the `_headers` file needs to follow.
- Cloudflare Pages syntax requires the two-space indent on header lines — without it, the parser doesn't associate the header with the path glob.
