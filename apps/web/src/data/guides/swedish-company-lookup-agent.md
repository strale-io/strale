---
slug: swedish-company-lookup-agent
title: "How do I look up Swedish company data in a LangChain agent?"
description: "Look up a Swedish company at Bolagsverket by organisation number from a LangChain agent. Code included."
group: companies
framework: "LangChain"
language: "Python"
tools: [swedish-company-data, norwegian-company-data, finnish-company-data, vat-validate]
countries: [SE]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `swedish-company-data` to your model."
  - "Ask about an organisation number and run the tool call the model returns."
---
Bind the `swedish-company-data` tool from the Strale LangChain toolkit to your model and give it an organisation number. The tool reads Bolagsverket, the Swedish Companies Registration Office, and costs {{price:swedish-company-data}} a call. A fuller guide to the tool is [Swedish company registry API](/guides/swedish-company-lookup-api).

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "swedish-company-data"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Look up Swedish company 556703-7485")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

Given an organisationsnummer, the tool returns the company name, legal form, status, registration and deregistration dates, SNI industry codes, the VAT number, the registered address and a business description, and any ongoing insolvency or restructuring procedures.

It does not return revenue, employee numbers or board members, and it takes the organisation number only, not a company name.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
