"""Tests for langchain-strale toolkit."""

import json
import os

import pytest

from langchain_strale import StraleToolkit, StraleTool, StraleSearchTool, StraleBalanceTool

API_KEY = os.environ.get("STRALE_API_KEY", "")
BASE_URL = os.environ.get(
    "STRALE_BASE_URL", "https://strale-production.up.railway.app"
)

needs_api_key = pytest.mark.skipif(not API_KEY, reason="STRALE_API_KEY not set")


@needs_api_key
class TestToolkitInit:
    def setup_method(self):
        self.toolkit = StraleToolkit(api_key=API_KEY, base_url=BASE_URL)

    def test_get_tools_returns_list(self):
        tools = self.toolkit.get_tools()
        assert isinstance(tools, list)
        assert len(tools) > 200  # 233 capabilities + 2 meta-tools

    def test_tools_include_meta_tools(self):
        tools = self.toolkit.get_tools()
        names = [t.name for t in tools]
        assert "strale_search" in names
        assert "strale_balance" in names

    def test_each_tool_has_price_in_description(self):
        tools = self.toolkit.get_tools()
        for tool in tools:
            if isinstance(tool, StraleTool):
                assert "\u20ac" in tool.description, f"{tool.name} missing price"

    def test_category_filter(self):
        all_tools = self.toolkit.get_tools()
        filtered = self.toolkit.get_tools(categories=["validation"])
        # Filtered should be a strict subset (plus meta-tools)
        cap_tools = [t for t in filtered if isinstance(t, StraleTool)]
        all_cap_tools = [t for t in all_tools if isinstance(t, StraleTool)]
        assert len(cap_tools) < len(all_cap_tools)

    def test_tools_have_args_schema(self):
        tools = self.toolkit.get_tools()
        for tool in tools:
            assert tool.args_schema is not None


@needs_api_key
class TestToolExecution:
    def setup_method(self):
        self.toolkit = StraleToolkit(api_key=API_KEY, base_url=BASE_URL)

    def test_vat_format_validate(self):
        """End-to-end: call a cheap capability."""
        tools = self.toolkit.get_tools()
        tool = next(t for t in tools if t.name == "vat-format-validate")
        result_str = tool.invoke({"vat_number": "SE556703748501"})
        result = json.loads(result_str)
        assert result.get("status") == "completed" or "output" in result

    def test_search_tool(self):
        tools = self.toolkit.get_tools()
        search = next(t for t in tools if t.name == "strale_search")
        result_str = search.invoke({"query": "vat"})
        results = json.loads(result_str)
        assert isinstance(results, list)
        assert len(results) > 0
        assert any("vat" in r["slug"] for r in results)

    def test_balance_tool(self):
        tools = self.toolkit.get_tools()
        balance = next(t for t in tools if t.name == "strale_balance")
        result_str = balance.invoke({})
        result = json.loads(result_str)
        assert "balance_cents" in result


@needs_api_key
class TestErrorHandling:
    def test_bad_api_key(self):
        toolkit = StraleToolkit(api_key="sk_live_invalid", base_url=BASE_URL)
        tools = toolkit.get_tools()
        tool = next(t for t in tools if t.name == "vat-format-validate")
        result_str = tool.invoke({"vat_number": "SE556703748501"})
        # Should contain error info (handled by handle_tool_error=True)
        assert "unauthorized" in result_str.lower() or "error" in result_str.lower()
