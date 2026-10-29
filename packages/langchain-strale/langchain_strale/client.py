"""Lightweight HTTP client for the Strale API."""

from __future__ import annotations

import os
from importlib.metadata import PackageNotFoundError, version
from typing import Any

import requests

DEFAULT_BASE_URL = "https://api.strale.io"
DEFAULT_MAX_PRICE_CENTS = 200
# Server-side ceiling for max_price_cents on /v1/do.
MAX_PRICE_CAP_CENTS = 2000
DEFAULT_TIMEOUT = 60.0


def _client_version() -> str:
    try:
        return version("langchain-strale")
    except PackageNotFoundError:
        return "unknown"


class StraleClient:
    """Thin wrapper around the Strale REST API.

    ``api_key`` defaults to the ``STRALE_API_KEY`` environment variable. Without
    a key, searching the catalogue and the free tools still work.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key if api_key is not None else (os.environ.get("STRALE_API_KEY") or None)
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        # Attribution: every request this package makes carries X-Strale-Client
        # "langchain-strale/<version>" (distribution D0).
        self.client_id = f"langchain-strale/{_client_version()}"
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Accept": "application/json",
                "X-Strale-Client": self.client_id,
                "User-Agent": self.client_id,
            }
        )

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        params: dict[str, Any] | None = None,
        auth: bool = False,
    ) -> tuple[int, dict[str, Any]]:
        """Send one request and return ``(status, body)``. Never raises on an HTTP status."""
        resp = self._session.request(
            method,
            f"{self.base_url}{path}",
            json=json_body,
            params=params,
            headers=self._auth_headers() if auth else None,
            timeout=self.timeout,
        )
        try:
            parsed = resp.json() if resp.content else {}
        except ValueError:
            parsed = {"error_code": "non_json_response", "message": resp.text[:300]}
        body = parsed if isinstance(parsed, dict) else {"value": parsed}
        return resp.status_code, body

    def list_capabilities(self) -> list[dict[str, Any]]:
        """Fetch all active capabilities (public, no auth required)."""
        resp = self._session.get(f"{self.base_url}/v1/capabilities", timeout=self.timeout)
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

        _, data = self.request("POST", "/v1/do", json_body=payload, auth=True)
        # Unwrap nested { result, meta } response shape
        if "result" in data and isinstance(data["result"], dict):
            flat = {**data["result"], "meta": data.get("meta", {})}
            if "free_tier" in data:
                flat["free_tier"] = data["free_tier"]
            data = flat
        return data

    def get_balance(self) -> dict[str, Any]:
        """Get wallet balance via GET /v1/wallet/balance."""
        resp = self._session.get(
            f"{self.base_url}/v1/wallet/balance",
            headers=self._auth_headers(),
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()
