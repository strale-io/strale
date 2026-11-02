"""StraleToolkit — one import to get Strale tools as LangChain tools."""

from __future__ import annotations

import time
from typing import Any, Optional

from langchain_core.tools import BaseTool, BaseToolkit
from pydantic import Field

from .client import DEFAULT_BASE_URL, DEFAULT_MAX_PRICE_CENTS, MAX_PRICE_CAP_CENTS, StraleClient
from .tools import (
    StraleBalanceTool,
    StraleExecuteTool,
    StraleSearchTool,
    StraleTool,
    build_args_schema,
)

_CACHE_TTL = 300  # 5 minutes


class StraleToolkit(BaseToolkit):
    """Provides Strale capabilities as LangChain tools.

    Example::

        from langchain_strale import StraleToolkit

        toolkit = StraleToolkit(api_key="sk_live_...")
        tools = toolkit.get_meta_tools()  # strale_search + strale_execute + strale_balance
        # or: toolkit.get_tools() for one tool per capability plus the meta-tools

    ``api_key`` defaults to the ``STRALE_API_KEY`` environment variable. Without
    a key, search and the free tools work.
    """

    api_key: Optional[str] = None
    base_url: str = DEFAULT_BASE_URL
    max_price_cents: int = Field(default=DEFAULT_MAX_PRICE_CENTS, ge=1, le=MAX_PRICE_CAP_CENTS)
    """Highest price in EUR cents strale_execute may be charged per call. Default 200 (€2.00)."""

    _client: StraleClient | None = None
    _capabilities: list[dict[str, Any]] | None = None
    _fetched_at: float = 0.0

    model_config = {"arbitrary_types_allowed": True}

    def _get_client(self) -> StraleClient:
        if self._client is None:
            self._client = StraleClient(self.api_key, self.base_url)
        return self._client

    def _get_capabilities(self) -> list[dict[str, Any]]:
        now = time.time()
        if self._capabilities is None or now - self._fetched_at > _CACHE_TTL:
            self._capabilities = self._get_client().list_capabilities()
            self._fetched_at = now
        return self._capabilities

    def get_meta_tools(self) -> list[BaseTool]:
        """Return the search, execute and balance tools without loading the catalogue."""
        client = self._get_client()
        return [
            StraleSearchTool(client=client),
            StraleExecuteTool(client=client, max_price_cents=self.max_price_cents),
            StraleBalanceTool(client=client),
        ]

    def get_tools(
        self, categories: list[str] | None = None
    ) -> list[BaseTool]:
        """Return one tool per Strale capability, plus the meta-tools.

        Args:
            categories: Optional list of category slugs to filter by
                (e.g. ``["finance", "compliance"]``).
        """
        client = self._get_client()
        caps = self._get_capabilities()

        if categories:
            cat_set = set(categories)
            caps = [c for c in caps if c.get("category") in cat_set]

        tools: list[BaseTool] = []

        for cap in caps:
            schema, is_generic = build_args_schema(
                cap["slug"], cap.get("input_schema")
            )
            price_eur = cap["price_cents"] / 100
            tool = StraleTool(
                name=cap["slug"],
                description=f"{cap['description']} (Price: €{price_eur:.2f})",
                args_schema=schema,
                capability_slug=cap["slug"],
                price_cents=cap["price_cents"],
                uses_generic_schema=is_generic,
                client=client,
            )
            tools.append(tool)

        tools.extend(self.get_meta_tools())
        return tools
