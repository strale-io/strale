"""Basic import and structure tests for composio-strale."""

import os
import unittest


class TestImport(unittest.TestCase):
    def test_import(self):
        from composio_strale import StraleToolkit, register_strale_tools
        assert StraleToolkit is not None
        assert register_strale_tools is not None

    def test_toolkit_init(self):
        from composio_strale import StraleToolkit
        toolkit = StraleToolkit(api_key="sk_test_123")
        assert toolkit.api_key == "sk_test_123"
        assert toolkit.base_url == "https://api.strale.io"

    def test_toolkit_env_key(self):
        from composio_strale import StraleToolkit
        os.environ["STRALE_API_KEY"] = "sk_env_test"
        toolkit = StraleToolkit()
        assert toolkit.api_key == "sk_env_test"
        del os.environ["STRALE_API_KEY"]

    def test_toolkit_custom_url(self):
        from composio_strale import StraleToolkit
        toolkit = StraleToolkit(api_key="test", base_url="http://localhost:3000")
        assert toolkit.base_url == "http://localhost:3000"


if __name__ == "__main__":
    unittest.main()
