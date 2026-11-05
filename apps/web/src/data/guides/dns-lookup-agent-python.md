---
slug: dns-lookup-agent-python
title: "How do I run DNS lookups in a Python AI agent?"
description: "Query a domain's DNS records with the Strale Python SDK, including whether SPF and DMARC are set up. Code included."
group: web
framework: "Python SDK"
language: "Python"
tools: [dns-lookup, ssl-check, email-validate, domain-reputation]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Create the client with your API key."
  - "Call `dns-lookup` with a domain name."
  - "Read the record fields and the SPF and DMARC flags."
---
Call `dns-lookup` through the Strale Python SDK to read a domain's A, AAAA, MX, TXT, CNAME and NS records in one call, with flags for SPF and DMARC. The tool is {{cost:dns-lookup}} to call.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")  # the SDK needs a key, even for free tools

result = strale.do(DoRequest(
    capability_slug="dns-lookup",
    inputs={"domain": "google.com"},
    max_price_cents=5,
))

for record_type, records in result.output.items():
    if records:
        print(f"{record_type}: {records}")
```

## How it works

One call queries several record types: `a_records`, `aaaa_records`, `mx_records`, `txt_records`, `cname_records` and `ns_records`. That is useful for domain research, email deliverability checks and security reviews.

The answer also has `has_spf`, `has_dmarc` and the parsed `dmarc_record`, so you do not have to read the TXT records yourself to see whether email authentication is set up.

DNS changes can take up to 48 hours to show up everywhere, so a very recent change may not appear yet.
