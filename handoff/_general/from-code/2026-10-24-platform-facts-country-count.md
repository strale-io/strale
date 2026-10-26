Intent: fix the platform-facts country undercount, as Petter asked in session on 2026-10-24.

`computePlatformFacts` read countries from capability slugs with `/^([a-z]{2,12})-company-data$/` and an SQL `LIKE '%-company-data'`. It dropped `luxembourgish-company-data` (13 letters) and every vendor-suffixed slug (`us-company-data-cobalt`), and it counted alias prefixes twice (`au-` and `australian-company-data`).

Changed: the pattern and the SQL accept any prefix length and an optional vendor suffix. A new additive field, `countries.company_data_active_iso`, holds one ISO code per country. The four count consumers (llms.txt, the agent card, the AI catalogue and the welcome route) now count that field. `company_data_active` keeps its prefix format, so strale-frontend's reader is unaffected.

Tests: `apps/api/src/lib/platform-facts.test.ts`. Four new cases failed against the old code and pass now. A manifest-driven test fails when a new adjective prefix has no ISO mapping.

Next: after deploy, read `GET https://api.strale.io/v1/platform/facts` and check that `countries.company_data_active_iso` lists each live register country once (DEC-20260504-C). The PR is open for review and not merged.
