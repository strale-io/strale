---
slug: email-validation-langchain
title: "How do I validate email addresses in a LangChain agent?"
description: "Check an email address for syntax, MX records and disposable or role-address signals from a LangChain agent. Code included."
group: web
framework: "LangChain"
language: "Python"
tools: [email-validate, dns-lookup, domain-reputation, iban-validate]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `email-validate` to your model."
  - "Ask about an address and run the tool call the model returns."
---
Bind `email-validate` from the Strale LangChain toolkit to your model and give it an address. The tool checks the syntax and the domain's MX records and flags disposable, role and free-provider addresses. It is {{cost:email-validate}} to call.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "email-validate"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Is user@example.com a valid, deliverable email address?")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The check covers the syntax (`format_valid`), the DNS (`has_mx_records`: does the domain accept mail?) and some signals about the address: `is_disposable` for throwaway providers, `is_role_address` for addresses such as info@ or support@, and `is_free_provider` for providers such as Gmail.

`valid` is the overall answer. There is no single deliverability score, and the separate flags let your agent apply its own policy, for example rejecting disposable addresses and flagging role addresses for review.

A valid result does not prove that the mailbox exists, and new disposable domains can be missed.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
