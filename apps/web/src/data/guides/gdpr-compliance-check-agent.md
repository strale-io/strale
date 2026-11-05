---
slug: gdpr-compliance-check-agent
title: "How do I check a website for common GDPR signals with an AI agent?"
description: "Scan a website for a cookie consent banner, a privacy policy link, tracking scripts and HSTS from a LangChain agent. Code included."
group: screening
framework: "LangChain"
language: "Python"
tools: [gdpr-website-check, ssl-check, header-security-check, tech-stack-detect]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `gdpr-website-check` to your model."
  - "Ask it to check a URL and run the tool call the model returns."
---
Bind `gdpr-website-check` from the Strale LangChain toolkit to your model and give it a URL. The tool looks for a cookie consent banner, a privacy policy link, known tracking scripts and basic security headers, and costs {{price:gdpr-website-check}} a call. It is a quick scan, not a legal audit.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "gdpr-website-check"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Check https://example.com for GDPR signals: cookie consent, privacy policy and tracking")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The tool fetches the page and looks for a cookie consent mechanism, a privacy policy link, known tracking scripts such as analytics and advertising pixels, and the HSTS header.

The answer has a letter `grade`, a numeric `gdpr_score` and a `findings` list of plain-language issues, such as "No cookie consent mechanism detected". Findings have no severity, so use the grade and score to decide what to look at first.

Detection is based on page signatures and headers; no language model reads the page. The scan does not check internal data-processing practices and does not replace legal review.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
