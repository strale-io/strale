from importlib.metadata import PackageNotFoundError, version
from unittest.mock import patch

import responses

from langchain_strale.client import StraleClient


@responses.activate
def test_client_header_on_session_and_public_catalog():
    responses.get("https://api.strale.io/v1/capabilities", json={"capabilities": []})
    client = StraleClient(api_key="fixture")
    expected = "langchain-strale/" + version("langchain-strale")
    assert client._session.headers["X-Strale-Client"] == expected
    assert client._session.headers["User-Agent"] == expected
    client.list_capabilities()
    assert responses.calls[0].request.headers["X-Strale-Client"] == expected
    # The public catalogue needs no key, so none is sent.
    assert "Authorization" not in responses.calls[0].request.headers


def test_missing_distribution_metadata_does_not_break_client():
    with patch("langchain_strale.client.version", side_effect=PackageNotFoundError):
        client = StraleClient(api_key="fixture")
        assert client._session.headers["X-Strale-Client"] == "langchain-strale/unknown"


def test_api_key_defaults_to_environment(monkeypatch):
    monkeypatch.setenv("STRALE_API_KEY", "sk_env_fixture")
    assert StraleClient().api_key == "sk_env_fixture"
    monkeypatch.delenv("STRALE_API_KEY")
    assert StraleClient().api_key is None
