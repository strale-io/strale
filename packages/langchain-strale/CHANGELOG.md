# Changelog

## 0.2.0 (unreleased)

- Requires `langchain-core>=1.0,<2` (tested on 1.0.0 and the latest 1.x).
- New `strale_execute` meta-tool and `StraleToolkit.get_meta_tools()`: search, execute and balance without loading the catalogue, the same pattern as the Strale MCP server.
- `strale_search` now uses the server-side search and returns each hit's input schema, price and type (tool or bundled solution). It no longer takes a `capabilities` list. Results are `{"ok", "query", "total", "results"}`.
- `api_key` is optional and defaults to `STRALE_API_KEY`. Without a key, search and the free tools work; no empty `Authorization` header is sent.
- `StraleToolkit(max_price_cents=...)` caps what `strale_execute` may charge per call (1 to 2000, default 200).
- Every request sends `X-Strale-Client: langchain-strale/<version>` and a matching `User-Agent`; requests time out after 60 seconds.
- README: agent example rewritten for `langchain.agents.create_agent`; the old `AgentExecutor` example does not run on `langchain` 1.x.
- Offline test suite drives the tools through a fake chat model with `bind_tools`, with HTTP mocked; runs in CI.

## 0.1.5 (never published)

- `X-Strale-Client` attribution header derived from package metadata.

## 0.1.4

- Last release on PyPI before 0.2.0.
