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

## Reading it

Search `xff-shape` in Railway logs or Better Stack. Tally `entry_classes` and
`entry_count`. The incident's inference to confirm or refute: `[public_v4,
public_v4]` with the last entry being Railway's edge, and whether
`left_most_is_peer` is ever true (it should be false behind the edge).
Include real client traffic, not only your own probes.

## Removal

Once the tally is written as a receipt
(`npm run receipt -- --kind xff-shape --topic production --from <file>`),
delete `middleware/xff-shape.ts`, its test, the `app.ts` lines, and the
`XFF_SHAPE_LOG` row in `config/env-manifest.yaml`, then run
`npm run env:example`.
