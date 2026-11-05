---
slug: lei-code-lookup-agent
title: "How do I look up LEI codes for legal entities in an AI agent?"
description: "Look up a Legal Entity Identifier at GLEIF from a LangChain agent with the Strale LEI lookup tool. Code included."
group: companies
framework: "LangChain"
language: "Python"
tools: [lei-lookup, swift-validate, iban-validate, sanctions-check]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `lei-lookup` to your model."
  - "Ask about an LEI code and run the tool call the model returns."
---
Bind `lei-lookup` from the Strale LangChain toolkit to your model and give it an LEI. The tool reads GLEIF, the Global Legal Entity Identifier Foundation, and costs {{price:lei-lookup}} a call.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "lei-lookup"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Look up the LEI 549300561UZND4C7B569")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

A Legal Entity Identifier is a 20-character code that identifies a legal entity in financial transactions. The tool queries GLEIF and returns the entity's legal name, status, jurisdiction and legal address.

GLEIF data has the same shape whichever country the entity is in. Only entities that have registered for an LEI are covered, so a missing LEI says nothing about whether the company exists.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
