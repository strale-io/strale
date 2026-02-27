"""StraleToolkit — one import to get all 233 Strale capabilities as LangChain tools."""

from __future__ import annotations

import time
from typing import Any

from langchain_core.tools import BaseTool, BaseToolkit

from .client import DEFAULT_BASE_URL, StraleClient
from .tools import (
    StraleBalanceTool,
    StraleSearchTool,
    StraleTool,
    build_args_schema,
)

_CACHE_TTL = 300  # 5 minutes


class StraleToolkit(BaseToolkit):
    """Provides all active Strale capabilities as LangChain tools.

    Example::

        from langchain_strale import StraleToolkit

        toolkit = StraleToolkit(api_key="sk_live_...")
        tools = toolkit.get_tools()
    """

    api_key: str
    base_url: str = DEFAULT_BASE_URL

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

    def get_tools(
        self, categories: list[str] | None = None
    ) -> list[BaseTool]:
        """Return Strale capabilities as LangChain tools.

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
                description=f"{cap['description']} (Price: \u20ac{price_eur:.2f})",
                args_schema=schema,
                capability_slug=cap["slug"],
                price_cents=cap["price_cents"],
                uses_generic_schema=is_generic,
                client=client,
            )
            tools.append(tool)

        # Meta-tools
        all_caps = self._get_capabilities()
        tools.append(StraleSearchTool(capabilities=all_caps))
        tools.append(StraleBalanceTool(client=client))

        return tools
