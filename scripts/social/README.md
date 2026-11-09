# Strale social scheduling

The founder requested on 2026-11-09 that every future scheduled X and LinkedIn
post carry tracking links, and that edits preserve confirmed publishing times.

Use `typefully_tracking.Client` for all draft creation, updates and scheduling.
Supply the credential at runtime from the approved local credential helper or
secret store. Never put credentials into a file or receipt.

```python
from typefully_tracking import Client
client = Client(api_key)
confirmed = client.request('/drafts', 'POST', {
    'draft_title': 'A useful example',
    'platforms': {'x': {'enabled': True, 'posts': [
        {'text': 'Approved copy with a relevant link: https://strale.io/tools/iban-validate'}
    ]}},
    'publish_at': '2027-01-20T16:00:00+01:00',
    'share': False,
}, campaign='tools_2027_01')
```

Use explicit timezone-aware timestamps. `plan_at`, `now`, `next-free-slot` and
unscheduling are deliberately rejected by this boundary. A scheduled-post edit
echoes its original timestamp via `publish_at`, then rereads the draft and checks
`status=scheduled`, the exact instant, platform settings, thread structure,
media and all submitted post fields. A concurrent editor causes an abort.

Every enabled platform's post/thread needs at least one relevant public Strale
link. All owned links receive `utm_source=x|linkedin`,
`utm_medium=organic_social`, `utm_campaign` and a per-post `utm_content`.
External links are untouched. Private/payment links and unexpected query
parameters are rejected. The client validates standard X and LinkedIn lengths.
Do not bypass a validation error with raw HTTP: resolve it in the content or
review the exceptional operation separately.

After a batch, reread the entire affected queue. Confirm account identity,
schedule, media readiness and platform connection state. Store before/after
receipts without credentials. Confirmed means the service has accepted the
schedule; subsequent platform outages or revoked account access can still
prevent publication.

This is a client-side scheduling guard, not a Typefully account-wide setting.
Posts created manually in Typefully or by another integration must be passed
through this check before scheduling. The local campaign workspace's AGENTS.md
points future sessions here, and its existing Typefully helper uses this client.

Website attribution uses only safe labels in public URLs, with no new cookies,
localStorage, account IDs or form contents sent to Umami. The signup form passes
the channel label to the existing backend `signup_src` mechanism. Page views
and tool/signup events can be compared in Umami; downstream API activation
remains a separate aggregate backend report, not a claimed end-to-end identity
join in browser analytics.

Verify: `python -m unittest discover -s scripts/social -p 'test_*.py'`.
