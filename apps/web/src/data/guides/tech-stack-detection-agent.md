---
slug: tech-stack-detection-agent
title: "How do I detect the technology behind a website in an AI agent?"
description: "Identify the frameworks, CMS, analytics and hosting behind a URL from a LangChain agent. Code included."
group: web
framework: "LangChain"
language: "Python"
tools: [tech-stack-detect, ssl-check, dns-lookup, header-security-check]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `tech-stack-detect` to your model."
  - "Ask about a URL and run the tool call the model returns."
---
Bind `tech-stack-detect` from the Strale LangChain toolkit to your model and give it a URL. The tool reads the page's headers, scripts and markup and reports the frontend framework, CMS, analytics and hosting it recognises. It costs {{price:tech-stack-detect}} a call.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "tech-stack-detect"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("What tech stack is https://stripe.com using?")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The tool analyses the page's HTTP headers, JavaScript libraries, meta tags and HTML patterns, and groups what it recognises by kind: frontend framework, CSS framework, CMS, analytics and hosting.

A field comes back empty when no signature matches. That is a real "not detected" result and not a failure. Niche or custom technology can be missed, and anything that runs only on the server is not visible.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
