---
slug: vat-validation-python-agent
title: "How do I validate EU VAT numbers in a Python AI agent?"
description: "Check VAT numbers against the EU VIES register from a LangChain agent with the Strale VAT validation tool. Code included."
group: payments
framework: "LangChain"
language: "Python"
tools: [vat-validate, vat-format-validate, iban-validate, eori-validate]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `vat-validate` to your model. `vat-format-validate` only checks the format and never asks VIES."
  - "Ask about a VAT number and run the tool call the model returns."
---
Use the `vat-validate` tool to check a VAT number against the EU's VIES register. It costs {{price:vat-validate}} a call and needs an API key. `vat-format-validate` is a different tool that checks only the number's format.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "vat-validate"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Check if VAT number SE556703748501 is valid and get the company name")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

`vat-validate` asks VIES, the VAT Information Exchange System run by the European Commission, whether a number is registered. It returns whether the number is valid and, where the member state releases them, the registered name and address. Germany, for one, does not release a name or address through VIES.

`vat-format-validate` is the cheaper, offline check: it confirms the number is well formed for its country and never queries VIES.

Results can be served from a cache of up to 48 hours. If VIES is down, a cached result may come back marked `stale: true`.

VIES is sometimes slow or unavailable for a single country. Set a timeout, and treat a VIES-unavailable answer as "unknown", not "invalid".

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
