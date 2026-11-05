---
slug: eu-ai-act-classification-agent
title: "How do I get an EU AI Act risk classification for an AI system with an agent?"
description: "Send a description of an AI system to the Strale EU AI Act classification tool and read the risk level and the articles it matched. Code included."
group: screening
framework: "Python SDK"
language: "Python"
tools: [eu-ai-act-classify, gdpr-website-check, sanctions-check, pep-check]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Create the client with your API key."
  - "Describe the AI system's purpose in the `description` field."
  - "Read the risk level, obligations and the articles that matched."
---
Call `eu-ai-act-classify` with a description of an AI system to get a rule-based first classification under the EU AI Act: a risk level, whether it looks prohibited, the obligations that follow and the articles that matched. It costs {{price:eu-ai-act-classify}} a call. The classification needs legal review.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")

result = strale.do(DoRequest(
    capability_slug="eu-ai-act-classify",
    inputs={
        "description": "AI system that scores job applicant CVs "
        "and recommends candidates for interview"
    },
    max_price_cents=100,
))

print(f"Risk level: {result.output['risk_level']}")
print(f"Prohibited: {result.output['prohibited']}")
print(f"Obligations: {result.output['obligations']}")
print(f"Applicable articles: {result.output['applicable_articles']}")
```

## How it works

The EU AI Act sorts AI systems into risk categories: prohibited, high risk, limited risk and minimal risk. The category decides which obligations apply.

The tool is rule-based and does not use a language model. It matches your description against the Annex III categories and the criteria in Articles 5, 6 and 50, and returns `risk_level`, `prohibited`, `obligations`, `applicable_articles` and a `classification_reason` that says which criteria matched.

Matching is by keyword, so describe the system in standard terms, such as "CV scoring", "biometric identification" or "credit scoring", and not in vague language. `classification_reason` shows exactly what triggered the result.

The result is a starting point. Whether a system falls under the Act is a legal question, and the tool does not answer it.
