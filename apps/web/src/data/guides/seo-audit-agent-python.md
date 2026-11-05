---
slug: seo-audit-agent-python
title: "How do I automate SEO audits with a Python AI agent?"
description: "Check a page's meta tags, headings, structured data and robots.txt from a LangChain agent with the Strale SEO audit tool. Code included."
group: web
framework: "LangChain"
language: "Python"
tools: [seo-audit, page-speed-test, tech-stack-detect, url-to-markdown]
steps:
  - "Install `langchain-strale` and a chat-model package."
  - "Create the toolkit with your Strale API key."
  - "Bind `seo-audit` to your model."
  - "Ask it to audit a URL and run the tool call the model returns."
---
Bind `seo-audit` from the Strale LangChain toolkit to your model and give it a URL. The tool checks the page's title and description, headings, image alt text, canonical URL, Open Graph tags, structured data and robots.txt, and costs {{price:seo-audit}} a call.

## The solution

```python Python
# pip install langchain-strale langchain-openai
from langchain_strale import StraleToolkit
from langchain_openai import ChatOpenAI

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "seo-audit"]

llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)
result = llm.invoke("Run an SEO audit on https://example.com")

# The model picks the tool and its arguments; your code runs the call.
for call in result.tool_calls:
    tool = next(t for t in tools if t.name == call["name"])
    print(tool.invoke(call["args"]))
```

## How it works

The answer has an `overall_score`, a `checks` object with the raw data for each signal, a flat `issues` list and `prioritized_fixes`, each with a high, medium or low priority. That gives your agent a ranked list of improvements instead of a pass or fail.

The tool's results include a language-model step, so wording can vary between runs. Its performance signal comes from the HTTP response, not from a full browser timing run: use [Page Speed Test](/tools/page-speed-test) when you need Core Web Vitals. Backlinks and domain authority are not assessed.

`bind_tools` only lets the model propose a call. To have the model read the result and answer in words, put the same tools in one of LangChain's agent loops.
