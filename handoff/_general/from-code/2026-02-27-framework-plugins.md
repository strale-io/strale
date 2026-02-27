Intent: Build and publish framework plugins for LangChain, CrewAI, and Semantic Kernel

## What shipped

### 1. langchain-strale (Python, PyPI-ready)
- `packages/langchain-strale/` — LangChain integration
- `StraleToolkit(api_key=...).get_tools()` returns all 233 capabilities as LangChain `BaseTool` instances
- Dynamic Pydantic `args_schema` from capability input schemas
- `StraleSearchTool` (catalog search) and `StraleBalanceTool` (wallet balance)
- Category filtering, 5-min capability cache
- 9/9 tests pass (init, execution, search, balance, error handling)
- Built: `langchain_strale-0.1.0-py3-none-any.whl`

### 2. crewai-strale (Python, PyPI-ready)
- `packages/crewai-strale/` — CrewAI integration
- Same toolkit pattern, uses CrewAI's own `BaseTool` (not LangChain's)
- Error handling returns strings (CrewAI convention) instead of raising
- 8/8 tests pass
- Built: `crewai_strale-0.1.0-py3-none-any.whl`

### 3. strale-semantic-kernel (TypeScript, published to npm)
- `packages/semantic-kernel-strale/` — Semantic Kernel plugin
- `createStralePlugin({apiKey}).then(plugin => kernel.addPlugin(plugin))`
- Each capability becomes a `kernelFunction()` with JSON Schema params
- 7/7 tests pass
- Published: `strale-semantic-kernel@0.1.0` on npm

## Architecture decisions
- Each Python package has its own HTTP client (50 lines, no shared dep — keeps packages independent)
- Dynamic Pydantic models via `create_model()` for capabilities with input_schema; generic `task`/`inputs` fallback otherwise
- Prices included in every tool description (critical for agent cost awareness)
- Capabilities cached 5 min (matches Agent Card cache)
- max_price_cents set to capability's own price (exact match)
- Package name `strale-semantic-kernel` (not `@strale/semantic-kernel`) because `@strale` npm scope doesn't exist

## Publishing status
- npm: `strale-semantic-kernel@0.1.0` ✅ published
- PyPI `langchain-strale`: built and verified, needs `twine upload dist/*` with PyPI token
- PyPI `crewai-strale`: built and verified, needs `twine upload dist/*` with PyPI token

## Publish commands (when PyPI token available)
```bash
# Set up token
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-...

# Publish langchain-strale
cd packages/langchain-strale && python -m twine upload dist/*

# Publish crewai-strale
cd packages/crewai-strale && python -m twine upload dist/*
```

## Test commands
```bash
# LangChain (Python 3.10+)
cd packages/langchain-strale
pip install -e . && STRALE_API_KEY=sk_live_... pytest tests/ -v

# CrewAI (Python 3.13, needs numpy)
cd packages/crewai-strale
pip install -e . && STRALE_API_KEY=sk_live_... pytest tests/ -v

# Semantic Kernel (Node 20+)
cd packages/semantic-kernel-strale
npm install && STRALE_API_KEY=sk_live_... npx tsx --test tests/plugin.test.ts
```
