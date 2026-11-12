"""strale_search against the response shapes the API actually serves.

The typeahead body below is the shape GET /v1/suggest/typeahead returned in
production on 2026-11-12 (trimmed): matches under "results", each with a
"type". composio-strale 0.1.5 and earlier read "suggestions" or
"capabilities", so every search answered with an empty list.
"""
from unittest.mock import Mock, patch

from composio_strale import StraleToolkit
from composio_strale.toolkit import StraleSearchInput

TYPEAHEAD = {
    "results": [
        {"type": "capability", "slug": "iban-validate", "name": "IBAN Validation",
         "description": "Check an IBAN's format, length and checksum.", "category": "validation",
         "price_cents": None, "geography": "global", "is_free_tier": True},
        {"type": "capability", "slug": "iban-to-bank", "name": "IBAN to Bank",
         "description": "Identify the bank behind an IBAN.", "category": "data-extraction",
         "price_cents": None, "geography": "global"},
        {"type": "solution", "slug": "payment-validate", "name": "B2B Payment Validation",
         "description": "Verify bank details and tax IDs.", "category": "finance-banking",
         "price_cents": 25, "geography": "eu", "step_count": 2},
    ]
}

CATALOGUE = {
    "capabilities": [
        {"slug": "irish-company-data", "name": "Irish Company Data", "description": "CRO lookup.", "category": "company-data", "price_cents": 10},
        {"slug": "iban-validate", "name": "IBAN Validation", "description": "Check an IBAN.", "category": "validation", "price_cents": 0},
        {"slug": "vat-validate", "name": "VAT Validation", "description": "Check an EU VAT number.", "category": "compliance", "price_cents": 2},
    ]
}


def _search_tool():
    tools = {}

    class Registry:
        def custom_tool(self, **kwargs):
            def register(fn):
                tools[fn.__name__] = fn
                return fn
            return register

    StraleToolkit(api_key="").register(Mock(tools=Registry()))
    return tools["strale_search"]


def test_typeahead_results_are_returned_and_solutions_left_out():
    search = _search_tool()
    with patch("composio_strale.toolkit.httpx.get") as get:
        get.return_value = Mock(status_code=200, json=lambda: TYPEAHEAD)
        out = search(StraleSearchInput(query="iban"))
    assert [c["slug"] for c in out["capabilities"]] == ["iban-validate", "iban-to-bank"]
    assert out["capabilities"][0] == {
        "slug": "iban-validate", "name": "IBAN Validation",
        "description": "Check an IBAN's format, length and checksum.",
        "price_cents": None, "category": "validation",
    }
    assert get.call_args.kwargs["params"] == {"q": "iban", "limit": "10", "type": "capability"}


def test_category_is_applied_to_typeahead_results():
    search = _search_tool()
    with patch("composio_strale.toolkit.httpx.get") as get:
        get.return_value = Mock(status_code=200, json=lambda: TYPEAHEAD)
        out = search(StraleSearchInput(query="iban", category="validation"))
    assert [c["slug"] for c in out["capabilities"]] == ["iban-validate"]


def test_fallback_matches_the_query_instead_of_returning_the_catalogue_head():
    search = _search_tool()
    with patch("composio_strale.toolkit.httpx.get") as get:
        get.side_effect = [Mock(status_code=503), Mock(status_code=200, json=lambda: CATALOGUE)]
        out = search(StraleSearchInput(query="IBAN"))
    assert [c["slug"] for c in out["capabilities"]] == ["iban-validate"]
    assert "params" not in get.call_args_list[1].kwargs


def test_fallback_failure_is_reported():
    search = _search_tool()
    with patch("composio_strale.toolkit.httpx.get") as get:
        get.side_effect = [Mock(status_code=503), Mock(status_code=502)]
        assert search(StraleSearchInput(query="iban")) == {"error": "Search failed: HTTP 502"}
