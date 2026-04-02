"""Strale client for Pydantic AI agents.

Usage with Pydantic AI::

    from pydantic_ai import Agent
    from pydantic_ai_strale import StraleClient

    strale = StraleClient(api_key="sk_live_...")
    agent = Agent("openai:gpt-4o")

    @agent.tool_plain
    def validate_iban(iban: str) -> dict:
        \"\"\"Validate an IBAN number and return bank details.\"\"\"
        return strale.run("iban-validate", {"iban": iban})

    @agent.tool_plain
    def check_sanctions(name: str, country: str = "") -> dict:
        \"\"\"Screen a name against global sanctions lists (OFAC, EU, UN).\"\"\"
        inputs = {"name": name}
        if country:
            inputs["country"] = country
        return strale.run("sanctions-check", inputs)
"""

from __future__ import annotations

import time
from typing import Any

import requests

DEFAULT_BASE_URL = "https://api.strale.io"
_POLL_INTERVAL = 1.0
_POLL_TIMEOUT = 30.0


class StraleClient:
    """Strale REST API client for Pydantic AI integrations.

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
                "User-Agent": "pydantic-ai-strale/0.1.0",
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
            capability: Capability slug (e.g. "iban-validate", "sanctions-check").
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

        # Unwrap nested { result, meta } response shape
        if "result" in data and isinstance(data["result"], dict):
            flat = {**data["result"], "meta": data.get("meta", {})}
            if "free_tier" in data: flat["free_tier"] = data["free_tier"]
            if "usage" in data: flat["usage"] = data["usage"]
            if "upgrade" in data: flat["upgrade"] = data["upgrade"]
            data = flat

        # Handle async execution — poll until complete
        if data.get("status") == "executing" and data.get("transaction_id"):
            return self._poll(data["transaction_id"])

        return data

    def list_capabilities(self, category: str | None = None) -> list[dict[str, Any]]:
        """Fetch available capabilities from the Strale catalog.

        Args:
            category: Optional category filter (e.g. "compliance", "company-data").

        Returns:
            List of capability dicts with slug, name, description, price_cents, etc.
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
            if status == "completed":
                return data
            if status == "failed":
                return data
        return {"error_code": "timeout", "message": "Async execution timed out"}
