---
slug: iban-validation-langchain-python
title: "How do I validate an IBAN in a LangChain Python agent?"
description: "Give a LangChain agent the Strale IBAN validation tool and run the call the model chooses. Code included."
group: payments
framework: "LangChain"
language: "Python"
tools: [iban-validate, swift-validate, vat-format-validate, sepa-xml-validate]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Keep the `iban-validate` tool and bind it to your model."
  - "Ask about an IBAN, then run the tool call the model returns."
---
Take the `iban-validate` tool from the Strale LangChain toolkit, bind it to your model and run the call the model returns. The tool is {{cost:iban-validate}} to call.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "iban-validate"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Validate this IBAN: DE89370400440532013000")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The tool checks an IBAN's structure, country code and check digits. Where it holds the bank's registry entry it also returns the bank code and branch code. It does not confirm that the account exists or is open.

The toolkit turns each Strale tool into a LangChain tool named after its slug. The model picks `iban-validate` and fills in the `iban` argument. `tool.invoke(call["args"])` runs the call and returns a dictionary with `valid`, `country_code` and `bank_code`.

The check is algorithmic, so the same IBAN always gives the same answer.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
