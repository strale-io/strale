from importlib.metadata import version
from unittest.mock import patch, Mock
from composio_strale import StraleToolkit

def test_header_on_search_fallback_execute_and_balance():
    tools = {}
    class Registry:
        def custom_tool(self, **kwargs):
            def register(fn):
                tools[fn.__name__] = fn
                return fn
            return register
    toolkit = StraleToolkit(api_key="fixture")
    toolkit.register(Mock(tools=Registry()))
    from composio_strale.toolkit import StraleSearchInput, StraleExecuteInput, StraleBalanceInput
    with patch("composio_strale.toolkit.httpx.get") as get, patch("composio_strale.toolkit.httpx.post") as post:
        get.side_effect = [Mock(status_code=500), Mock(status_code=200, json=lambda: {"capabilities": []}), Mock(json=lambda: {})]
        post.return_value = Mock(json=lambda: {})
        tools["strale_search"](StraleSearchInput(query="fixture"))
        tools["strale_execute"](StraleExecuteInput(capability_slug="fixture", inputs={}))
        tools["strale_balance"](StraleBalanceInput())
        for call in get.call_args_list + post.call_args_list:
            assert call.kwargs["headers"]["X-Strale-Client"] == "composio-strale/" + version("composio-strale")


def test_missing_distribution_metadata_keeps_header_without_auth():
    from importlib.metadata import PackageNotFoundError
    with patch.dict("os.environ", {}, clear=True), patch("composio_strale.toolkit.version", side_effect=PackageNotFoundError):
        headers = StraleToolkit(api_key="")._headers()
        assert headers["X-Strale-Client"] == "composio-strale/unknown"
        assert "Authorization" not in headers


def test_public_fallback_search_sends_no_authorization_without_a_key():
    tools = {}
    class Registry:
        def custom_tool(self, **kwargs):
            def register(fn):
                tools[fn.__name__] = fn
                return fn
            return register
    with patch.dict("os.environ", {}, clear=True):
        StraleToolkit(api_key="").register(Mock(tools=Registry()))
    from composio_strale.toolkit import StraleSearchInput
    with patch("composio_strale.toolkit.httpx.get") as get:
        get.side_effect = [Mock(status_code=500), Mock(status_code=200, json=lambda: {"capabilities": []})]
        assert tools["strale_search"](StraleSearchInput(query="fixture")) == {"capabilities": []}
        assert get.call_count == 2
        for call in get.call_args_list:
            assert "Authorization" not in call.kwargs["headers"]
            assert call.kwargs["headers"]["X-Strale-Client"].startswith("composio-strale/")
