# Additional API keys: independent review

Scope: working diff on `feat/api-key-spend-limits`, based on `10f71df8`;
implementation committed locally as `6a9a362b`. Endpoint-mounting tests were
subsequently added as `ae10877d`; no implementation changed after the review.
Reviewers read `REVIEW.md` in separate contexts. No production actions occurred.

## Correctness and safety

Round 1: GO with nits, no HIGH finding. One MEDIUM: locked revocation checks
followed the insufficient-balance response on sync/async capability calls and
solution calls. A request authenticated before revocation could wait for the
wallet lock and then receive balance details instead of the expected 401.

Resolution: move key-policy validation immediately after wallet acquisition,
before affordability responses. Add a regression assertion for all three paths.
Round 2 confirmation: GO, no remaining findings in that confirmation scope.

The reviewer inspected wallet locking, debit attribution, refund accounting,
ownership checks, prefix/hash verification and startup registration.

## Product, SDK and API contract

Round 1: GO, no HIGH or MEDIUM findings. Endpoints, SDK methods, OpenAPI and
docs agree. Creation alone returns the key; errors name the fix; self-revocation
preserves the primary key. Management authority and its implications are explicit.

## Limits of the review

Real Postgres integration behavior was not executed locally. The CI disposable
Postgres lane must pass before merge, including both real concurrent-cap tests,
refund accounting, async/solution attribution and migration reruns. Production
migration effects must be queried after deployment. Neither a review verdict nor
a unit test substitutes for those checks.

The `simplify` skill referenced by `go` is unavailable in this session. The manual
simplification pass kept a single auth resolver, one key-spending query, a shared
cap helper and one locked management wrapper. No broad refactor was introduced.
The user reserves pushing, PR creation, merging and publishing for the orchestrator.
