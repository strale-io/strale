---
slug: json-repair-ai-agent
title: "How do I automatically repair malformed JSON in an AI agent?"
description: "Fix trailing commas, single quotes and unquoted keys in model output with the Strale JSON repair tool. Code included."
group: web
framework: "Python SDK"
language: "Python"
tools: [json-repair, url-to-markdown, email-validate, dns-lookup]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Create the client with your API key."
  - "Send the malformed string in the `json` field."
  - "Read the repaired string from `output[\"json\"]` or the parsed data from `output[\"parsed\"]`."
---
Send broken JSON to `json-repair` and get back a valid string and the parsed data. The tool is {{cost:json-repair}} to call, and it works on the text alone.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")  # the SDK needs a key, even for free tools

broken_json = """{
  name: "John",
  age: 30,
  "hobbies": ["reading", "coding",],
  'active': true
}"""

result = strale.do(DoRequest(
    capability_slug="json-repair",
    inputs={"json": broken_json},
    max_price_cents=5,
))

print(result.output["json"])  # the repaired JSON string
print(result.output["parsed"])  # the same data, already parsed
print(result.output["fixes_applied"])
```

## How it works

Language models often produce malformed JSON: trailing commas, single quotes, unquoted keys, comments and truncated output. The tool repairs these errors with fixed rules, so the same input always gives the same output.

The answer has `json` (the repaired string), `parsed` (the same data, parsed, so you do not need a second `json.loads`), `valid` and `fixes_applied`, a list that says what was changed, such as "Added missing closing brackets/braces". Severely malformed input may not be recoverable.
