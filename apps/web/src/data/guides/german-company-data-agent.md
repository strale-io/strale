---
slug: german-company-data-agent
title: "How do I fetch German company registration data in an AI agent?"
description: "Look up a German company by name or register number from a LangChain agent with the Strale German company data tool. Code included."
group: companies
framework: "LangChain"
language: "Python"
tools: [german-company-data, french-company-data, belgian-company-data, vat-format-validate]
countries: [DE]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `german-company-data` to your model."
  - "Ask about a company by name and run the tool call the model returns."
---
Bind `german-company-data` from the Strale LangChain toolkit to your model and ask about a company by name. The tool reads the German commercial register (Handelsregister) through OpenRegister, and costs {{price:german-company-data}} a call.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "german-company-data"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Look up SAP SE in the German company register")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The tool takes a company name, or the register type, number and court (for example HRB 12345 at a given Amtsgericht). It returns the legal form, register court, registered address and, where the register has them, directors and the LEI. Data from different registration courts comes back in one shape.

The data comes from OpenRegister, which wraps the register; the stored records can be up to four weeks old. Status and the incorporation date are the most reliable fields. Director lists vary in how complete they are.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
