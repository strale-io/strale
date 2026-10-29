Intent: distribution T12, first housekeeping item. Refresh `packages/langchain-strale` for langchain-core 1.x with meta-tools and an offline CI test. Nothing was published.

## What changed

- 0.2.0 requires `langchain-core>=1,<2`. Tested on 1.0.0 with Python 3.10 and on 1.7.1 with Python 3.13. Both run as a matrix in the new `langchain-strale` CI job.
- New tools: `strale_execute` and `StraleToolkit.get_meta_tools()`. `strale_search` now uses `/v1/suggest/typeahead` plus the detail endpoints, the same as `ai-sdk-strale`. Per-capability tools are unchanged.
- The API key is optional and falls back to `STRALE_API_KEY`. `max_price_cents` sets the per-call cap: between 1 and 2000, default 200.
- Attribution: every request sends `X-Strale-Client: langchain-strale/<version>` as the client header and as the User-Agent.
- README rewritten for `langchain.agents.create_agent`. The published 0.1.4 README uses `AgentExecutor`, which `langchain` 1.x no longer exports, so that example fails today.
- Offline test (`tests/test_agent_loop.py`): a `GenericFakeChatModel` subclass whose `bind_tools` calls `convert_to_openai_tool`. Each ToolCall goes through `BaseTool.invoke` and comes back as a ToolMessage. HTTP is mocked with `responses`. Mutation checks confirmed the tests fail when attribution, the auth scope or the gated-solution handling is broken.
- Keyless production smoke from source on 2026-10-29:
  - search returned input schemas for tools and solutions;
  - `iban-validate` ran free (`rail: free`, `ok: true`);
  - `uk-company-data` without a key returned 402 `payment_required` with payment guidance.

## Publish step (PyPI, under DEC-20261027-B §9 item 7)

The repo has no PyPI release workflow; 0.1.0 to 0.1.4 were uploaded by hand with twine. After this PR merges, on a computer with Python 3.10 or later:

1. In a terminal at the repo root: `git checkout main && git pull`
2. `cd packages/langchain-strale`
3. `python -m pip install --upgrade build twine`
4. `python -m build` creates `dist/langchain_strale-0.2.0.tar.gz` and `dist/langchain_strale-0.2.0-py3-none-any.whl`.
5. `python -m twine upload dist/langchain_strale-0.2.0*`. At the prompt, enter the username `__token__`. The password is a PyPI API token scoped to `langchain-strale`, created at pypi.org → Account settings → API tokens.
6. Smoke test the published artifact the way a stranger would. This step is required by DEC-20260422-A step 6.

```bash
python -m venv /tmp/lcs && /tmp/lcs/bin/pip install "langchain-strale==0.2.0"
cd /tmp && STRALE_API_KEY= /tmp/lcs/bin/python -c "
import json; from langchain_strale import StraleToolkit
from importlib.metadata import version; print('version', version('langchain-strale'))
s, e, b = StraleToolkit().get_meta_tools()
print(json.loads(s.invoke({'query': 'validate iban'}))['results'][0]['slug'])
print(json.loads(e.invoke({'slug': 'iban-validate', 'inputs': {'iban': 'SE4550000000058398257466'}}))['ok'])"
```

Expected: `version 0.2.0`, `iban-validate`, `True`. Record the observed values in the program track's evidence.

Recommended follow-up: add a PyPI trusted-publisher workflow, mirroring `release-npm.yml`, so later Python releases need no token.
