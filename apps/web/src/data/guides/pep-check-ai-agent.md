---
slug: pep-check-ai-agent
title: "How do I check for politically exposed persons (PEPs) in an AI agent?"
description: "Search a person against a consolidated database of politically exposed persons from a LangChain agent. Code included."
group: screening
framework: "LangChain"
language: "Python"
tools: [pep-check, sanctions-check, adverse-media-check, beneficial-ownership-lookup]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `pep-check` to your model."
  - "Ask it to check a name and country, then run the tool call the model returns."
---
Bind `pep-check` from the Strale LangChain toolkit to your model and give it a person's name and country. The tool searches Dilisense's consolidated database of politically exposed persons and costs {{price:pep-check}} a call. A match means a name appears on a list that was searched. It is not a decision about the person or company: a person should review it.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "pep-check"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Check if 'John Smith' from the United Kingdom is a PEP")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

A politically exposed person is someone who holds or has held a prominent public position, such as a politician, senior official, judge or military leader. The database also lists their relatives and close associates.

The answer has `is_pep`, `match_count` and a `matches` list with each person's name, positions held and the countries involved, plus `lists_queried`, which names the source.

There is no numeric confidence field, so narrowing the query is your main lever for precision: pass `country` and `birth_date` where you have them. Coverage per country is not verified on each call.

A match means a name appears on a list that was searched. It is not a decision about the person or company: a person should review it.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
