from importlib.metadata import version
from unittest.mock import patch, Mock
from langchain_strale.client import StraleClient

def test_client_header_on_session_and_public_catalog():
    client = StraleClient(api_key="fixture")
    expected = "langchain-strale/" + version("langchain-strale")
    assert client._session.headers["X-Strale-Client"] == expected
    assert client._session.headers["User-Agent"] == "langchain-strale/0.1.0"
    with patch("langchain_strale.client.requests.get", return_value=Mock(json=lambda: {"capabilities": []})) as get:
        client.list_capabilities()
        assert get.call_args.kwargs["headers"]["X-Strale-Client"] == expected


def test_missing_distribution_metadata_does_not_break_client():
    from importlib.metadata import PackageNotFoundError
    with patch("langchain_strale.client.version", side_effect=PackageNotFoundError):
        client = StraleClient(api_key="fixture")
        assert client._session.headers["X-Strale-Client"] == "langchain-strale/unknown"
