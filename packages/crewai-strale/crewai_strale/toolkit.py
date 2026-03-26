"""CrewAI integration for Strale — 250+ business capabilities as agent tools."""

from __future__ import annotations

import json
import time
from typing import Any, Optional, Type

from crewai.tools import BaseTool
from pydantic import BaseModel, Field, create_model

from .client import DEFAULT_BASE_URL, StraleClient

_CACHE_TTL = 300  # 5 minutes


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------

class StraleGenericInput(BaseModel):
    """Fallback input for capabilities without a specific JSON Schema."""

    task: str = Field(description="Describe what you want this capability to do")
    inputs: Optional[dict[str, Any]] = Field(
        default=None, description="Optional structured input data"
    )


class StraleSearchInput(BaseModel):
    """Input for the strale_search meta-tool."""

    query: str = Field(description="Keyword or phrase to search for")
    category: Optional[str] = Field(
        default=None, description="Filter by category slug"
    )
    offset: Optional[int] = Field(
        default=0, description="Number of results to skip (for pagination). Default: 0"
    )


class _EmptyInput(BaseModel):
    """No parameters required."""


# ---------------------------------------------------------------------------
# Schema builder
# ---------------------------------------------------------------------------

_JSON_TYPE_MAP: dict[str, type] = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "array": list,
    "object": dict,
}


def _build_args_schema(
    slug: str, input_schema: dict[str, Any] | None
) -> tuple[Type[BaseModel], bool]:
    """Convert a JSON Schema into a Pydantic model.

    Returns ``(model_class, uses_generic)`` where *uses_generic* is True when
    the capability had no usable schema and the generic model is returned.
    """
    if not input_schema or not isinstance(input_schema, dict):
        return StraleGenericInput, True

    properties = input_schema.get("properties", {})
    if not properties:
        return StraleGenericInput, True

    required = set(input_schema.get("required", []))
    fields: dict[str, Any] = {}

    for name, prop in properties.items():
        py_type = _JSON_TYPE_MAP.get(prop.get("type", "string"), Any)
        desc = prop.get("description", "")
        if name in required:
            fields[name] = (py_type, Field(description=desc))
        else:
            fields[name] = (
                Optional[py_type],
                Field(default=prop.get("default"), description=desc),
            )

    model_name = (
        "".join(w.capitalize() for w in slug.replace("-", "_").split("_")) + "Input"
    )
    return create_model(model_name, **fields), False


# ---------------------------------------------------------------------------
# Tool classes
# ---------------------------------------------------------------------------

class StraleTool(BaseTool):
    """Executes a single Strale capability via the Strale API."""

    name: str
    description: str
    args_schema: Type[BaseModel] = StraleGenericInput

    capability_slug: str = ""
    price_cents: int = 0
    uses_generic_schema: bool = False
    client: Any = Field(default=None, exclude=True)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, **kwargs: Any) -> str:
        if self.uses_generic_schema:
            task = kwargs.get("task", "")
            inputs = kwargs.get("inputs") or {}
        else:
            task = None
            inputs = kwargs

        try:
            result = self.client.execute(
                capability_slug=self.capability_slug,
                task=task,
                inputs=inputs,
                max_price_cents=self.price_cents,
            )
            if "error_code" in result:
                return f"Error: [{result['error_code']}] {result.get('message', 'Unknown error')}"
            return json.dumps(result, default=str)
        except Exception as e:
            return f"Error executing {self.capability_slug}: {e}"


class StraleSearchTool(BaseTool):
    """Search Strale's capability catalog to discover available tools."""

    name: str = "strale_search"
    description: str = (
        "Search the Strale capability catalog. "
        "Returns matching capabilities with names, descriptions, and prices."
    )
    args_schema: Type[BaseModel] = StraleSearchInput

    capabilities: list[Any] = Field(default_factory=list, exclude=True)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str, category: str | None = None, offset: int = 0) -> str:
        q = query.lower()
        matches = []
        for cap in self.capabilities:
            if category and cap.get("category") != category:
                continue
            text = f"{cap['slug']} {cap['name']} {cap['description']} {cap.get('category', '')}".lower()
            if q in text:
                matches.append(
                    {
                        "slug": cap["slug"],
                        "name": cap["name"],
                        "description": cap["description"],
                        "category": cap.get("category"),
                        "price_cents": cap["price_cents"],
                    }
                )
        page = matches[offset : offset + 20]
        return json.dumps(
            {
                "total_matches": len(matches),
                "offset": offset,
                "has_more": offset + len(page) < len(matches),
                "results": page,
            },
            default=str,
        )


class StraleBalanceTool(BaseTool):
    """Check your Strale wallet balance."""

    name: str = "strale_balance"
    description: str = "Check your Strale wallet balance. Returns balance in EUR cents."
    args_schema: Type[BaseModel] = _EmptyInput

    client: Any = Field(default=None, exclude=True)

    class Config:
        arbitrary_types_allowed = True

    def _run(self, **kwargs: Any) -> str:
        try:
            result = self.client.get_balance()
            return json.dumps(result)
        except Exception as e:
            return f"Error checking balance: {e}"


# ---------------------------------------------------------------------------
# Toolkit
# ---------------------------------------------------------------------------

class StraleToolkit:
    """Provides all active Strale capabilities as CrewAI tools.

    Example::

        from crewai_strale import StraleToolkit

        toolkit = StraleToolkit(api_key="sk_live_...")
        tools = toolkit.get_tools()
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self._client = StraleClient(api_key, base_url)
        self._capabilities: list[dict[str, Any]] | None = None
        self._fetched_at: float = 0.0

    def _get_capabilities(self) -> list[dict[str, Any]]:
        now = time.time()
        if self._capabilities is None or now - self._fetched_at > _CACHE_TTL:
            self._capabilities = self._client.list_capabilities()
            self._fetched_at = now
        return self._capabilities

    def get_tools(
        self, categories: list[str] | None = None
    ) -> list[BaseTool]:
        """Return Strale capabilities as CrewAI tools.

        Args:
            categories: Optional list of category slugs to filter by.
        """
        caps = self._get_capabilities()

        if categories:
            cat_set = set(categories)
            caps = [c for c in caps if c.get("category") in cat_set]

        tools: list[BaseTool] = []

        for cap in caps:
            schema, is_generic = _build_args_schema(
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
                client=self._client,
            )
            tools.append(tool)

        # Meta-tools
        all_caps = self._get_capabilities()
        tools.append(StraleSearchTool(capabilities=all_caps))
        tools.append(StraleBalanceTool(client=self._client))

        return tools
