# DK CVR system-to-system access — email draft (Petter: review, fill placeholders, send)

**To:** cvrselvbetjening@erst.dk
**From:** petter@strale.io
**Subject:** Application for system-to-system access to CVR data (distribution.virk.dk)

---

Dear CVR team at Erhvervsstyrelsen,

I would like to apply for system-to-system access to CVR data via
distribution.virk.dk, per the process described at
https://datacvr.virk.dk/artikel/system-til-system-adgang-til-cvr-data.

**About us:**
- Company: Strale [LEGAL ENTITY NAME], Sweden
- Registration number: [SWEDISH ORG NUMBER]
- Website: https://strale.dev
- Contact: Petter Lindström, petter@strale.io

**Intended use:**
Strale operates a data platform that provides company-verification lookups
(KYB — know your business) to software customers. We need programmatic access
to CVR master data (company name, status, address, legal form, registration
date) and, where publicly available, information on management/officers and
beneficial owners (reelle ejere), to answer individual per-company lookup
requests initiated by our customers.

**Access pattern:**
- Individual per-entity queries only (no bulk replication of the register)
- Expected volume: low — under 1,000 queries per month initially
- Data is retrieved on demand and attributed to CVR/Erhvervsstyrelsen as the
  source in every response we deliver

We are happy to provide any further information you need, and to comply with
any terms of use attached to the access.

Thank you, and best regards,

Petter Lindström
Founder, Strale
petter@strale.io · https://strale.dev

---

**Before sending, fill in:** legal entity name + Swedish org number.
**After the credential arrives:** danish-company-data migrates from cvrapi.dk
(quota-broken) to distribution.virk.dk, then un-quarantine + re-enable the
3 DK solutions. Same credential unlocks DK officers AND the public beneficial-
owner register — the only free UBO source outside the UK.
