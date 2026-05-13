---
date: 2026-05-13
type: verification-report
session-intent: Verify scan.strale.io hosting platform after Lovable silent-deploy outage exposed unverified memory claims
worktree: strale-research (read-only)
---

# Beacon Hosting Verification (`scan.strale.io`)

## Verdict

**Hosting platform: Vercel.** Confidence: **HIGH** (4 independent signals agree, no contradicting evidence).

**No Lovable in the pipeline.** Beacon does NOT carry the same silent-deploy risk profile that produced the 73-day `strale-frontend` outage. Memory #14 is correct.

---

## Evidence

### 1. HTTP response headers (live)

```
$ curl -sI https://scan.strale.io/
HTTP/1.1 200 OK
Server: Vercel
X-Vercel-Cache: HIT
X-Vercel-Id: arn1::g2q84-1778653628134-b03da1e5f757
X-Nextjs-Prerender: 1
X-Nextjs-Stale-Time: 300
X-Matched-Path: /
Strict-Transport-Security: max-age=63072000
Age: 783467
Etag: "b2d987267eb39d81ee5369cc7795dfde"
```

Vercel fingerprints present: `Server: Vercel`, `X-Vercel-Id`, `X-Vercel-Cache`, `X-Nextjs-Prerender`. The `arn1` region tag = Stockholm edge (Vercel's `arn1` PoP, IATA code for Stockholm Arlanda).

Identical headers with custom User-Agent (no UA-based variance).

### 2. DNS resolution

```
$ nslookup scan.strale.io 8.8.8.8
Name:    scan.strale.io
Address: 76.76.21.21
```

`76.76.21.21` is **Vercel's well-known anycast IP for custom domains**. Not Lovable (which uses `185.158.x.x` or routes through Cloudflare Pages), not Cloudflare Pages (which uses `*.pages.dev` CNAME or 172.66.x.x), not Netlify, not Railway.

### 3. Repo deploy config

`strale-io/strale-beacon` root contents include:

| File | Present | Signal |
|---|---|---|
| `vercel.json` | YES | Vercel (canonical) |
| `next.config.ts` | YES | Next.js (consistent with Vercel) |
| `wrangler.toml` | no | Cloudflare Pages absent |
| `netlify.toml` | no | Netlify absent |
| `railway.toml` | no | Railway absent |
| `fly.toml` | no | Fly.io absent |
| `_headers` | no | Lovable/CF Pages absent |

Contents of `vercel.json`:

```json
{
  "framework": "nextjs",
  "regions": ["arn1"],
  "crons": [
    { "path": "/api/cron/rescan", "schedule": "0 6 * * *" }
  ],
  "headers": [ ... ]
}
```

The explicit `"framework": "nextjs"`, `"regions": ["arn1"]`, and Vercel-specific `crons` block are unambiguously Vercel. No other platform reads this config.

### 4. Commit author distribution (last 90 days)

```
74 petterlindstrom79
```

100% human-authored. **Zero `lovable-dev[bot]` commits.** No automation pushing into the repo — every commit is Petter via Claude Code. This is the inverse of the `strale-frontend` history that produced the silent-deploy gap.

---

## Silent-deploy risk assessment

**Risk: LOW.**

The `strale-frontend` failure mode required three conditions:
1. Lovable bot owns deploys (not the repo's git push).
2. Lovable's CF Pages account is opaque to the operator.
3. Repo commits never trigger a real deploy.

For Beacon, **none of those conditions hold**:
- Deploy is git-push → Vercel auto-deploy (`vercel.json` + framework auto-detection).
- The Vercel project is operator-owned and visible in Petter's Vercel dashboard.
- Every commit is a real deploy trigger.

The `Age: 783467` header (~9 days) on `/` is a prerendered-page cache hit, expected behavior for static Next.js routes with `Cache-Control: public, max-age=0, must-revalidate` and edge cache. Not a deploy issue. Worth re-verifying after the next intentional deploy to confirm a new ETag appears — but that's hygiene, not a risk flag.

---

## Recommendations

1. **Memory #14 (`scan.strale.io` on Vercel)**: KEEP. Verified accurate.
2. **Tech stack page Frontend section**: the "unverified" caveat about Beacon can now be **removed/sharpened** to "Beacon (`scan.strale.io`): Vercel, verified 2026-05-13 via response headers + DNS + `vercel.json`."
3. **No migration warranted.** Beacon's deploy posture is healthy.
4. **Followup hygiene check (optional, low priority)**: next time a Beacon commit lands, confirm the response `ETag` and `X-Vercel-Id` change to validate the auto-deploy path is actually firing. This is the cheap canary against future silent-deploy drift — adopt the same discipline that would have caught the Lovable outage 73 days earlier.

---

## Worktree / process notes

- Read-only verification, no code changes, no PR.
- Report saved here and `git add`-ed per Rule G (decision-rationale handoff promoted to tracked).
- Rule 1 audit-first complied: hypothesized Vercel based on memory, gathered 4 independent signals, all agreed; no edits required.
