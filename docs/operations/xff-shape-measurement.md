# X-Forwarded-For shape measurement (temporary)

Purpose: record the real shape of `X-Forwarded-For` in production before
cto-readiness WP12 batch 4 is retried (see
`docs/incidents/2026-11-05-client-ip-identity-collapse.md`, "What changes").

## What runs

`apps/api/src/middleware/xff-shape.ts`, mounted right after `requestContext()`
in `app.ts`. It is on by default and logs at most 200 `xff-shape` lines per
process (health checks do not count), then goes silent. `XFF_SHAPE_LOG=0`
turns it off. Default-on with a hard cap was chosen so that one deploy yields
the data without anyone touching Railway; the cap bounds log volume and the
line carries no address, so there is nothing to leak. Each restart resets the cap.

## What a line holds

`entry_count`, `entry_classes` (one label per position, left to right, from
`public_v4 | public_v6 | private | cgnat | loopback | link_local |
unparseable`), `peer_class`, `left_most_is_peer`, and booleans for
`x_real_ip_present`, `cf_connecting_ip_present`, `forwarded_present`,
`x_forwarded_proto_present`, `x_forwarded_host_present`. Never an address,
a hash, a prefix or a port. Tests assert no IPv4/IPv6-looking substring in the
emitted object.

## Debug endpoint (temporary)

`GET https://<api>/v1/debug/xff-shape` is unauthenticated and returns the same
shape object for the caller's own request (no address, hash or port), limited
to 20 per minute per IP, `cache-control: no-store`. It lets a session without
log access read the shape by calling it. It is excluded from the OpenAPI
coverage test with a TEMPORARY reason in `openapi-internal-routes.ts`.

## Reading it

Search `xff-shape` in Railway logs or Better Stack. Tally `entry_classes` and
`entry_count`. The incident's inference to confirm or refute: `[public_v4,
public_v4]` with the last entry being Railway's edge, and whether
`left_most_is_peer` is ever true (it should be false behind the edge).
Include real client traffic, not only your own probes.

## Reading the distinct counts

`distinct_left_most_seen` and `distinct_right_most_seen` count distinct
left-most and right-most XFF entries seen by this process (saturating at
1000). Values are held only as HMAC-SHA256 under a random per-process key
that is never logged or exported, so only the counts leave memory.
`left_most_equals_right_most` is true when there is one entry or both ends
match. Discriminator: if right-most stays around 2 while left-most grows
with distinct callers, the right-most entry is Railway's edge, not the
client, and a right-most rule would collapse identities (the 2026-11-05
failure). If both grow together, the right-most entry is the client.
Counts reset on restart; the debug endpoint's own calls are included.

## Removal

Once the tally is written as a receipt
(`npm run receipt -- --kind xff-shape --topic production --from <file>`),
delete `middleware/xff-shape.ts`, its test, the `app.ts` lines (middleware and `/v1/debug/xff-shape` route), the exclusion in `openapi-internal-routes.ts`, the `"/*"` count in `openapi-route-coverage.ts` (5 back to 4), and the
`XFF_SHAPE_LOG` row in `config/env-manifest.yaml`, then run
`npm run env:example`.
