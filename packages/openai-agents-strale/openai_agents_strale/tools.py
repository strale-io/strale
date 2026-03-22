"""Strale tools for the OpenAI Agents SDK.

Usage with OpenAI Agents SDK::

    from agents import Agent, Runner
    from openai_agents_strale import create_strale_tools

    tools = create_strale_tools(
        api_key="sk_live_...",
        slugs=["iban-validate", "vat-format-validate", "sanctions-check"],
    )

    agent = Agent(
        name="Compliance Agent",
        instructions="You verify business data using Strale tools.",
        tools=tools,
    )

    result = Runner.run_sync(agent, "Validate IBAN DE89370400440532013000")
    print(result.final_output)
"""

from __future__ import annotations

import time
from typing import Any, Callable

import requests

DEFAULT_BASE_URL = "https://api.strale.io"
_POLL_INTERVAL = 1.0
_POLL_TIMEOUT = 30.0


class StraleClient:
    """Strale REST API client.

    Handles capability execution including async polling for long-running tasks.

    Args:
        api_key: Strale API key (sk_live_...).
        base_url: API base URL. Defaults to https://api.strale.io.
        timeout: HTTP request timeout in seconds. Defaults to 30.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: int = 30,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "User-Agent": "openai-agents-strale/0.1.0",
            }
        )

    def run(
        self,
        capability: str,
        input_data: dict[str, Any] | None = None,
        max_price_cents: int | None = None,
    ) -> dict[str, Any]:
        """Execute a Strale capability and return the result.

        Handles async execution automatically — if the capability is long-running,
        polls until completion or timeout.

        Args:
            capability: Capability slug (e.g. "iban-validate").
            input_data: Input fields for the capability.
            max_price_cents: Maximum price willing to pay (optional).

        Returns:
            The capability output dict, or an error dict with "error_code" key.
        """
        payload: dict[str, Any] = {"capability_slug": capability}
        if input_data:
            payload["inputs"] = input_data
        if max_price_cents is not None:
            payload["max_price_cents"] = max_price_cents

        resp = self._session.post(
            f"{self.base_url}/v1/do",
            json=payload,
            timeout=self.timeout,
        )
        data = resp.json()

        if data.get("status") == "executing" and data.get("transaction_id"):
            return self._poll(data["transaction_id"])

        return data

    def list_capabilities(self, category: str | None = None) -> list[dict[str, Any]]:
        """Fetch available capabilities from the Strale catalog.

        Args:
            category: Optional category filter.

        Returns:
            List of capability dicts.
        """
        resp = requests.get(
            f"{self.base_url}/v1/capabilities",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        caps = resp.json()["capabilities"]
        if category:
            caps = [c for c in caps if c.get("category") == category]
        return caps

    def get_balance(self) -> dict[str, Any]:
        """Get wallet balance."""
        resp = self._session.get(
            f"{self.base_url}/v1/wallet/balance",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def _poll(self, transaction_id: str) -> dict[str, Any]:
        """Poll for async execution result."""
        deadline = time.monotonic() + _POLL_TIMEOUT
        while time.monotonic() < deadline:
            time.sleep(_POLL_INTERVAL)
            resp = self._session.get(
                f"{self.base_url}/v1/transactions/{transaction_id}",
                timeout=self.timeout,
            )
            data = resp.json()
            status = data.get("status")
            if status in ("completed", "failed"):
                return data
        return {"error_code": "timeout", "message": "Async execution timed out"}


def create_strale_tool(
    api_key: str,
    capability_slug: str,
    description: str | None = None,
    base_url: str | None = None,
) -> Callable[..., dict[str, Any]]:
    """Create a single tool function for a Strale capability.

    The returned function has a docstring and type hints suitable for the
    OpenAI Agents SDK's function-calling schema generation.

    Args:
        api_key: Strale API key.
        capability_slug: Capability slug (e.g. "iban-validate").
        description: Custom description. If None, fetched from the API.
        base_url: API base URL override.

    Returns:
        A callable tool function.
    """
    client = StraleClient(api_key, base_url=base_url or DEFAULT_BASE_URL)

    if description is None:
        caps = client.list_capabilities()
        for cap in caps:
            if cap["slug"] == capability_slug:
                description = cap.get("description", capability_slug)
                break
        else:
            description = capability_slug

    def tool(**kwargs: Any) -> dict[str, Any]:
        return client.run(capability_slug, input_data=kwargs)

    tool.__name__ = capability_slug.replace("-", "_")
    tool.__qualname__ = tool.__name__
    tool.__doc__ = description

    return tool


def create_strale_tools(
    api_key: str,
    slugs: list[str] | None = None,
    categories: list[str] | None = None,
    base_url: str | None = None,
) -> list[Callable[..., dict[str, Any]]]:
    """Create tool functions for multiple Strale capabilities.

    Args:
        api_key: Strale API key.
        slugs: Specific capability slugs to include. If None, includes all.
        categories: Filter by category. Ignored if slugs is provided.
        base_url: API base URL override.

    Returns:
        List of callable tool functions.
    """
    client = StraleClient(api_key, base_url=base_url or DEFAULT_BASE_URL)
    caps = client.list_capabilities()

    if slugs:
        slug_set = set(slugs)
        caps = [c for c in caps if c["slug"] in slug_set]
    elif categories:
        cat_set = set(categories)
        caps = [c for c in caps if c.get("category") in cat_set]

    tools: list[Callable[..., dict[str, Any]]] = []
    for cap in caps:

        def _make_tool(slug: str, desc: str) -> Callable[..., dict[str, Any]]:
            def tool(**kwargs: Any) -> dict[str, Any]:
                return client.run(slug, input_data=kwargs)

            tool.__name__ = slug.replace("-", "_")
            tool.__qualname__ = tool.__name__
            tool.__doc__ = desc
            return tool

        tools.append(_make_tool(cap["slug"], cap.get("description", cap["slug"])))

    return tools
