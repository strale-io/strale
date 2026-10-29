"""LangChain tool wrappers for Strale capabilities."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Literal, Optional, Type
from urllib.parse import quote

import requests
from langchain_core.tools import BaseTool, ToolException
from pydantic import BaseModel, ConfigDict, Field, create_model

from .client import DEFAULT_MAX_PRICE_CENTS, MAX_PRICE_CAP_CENTS, StraleClient


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

    query: str = Field(
        min_length=2,
        description="What the agent needs, in a few words, e.g. 'UK company lookup' or 'validate EU VAT number'",
    )
    limit: int = Field(default=5, ge=1, le=10, description="Maximum results. Default 5.")


class StraleExecuteInput(BaseModel):
    """Input for the strale_execute meta-tool."""

    slug: str = Field(min_length=2, description="Slug from strale_search, e.g. 'uk-company-data'")
    type: Literal["capability", "solution"] = Field(
        default="capability",
        description="'solution' for a bundled solution. Default 'capability'.",
    )
    inputs: dict[str, Any] = Field(
        description="Input fields matching the input_schema returned by strale_search"
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
            # An optional field the model left out arrives as None; sending it
            # as null fails the capability's JSON Schema validation.
            inputs = {k: v for k, v in kwargs.items() if v is not None}

        payload: dict[str, Any] = {
            "capability_slug": self.capability_slug,
            "max_price_cents": self.price_cents,
        }
        if task:
            payload["task"] = task
        if inputs:
            payload["inputs"] = inputs
        try:
            status, body = self.client.request("POST", "/v1/do", json_body=payload, auth=True)
        except requests.RequestException as e:
            raise ToolException(_no_answer(self.capability_slug, e))
        # A 402 x402 challenge carries no error_code, so the status decides.
        if status >= 400 or "error_code" in body:
            raise ToolException(
                json.dumps(
                    _failure(status, body, has_key=bool(self.client.api_key), slug=self.capability_slug, kind="capability"),
                    default=str,
                )
            )
        # Unwrap nested { result, meta } response shape
        if isinstance(body.get("result"), dict):
            flat = {**body["result"], "meta": body.get("meta", {})}
            if "free_tier" in body:
                flat["free_tier"] = body["free_tier"]
            body = flat
        return json.dumps(body, default=str)


def _no_answer(slug: str, err: Exception) -> str:
    # After a timeout the call may already have run and been charged, so this
    # must not read as a refusal the model would simply retry.
    return (
        f"{slug} did not return: {err}. The call may still have run and been charged. "
        "Do not retry a paid tool automatically; tell the user, who can check "
        "GET /v1/transactions with their API key."
    )


# ---------------------------------------------------------------------------
# Meta-tools: search the catalogue, then run any tool by slug
# ---------------------------------------------------------------------------
#
# The same two-tool pattern as the Strale MCP server and ai-sdk-strale: the
# model sees two small tools instead of hundreds of per-capability schemas.

_SEARCH_DESCRIPTION = (
    "Search Strale's library of pay-per-call tools for AI agents: company registry lookups, VAT and IBAN checks, "
    "sanctions and PEP screening, web page reading, finance and developer utilities. Returns matching tools and "
    "bundled solutions with slug, description, price in EUR cents and the input schema to pass to strale_execute. "
    "No API key needed to search."
)

_EXECUTE_DESCRIPTION = (
    "Run one Strale tool or solution by slug and return its output. Call strale_search first to get the slug and "
    "the input fields. Paid tools are charged per call; some tools are free without a key. Check `ok` in the result."
)


def _failure(
    status: int,
    body: dict[str, Any],
    *,
    has_key: bool,
    slug: str | None = None,
    kind: str | None = None,
) -> dict[str, Any]:
    details = body.get("details") if isinstance(body.get("details"), dict) else None
    out: dict[str, Any] = {
        "ok": False,
        "status": status,
        "error_code": body.get("error_code") or ("payment_required" if status == 402 else "error"),
        "message": body.get("message") or body.get("error") or f"HTTP {status}",
    }
    if details and details.get("fix"):
        out["fix"] = details["fix"]
    # Only an unauthenticated caller needs telling how to pay; a key holder's
    # 402 is a budget or balance answer, already explained by the server.
    if status in (401, 402) and not has_key:
        out["how_to_pay"] = (
            "Create the toolkit with an api_key (or set STRALE_API_KEY). Free tools need no key. "
            "Paid tools are also sold per call over x402 (USDC on Base)"
            + (f" at /x402/{'solutions/' if kind == 'solution' else ''}{slug}" if slug else "")
            + "."
        )
    return out


def _search(client: StraleClient, query: str, limit: int) -> dict[str, Any]:
    status, body = client.request("GET", "/v1/suggest/typeahead", params={"q": query, "limit": limit})
    if status >= 400:
        return _failure(status, body, has_key=bool(client.api_key))
    hits = body.get("results") if isinstance(body.get("results"), list) else []
    # The typeahead carries no input schema; the detail endpoints do. A failed
    # detail fetch is reported on the hit, never dropped silently. Lookups run
    # in parallel so a slow API costs one timeout, not one per hit.
    hits = hits[:limit]
    with ThreadPoolExecutor(max_workers=max(len(hits), 1)) as pool:
        results = list(pool.map(lambda hit: _describe_hit(client, hit), hits))
    total = body.get("total") if isinstance(body.get("total"), int) else len(results)
    return {"ok": True, "query": query, "total": total, "results": results}


def _describe_hit(client: StraleClient, hit: dict[str, Any]) -> dict[str, Any]:
    kind = hit.get("type", "capability")
    slug = str(hit.get("slug", ""))
    path = f"/v1/{'solutions' if kind == 'solution' else 'capabilities'}/{quote(slug, safe='')}"
    input_schema = None
    price = hit.get("price_cents")
    free_tier = hit.get("is_free_tier") is True
    detail_error = None
    try:
        d_status, detail = client.request("GET", path)
        if d_status < 400:
            input_schema = detail.get("input_schema")
            if isinstance(detail.get("price_cents"), int):
                price = detail["price_cents"]
            free_tier = free_tier or detail.get("is_free_tier") is True
        else:
            detail_error = f"detail lookup returned HTTP {d_status}"
    except requests.RequestException as e:
        detail_error = f"detail lookup failed: {e}"
    result: dict[str, Any] = {
        "type": kind,
        "slug": slug,
        "name": hit.get("name"),
        "description": hit.get("description"),
        "category": hit.get("category"),
        "geography": hit.get("geography") or "global",
        "price_cents": price,
        "input_schema": input_schema,
    }
    if free_tier:
        result["is_free_tier"] = True
    if hit.get("step_count"):
        result["step_count"] = hit["step_count"]
    if detail_error:
        result["input_schema_error"] = detail_error
    return result


def _execute(
    client: StraleClient, slug: str, kind: str, inputs: dict[str, Any], max_price_cents: int
) -> dict[str, Any]:
    if kind == "solution":
        path = f"/v1/solutions/{quote(slug, safe='')}/execute"
        payload: dict[str, Any] = {"inputs": inputs, "max_price_cents": max_price_cents}
    else:
        path = "/v1/do"
        payload = {"capability_slug": slug, "inputs": inputs, "max_price_cents": max_price_cents}
    status, body = client.request("POST", path, json_body=payload, auth=True)
    rail = "api_key" if client.api_key else "free"
    r = body["result"] if isinstance(body.get("result"), dict) else body
    if status == 202:
        return {
            "ok": True,
            "rail": rail,
            "slug": slug,
            "status": "executing",
            "transaction_id": r.get("transaction_id"),
            "note": "Runs asynchronously. Fetch the result from GET /v1/transactions/{transaction_id} with the same API key.",
        }
    if status >= 400:
        return _failure(status, body, has_key=bool(client.api_key), slug=slug, kind=kind)
    # A solution answers 200 even when every step failed or a precondition
    # stopped it; neither is a success the model should build on.
    failed = r.get("status") == "failed" or bool(r.get("gated"))
    out: dict[str, Any] = {
        "ok": not failed,
        "rail": rail,
        "slug": slug,
        "output": r.get("output") if r.get("output") is not None else r.get("steps"),
        "price_cents": r.get("price_cents"),
        "latency_ms": r.get("latency_ms"),
        "provenance": r.get("provenance"),
        "transaction_id": r.get("transaction_id"),
    }
    for key in ("status", "errors", "gated", "details"):
        if r.get(key):
            out[key] = r[key]
    if isinstance(r.get("wallet_balance_cents"), int):
        out["wallet_balance_cents"] = r["wallet_balance_cents"]
    return out


class StraleSearchTool(BaseTool):
    """Search the Strale catalogue (tools and bundled solutions) with input schemas."""

    name: str = "strale_search"
    description: str = _SEARCH_DESCRIPTION
    args_schema: Type[BaseModel] = StraleSearchInput
    handle_tool_error: bool = True

    client: Any = Field(default=None, exclude=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def _run(self, query: str, limit: int = 5) -> str:
        try:
            return json.dumps(_search(self.client, query, limit), default=str)
        except requests.RequestException as e:
            raise ToolException(f"strale_search failed: {e}")


class StraleExecuteTool(BaseTool):
    """Run any Strale tool or solution by slug.

    With an API key the wallet is debited, capped by ``max_price_cents`` per
    call. Without one, only the free tools run.
    """

    name: str = "strale_execute"
    description: str = _EXECUTE_DESCRIPTION
    args_schema: Type[BaseModel] = StraleExecuteInput
    handle_tool_error: bool = True

    client: Any = Field(default=None, exclude=True)
    max_price_cents: int = Field(default=DEFAULT_MAX_PRICE_CENTS, ge=1, le=MAX_PRICE_CAP_CENTS)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def _run(self, slug: str, inputs: dict[str, Any], type: str = "capability") -> str:
        try:
            return json.dumps(_execute(self.client, slug, type, inputs, self.max_price_cents), default=str)
        except requests.RequestException as e:
            raise ToolException(_no_answer(f"strale_execute {slug}", e))


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
