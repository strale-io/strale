# Changelog

## 0.2.0 (unreleased)

- Requires `langchain-core>=1.0,<2` (tested on 1.0.0 and the latest 1.x) and `pydantic>=2.7.4` (the langchain-core 1.x floor).
- New `strale_execute` meta-tool and `StraleToolkit.get_meta_tools()`: search, execute and balance without loading the catalogue, the same pattern as the Strale MCP server.
- Breaking: `strale_search` now uses the server-side search and returns each hit's input schema, price and type (tool or bundled solution). It no longer takes a `capabilities` list or the `category` and `offset` arguments; it takes `query` and `limit` (1 to 10). Results are `{"ok", "query", "total", "results"}` instead of the old `total_matches`/`offset`/`has_more` pages of 20.
- `get_tools()` now returns three meta-tools (`strale_search`, `strale_execute`, `strale_balance`) after the per-capability tools.
- Per-capability tools: an HTTP error (including a keyless 402 payment challenge) is now a tool error with payment guidance instead of a successful result; omitted optional fields are no longer sent as `null`; a timeout tells the model not to retry a paid tool automatically.
- `api_key` is optional and defaults to `STRALE_API_KEY`. Without a key, search and the free tools work; no empty `Authorization` header is sent.
- `StraleToolkit(max_price_cents=...)` caps what `strale_execute` may charge per call (1 to 2000, default 200).
- Every request sends `X-Strale-Client: langchain-strale/<version>` and a matching `User-Agent`; requests time out after 60 seconds.
- README: agent example rewritten for `langchain.agents.create_agent`; the old `AgentExecutor` example does not run on `langchain` 1.x.
- Offline test suite drives the tools through a fake chat model with `bind_tools`, with HTTP mocked; runs in CI.

## 0.1.5 (never published)

- `X-Strale-Client` attribution header derived from package metadata.

## 0.1.4

- Last release on PyPI before 0.2.0.
