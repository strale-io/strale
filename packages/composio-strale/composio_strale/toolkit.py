"""Register Strale capabilities as Composio custom tools."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

import os
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field


_BASE_URL = "https://api.strale.io"


def _client_version() -> str:
    try:
        return version("composio-strale")
    except PackageNotFoundError:
        return "unknown"


def _matches(items: list, category: Optional[str]) -> list[dict]:
    """Shape search hits for the agent, keep the category asked for, at most 10."""
    out = []
    for c in items:
        if not isinstance(c, dict) or not c.get("slug"):
            continue
        if c.get("type", "capability") != "capability":
            continue
        if category and c.get("category") != category:
            continue
        out.append(
            {
                "slug": c.get("slug"),
                "name": c.get("name"),
                "description": (c.get("description") or "")[:120],
                "category": c.get("category"),
            }
        )
    return out[:10]


class StraleSearchInput(BaseModel):
    query: str = Field(..., description="Search keyword (e.g., 'sanctions', 'IBAN', 'company data')")
    category: Optional[str] = Field(
        None,
        description=(
            "Exact category to filter by, e.g. data-extraction, developer-tools, validation, "
            "data-processing, company-data, compliance, web3"
        ),
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
        h: dict[str, str] = {"Content-Type": "application/json", "Accept": "application/json", "X-Strale-Client": f"composio-strale/{_client_version()}"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def register(self, composio: Any) -> None:
        """Register all Strale tools with the given Composio instance."""
        toolkit = self  # capture for closures

        @composio.tools.custom_tool(toolkit="strale")
        def strale_search(request: StraleSearchInput) -> dict:
            """Search Strale's available API capabilities. Returns matching capabilities with slugs, names, descriptions and categories. Prices are not part of search results; max_price_cents on strale_execute caps what a call can cost. Use this first to discover available capabilities, then use strale_execute to run one."""
            query = request.query.strip()
            if len(query) < 2:
                return {"error": "query must be at least 2 characters"}
            if not request.category:
                # The typeahead endpoint returns its matches under "results",
                # capped at 10. Solutions are left out: strale_execute runs
                # capabilities only.
                resp = httpx.get(
                    f"{toolkit.base_url}/v1/suggest/typeahead",
                    params={"q": query, "limit": "10", "type": "capability"},
                    headers=toolkit._headers(),
                    timeout=10,
                )
                if resp.status_code == 200:
                    hits = resp.json().get("results")
                    return {"capabilities": _matches(hits if isinstance(hits, list) else [], None)}
            # The catalogue path serves a category filter (typeahead takes none,
            # and filtering its top 10 loses most matches) and stands in when
            # typeahead fails. The catalogue ignores search terms, so the query
            # is matched here.
            resp2 = httpx.get(
                f"{toolkit.base_url}/v1/capabilities",
                headers=toolkit._headers(),
                timeout=10,
            )
            if resp2.status_code != 200:
                return {"error": f"Search failed: HTTP {resp2.status_code}"}
            terms = query.lower().split()
            caps = [
                c
                for c in resp2.json().get("capabilities", [])
                if isinstance(c, dict)
                and all(
                    t in " ".join(str(c.get(k) or "") for k in ("slug", "name", "description", "category")).lower()
                    for t in terms
                )
            ]
            return {"capabilities": _matches(caps, request.category)}

        @composio.tools.custom_tool(toolkit="strale")
        def strale_execute(request: StraleExecuteInput) -> dict:
            """Execute a Strale capability. Pass the slug from strale_search and the required inputs. Returns structured output with execution status, latency, and data provenance."""
            if not toolkit.api_key:
                return {"error": "STRALE_API_KEY required. Get one at https://strale.io/signup (trial credits where eligible)."}
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
