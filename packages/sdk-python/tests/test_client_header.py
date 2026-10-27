from importlib.metadata import version
from straleio import Strale, __version__

def test_sdk_header_and_exported_version_match_metadata():
    client = Strale(api_key="fixture")
    try:
        assert client._client.headers["X-Strale-Client"] == "straleio-python/" + version("straleio")
        assert __version__ == version("straleio")
    finally:
        client.close()


def test_missing_distribution_metadata_does_not_break_import_or_client():
    import importlib
    import straleio
    from importlib.metadata import PackageNotFoundError
    from unittest.mock import patch
    try:
        with patch("importlib.metadata.version", side_effect=PackageNotFoundError):
            reloaded = importlib.reload(straleio)
            assert reloaded.__version__ == "unknown"
        with patch("straleio.client.version", side_effect=PackageNotFoundError):
            client = reloaded.Strale(api_key="fixture")
            try:
                assert client._client.headers["X-Strale-Client"] == "straleio-python/unknown"
            finally:
                client.close()
    finally:
        importlib.reload(straleio)
