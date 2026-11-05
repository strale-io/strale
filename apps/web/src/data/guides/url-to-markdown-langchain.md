---
slug: url-to-markdown-langchain
title: "How do I convert web pages to Markdown in a LangChain agent?"
description: "Turn a web page into clean Markdown for a model from a LangChain agent with the Strale URL to Markdown tool. Code included."
group: web
framework: "LangChain"
language: "Python"
tools: [url-to-markdown, web-extract, dns-lookup, tech-stack-detect]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `url-to-markdown` to your model."
  - "Ask it to fetch a URL and run the tool call the model returns."
---
Bind `url-to-markdown` from the Strale LangChain toolkit to your model and give it a URL. The tool returns the page's main content as Markdown, which uses fewer tokens than raw HTML. It is {{cost:url-to-markdown}} to call.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "url-to-markdown"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Fetch https://example.com and convert it to Markdown")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The tool fetches one page you name, extracts the main content and converts headings, lists, links and code blocks to Markdown. The answer has the page `title`, the `markdown` and a `word_count`.

It identifies itself in its user agent, follows the site's robots.txt and stops at pages that block automated access, rather than working around the block. Pages behind a login or a paywall cannot be read, and pages built mostly in the browser may come back incomplete.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
