"""Register Strale capabilities as Composio custom tools."""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field


_BASE_URL = "https://api.strale.io"


class StraleSearchInput(BaseModel):
    query: str = Field(..., description="Search keyword (e.g., 'sanctions', 'IBAN', 'company data')")
    category: Optional[str] = Field(
        None,
        description="Filter by category: compliance, validation, web3, company-data, finance, developer-tools",
    )


class StraleExecuteInput(BaseModel):
    capability_slug: str = Field(
        ...,
        description="Capability slug from strale_search results (e.g., 'sanctions-check', 'iban-validate')",
    )
    inputs: dict = Field(
        ...,
        description="Input parameters matching the capability's required fields",
    )
    max_price_cents: int = Field(
        200,
        description="Maximum price in EUR cents. Default: 200 (€2.00). Execution fails if capability costs more.",
    )


class StraleBalanceInput(BaseModel):
    pass


class StraleToolkit:
    """Registers Strale tools with a Composio instance.

    Usage::

        from composio import Composio
        from composio_strale import StraleToolkit

        composio = Composio()
        toolkit = StraleToolkit(api_key="sk_live_...")
        toolkit.register(composio)

        # Now use composio.tools.get() or composio.tools.execute() with Strale tools
        result = composio.tools.execute(
            user_id="default",
            slug="STRALE_EXECUTE",
            arguments={
                "capability_slug": "iban-validate",
                "inputs": {"iban": "DE89370400440532013000"},
            },
        )
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = _BASE_URL,
    ):
        self.api_key = api_key or os.environ.get("STRALE_API_KEY", "")
        self.base_url = base_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def register(self, composio: Any) -> None:
        """Register all Strale tools with the given Composio instance."""
        toolkit = self  # capture for closures

        @composio.tools.custom_tool(toolkit="strale")
        def strale_search(request: StraleSearchInput) -> dict:
            """Search Strale's 270+ API capabilities. Returns matching capabilities with slugs, descriptions, and pricing. Use this first to discover available capabilities, then use strale_execute to run one."""
            params = {"q": request.query, "limit": "10"}
            if request.category:
                params["category"] = request.category
            resp = httpx.get(
                f"{toolkit.base_url}/v1/suggest/typeahead",
                params=params,
                headers=toolkit._headers(),
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "capabilities": [
                        {
                            "slug": c.get("slug"),
                            "name": c.get("name"),
                            "description": c.get("description", "")[:120],
                            "price_cents": c.get("price_cents"),
                            "category": c.get("category"),
                        }
                        for c in data.get("suggestions", data.get("capabilities", []))
                    ]
                }
            # Fallback to keyword search
            resp2 = httpx.get(
                f"{toolkit.base_url}/v1/capabilities",
                params={"search": request.query},
                headers={"Accept": "application/json"},
                timeout=10,
            )
            if resp2.status_code != 200:
                return {"error": f"Search failed: HTTP {resp2.status_code}"}
            caps = resp2.json().get("capabilities", [])
            return {
                "capabilities": [
                    {
                        "slug": c["slug"],
                        "name": c["name"],
                        "description": c.get("description", "")[:120],
                        "price_cents": c.get("price_cents"),
                    }
                    for c in caps[:10]
                ]
            }

        @composio.tools.custom_tool(toolkit="strale")
        def strale_execute(request: StraleExecuteInput) -> dict:
            """Execute a Strale capability. Pass the slug from strale_search and the required inputs. Returns structured output with quality score, latency, and data provenance."""
            if not toolkit.api_key:
                return {"error": "STRALE_API_KEY required. Get one at https://strale.dev/signup (€2 free credits)."}
            resp = httpx.post(
                f"{toolkit.base_url}/v1/do",
                json={
                    "capability_slug": request.capability_slug,
                    "inputs": request.inputs,
                    "max_price_cents": request.max_price_cents,
                },
                headers=toolkit._headers(),
                timeout=30,
            )
            data = resp.json()
            # Unwrap nested { result, meta } response shape
            if "result" in data and isinstance(data["result"], dict):
                flat = {**data["result"], "meta": data.get("meta", {})}
                data = flat
            return data

        @composio.tools.custom_tool(toolkit="strale")
        def strale_balance(request: StraleBalanceInput) -> dict:
            """Check your Strale wallet balance in EUR cents."""
            if not toolkit.api_key:
                return {"error": "STRALE_API_KEY required."}
            resp = httpx.get(
                f"{toolkit.base_url}/v1/wallet/balance",
                headers=toolkit._headers(),
                timeout=10,
            )
            return resp.json()


def register_strale_tools(
    composio: Any,
    api_key: str | None = None,
    base_url: str = _BASE_URL,
) -> StraleToolkit:
    """Convenience function: create a StraleToolkit and register it.

    Usage::

        from composio import Composio
        from composio_strale import register_strale_tools

        composio = Composio()
        register_strale_tools(composio, api_key="sk_live_...")
    """
    toolkit = StraleToolkit(api_key=api_key, base_url=base_url)
    toolkit.register(composio)
    return toolkit
