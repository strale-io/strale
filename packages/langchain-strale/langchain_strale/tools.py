"""LangChain tool wrappers for Strale capabilities."""

from __future__ import annotations

import json
from typing import Any, Optional, Type

from langchain_core.tools import BaseTool, ToolException
from pydantic import BaseModel, ConfigDict, Field, create_model

from .client import StraleClient

DEFAULT_BASE_URL = "https://api.strale.io"


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


def build_args_schema(
    slug: str, input_schema: dict[str, Any] | None
) -> tuple[Type[BaseModel], bool]:
    """Convert a JSON Schema ``input_schema`` into a Pydantic model.

    Returns ``(model_class, uses_generic)`` where *uses_generic* is True when
    the capability had no usable schema and the generic task/inputs model is
    returned instead.
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
# Capability tool
# ---------------------------------------------------------------------------

class StraleTool(BaseTool):
    """Executes a single Strale capability."""

    name: str
    description: str
    args_schema: Type[BaseModel] = StraleGenericInput
    handle_tool_error: bool = True

    capability_slug: str = ""
    price_cents: int = 0
    uses_generic_schema: bool = False
    client: Any = Field(default=None, exclude=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)

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
                raise ToolException(
                    f"[{result['error_code']}] {result.get('message', 'Unknown error')}"
                )
            return json.dumps(result, default=str)
        except ToolException:
            raise
        except Exception as e:
            raise ToolException(f"Failed to execute {self.capability_slug}: {e}")


# ---------------------------------------------------------------------------
# Meta-tools
# ---------------------------------------------------------------------------

class StraleSearchTool(BaseTool):
    """Search Strale's capability catalog."""

    name: str = "strale_search"
    description: str = (
        "Search the Strale capability catalog to discover available tools. "
        "Returns matching capabilities with names, descriptions, and prices."
    )
    args_schema: Type[BaseModel] = StraleSearchInput

    capabilities: list[Any] = Field(default_factory=list, exclude=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def _run(self, query: str, category: str | None = None) -> str:
        q = query.lower()
        results = []
        for cap in self.capabilities:
            if category and cap.get("category") != category:
                continue
            text = f"{cap['slug']} {cap['name']} {cap['description']} {cap.get('category', '')}".lower()
            if q in text:
                results.append(
                    {
                        "slug": cap["slug"],
                        "name": cap["name"],
                        "description": cap["description"],
                        "category": cap.get("category"),
                        "price_cents": cap["price_cents"],
                    }
                )
        return json.dumps(results[:20], default=str)


class StraleBalanceTool(BaseTool):
    """Check your Strale wallet balance."""

    name: str = "strale_balance"
    description: str = (
        "Check your Strale wallet balance. Returns balance in EUR cents and currency."
    )
    args_schema: Type[BaseModel] = _EmptyInput
    handle_tool_error: bool = True

    client: Any = Field(default=None, exclude=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def _run(self, **kwargs: Any) -> str:
        try:
            result = self.client.get_balance()
            return json.dumps(result)
        except Exception as e:
            raise ToolException(f"Failed to check balance: {e}")
