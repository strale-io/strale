"""Lightweight HTTP client for the Strale API."""

from __future__ import annotations

from typing import Any

import requests

DEFAULT_BASE_URL = "https://api.strale.io"


class StraleClient:
    """Thin wrapper around the Strale REST API."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "User-Agent": "langchain-strale/0.1.0",
            }
        )

    def list_capabilities(self) -> list[dict[str, Any]]:
        """Fetch all active capabilities (public, no auth required)."""
        resp = requests.get(f"{self.base_url}/v1/capabilities")
        resp.raise_for_status()
        return resp.json()["capabilities"]

    def execute(
        self,
        capability_slug: str,
        task: str | None = None,
        inputs: dict[str, Any] | None = None,
        max_price_cents: int | None = None,
    ) -> dict[str, Any]:
        """Execute a capability via POST /v1/do."""
        payload: dict[str, Any] = {"capability_slug": capability_slug}
        if task:
            payload["task"] = task
        if inputs:
            payload["inputs"] = inputs
        if max_price_cents is not None:
            payload["max_price_cents"] = max_price_cents

        resp = self._session.post(f"{self.base_url}/v1/do", json=payload)
        data = resp.json()
        # Unwrap nested { result, meta } response shape
        if "result" in data and isinstance(data["result"], dict):
            flat = {**data["result"], "meta": data.get("meta", {})}
            if "free_tier" in data: flat["free_tier"] = data["free_tier"]
            data = flat
        return data

    def get_balance(self) -> dict[str, Any]:
        """Get wallet balance via GET /v1/wallet/balance."""
        resp = self._session.get(f"{self.base_url}/v1/wallet/balance")
        resp.raise_for_status()
        return resp.json()
