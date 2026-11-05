---
slug: sanctions-check-langchain
title: "How do I add sanctions screening to a LangChain agent?"
description: "Screen a name against consolidated sanctions lists from a LangChain agent with the Strale sanctions check tool. Code included."
group: screening
framework: "LangChain"
language: "Python"
tools: [sanctions-check, pep-check, adverse-media-check, uk-company-data]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `sanctions-check` to your model."
  - "Ask it to screen a name and run the tool call the model returns."
---
Bind `sanctions-check` from the Strale LangChain toolkit to your model and give it a name. The tool searches Dilisense's consolidated sanctions lists and costs {{price:sanctions-check}} a call. A match means a name appears on a list that was searched. It is not a decision about the person or company: a person should review it.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "sanctions-check"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Screen 'Acme Corporation' against international sanctions lists")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The tool searches the consolidated sanctions and debarment lists that Dilisense maintains, including the US OFAC SDN list, the EU financial sanctions list, the UN Security Council list and the UK sanctions list. The tool page names the sources. It matches names approximately and returns `is_sanctioned`, `match_count` and a `matches` list.

Each match has the listed name, the lists it appears on, the countries involved and the listing details. There is no numeric confidence score. Common names can match the wrong person or company, so pass `country`, and `birth_date` for a person, to narrow the search.

Every answer includes `lists_queried`, which names the lists searched, so you can show what was checked.

A match means a name appears on a list that was searched. It is not a decision about the person or company: a person should review it.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
