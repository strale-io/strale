"""Strale Python SDK client."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Union

import httpx

from .errors import StraleError, create_error
from .types import (
    BalanceResponse,
    Capability,
    DoRequest,
    DoResponse,
    DryRunResponse,
    Provenance,
    Transaction,
    TransactionDetail,
)

DEFAULT_BASE_URL = "https://strale-production.up.railway.app"
DEFAULT_TIMEOUT = 60.0
DEFAULT_POLL_INTERVAL = 2.0
DEFAULT_MAX_POLL_WAIT = 120.0


class Strale:
    """Strale API client.

    Args:
        api_key: API key (starts with sk_).
        base_url: Base URL of the Strale API.
        default_max_price_cents: Default max_price_cents for do() calls.
        timeout: HTTP request timeout in seconds. Defaults to 60.
        poll_interval: Poll interval in seconds for async responses. Defaults to 2.
        max_poll_wait: Max wait in seconds for async polling. Defaults to 120.
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        default_max_price_cents: Optional[int] = None,
        timeout: float = DEFAULT_TIMEOUT,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        max_poll_wait: float = DEFAULT_MAX_POLL_WAIT,
    ):
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._default_max_price_cents = default_max_price_cents
        self._timeout = timeout
        self._poll_interval = poll_interval
        self._max_poll_wait = max_poll_wait
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=self._timeout,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> "Strale":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    # ─── Core: execute a capability ────────────────────────────────────────────

    def do(self, request: DoRequest) -> Union[DoResponse, DryRunResponse]:
        """Execute a capability.

        If the server returns status "executing" (async), auto-polls until
        completed or failed.
        """
        body: Dict[str, Any] = {
            "max_price_cents": request.max_price_cents
            or self._default_max_price_cents,
        }

        if request.task is not None:
            body["task"] = request.task
        if request.capability_slug is not None:
            body["capability_slug"] = request.capability_slug
        if request.inputs is not None:
            body["inputs"] = request.inputs
        if request.timeout_seconds is not None:
            body["timeout_seconds"] = request.timeout_seconds
        if request.dry_run:
            body["dry_run"] = True

        headers: Dict[str, str] = {}
        if request.idempotency_key:
            headers["Idempotency-Key"] = request.idempotency_key

        data = self._request("POST", "/v1/do", json=body, extra_headers=headers)

        # Dry run returns immediately
        if data.get("dry_run"):
            return DryRunResponse(
                dry_run=True,
                would_execute=data["would_execute"],
                price_cents=data["price_cents"],
                wallet_balance_cents=data["wallet_balance_cents"],
                wallet_sufficient=data["wallet_sufficient"],
            )

        response = self._parse_do_response(data)

        # If async (status: "executing"), auto-poll until terminal state
        if response.status == "executing":
            return self._poll_transaction(response)

        return response

    # ─── Capabilities ──────────────────────────────────────────────────────────

    def capabilities(self) -> List[Capability]:
        """List all available capabilities."""
        data = self._request("GET", "/v1/capabilities")
        return [self._parse_capability(c) for c in data["capabilities"]]

    def capability(self, slug: str) -> Capability:
        """Get details for a specific capability."""
        data = self._request("GET", f"/v1/capabilities/{slug}")
        return self._parse_capability(data)

    # ─── Wallet ────────────────────────────────────────────────────────────────

    def balance(self) -> BalanceResponse:
        """Get current wallet balance."""
        data = self._request("GET", "/v1/wallet/balance")
        return BalanceResponse(
            balance_cents=data["balance_cents"],
            currency=data["currency"],
        )

    # ─── Transactions ──────────────────────────────────────────────────────────

    def transactions(self) -> List[Transaction]:
        """List recent transactions."""
        data = self._request("GET", "/v1/transactions")
        return [
            Transaction(
                id=t["id"],
                status=t["status"],
                capability_slug=t["capability_slug"],
                price_cents=t["price_cents"],
                latency_ms=t["latency_ms"],
                created_at=t["created_at"],
                completed_at=t.get("completed_at"),
            )
            for t in data["transactions"]
        ]

    def transaction(self, id: str) -> TransactionDetail:
        """Get details for a specific transaction."""
        data = self._request("GET", f"/v1/transactions/{id}")
        prov = data.get("provenance")
        return TransactionDetail(
            id=data["id"],
            status=data["status"],
            capability_slug=data["capability_slug"],
            input=data.get("input", {}),
            output=data.get("output"),
            error=data.get("error"),
            price_cents=data["price_cents"],
            latency_ms=data["latency_ms"],
            provenance=Provenance(
                source=prov["source"], fetched_at=prov["fetched_at"]
            )
            if prov
            else None,
            created_at=data["created_at"],
            completed_at=data.get("completed_at"),
        )

    # ─── Auto-poll for async responses ─────────────────────────────────────────

    def _poll_transaction(self, initial: DoResponse) -> DoResponse:
        deadline = time.monotonic() + self._max_poll_wait
        last_status = initial.status

        while time.monotonic() < deadline:
            time.sleep(self._poll_interval)

            detail = self.transaction(initial.transaction_id)

            if detail.status == "completed":
                return DoResponse(
                    transaction_id=detail.id,
                    status="completed",
                    capability_used=detail.capability_slug,
                    price_cents=detail.price_cents,
                    latency_ms=detail.latency_ms,
                    wallet_balance_cents=initial.wallet_balance_cents,
                    output=detail.output or {},
                    provenance=detail.provenance
                    or Provenance(source="unknown", fetched_at=""),
                )

            if detail.status == "failed":
                raise StraleError(
                    "execution_failed",
                    detail.error or "Capability execution failed",
                    500,
                    {"transaction_id": detail.id},
                )

            last_status = detail.status

        raise StraleError(
            "timeout_exceeded",
            f"Timed out waiting for transaction {initial.transaction_id} "
            f"(last status: {last_status})",
            408,
            {"transaction_id": initial.transaction_id},
        )

    # ─── HTTP layer ────────────────────────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        try:
            response = self._client.request(
                method,
                path,
                json=json,
                headers=extra_headers,
            )
        except httpx.TimeoutException:
            raise StraleError(
                "timeout_exceeded",
                f"Request timed out after {self._timeout}s",
                408,
            )
        except httpx.HTTPError as e:
            raise StraleError(
                "execution_failed",
                f"Network error: {e}",
                0,
            )

        try:
            data = response.json()
        except Exception:
            raise StraleError(
                "execution_failed",
                f"Invalid JSON response (HTTP {response.status_code})",
                response.status_code,
            )

        if not response.is_success:
            if isinstance(data, dict) and "error_code" in data:
                raise create_error(
                    data["error_code"],
                    data.get("message", "Unknown error"),
                    response.status_code,
                    data.get("details"),
                )
            raise StraleError(
                "execution_failed",
                f"HTTP {response.status_code}: {data}",
                response.status_code,
            )

        return data

    # ─── Parsers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_do_response(data: Dict[str, Any]) -> DoResponse:
        prov = data.get("provenance")
        return DoResponse(
            transaction_id=data["transaction_id"],
            status=data["status"],
            capability_used=data.get("capability_used", ""),
            price_cents=data.get("price_cents", 0),
            latency_ms=data.get("latency_ms", 0),
            wallet_balance_cents=data.get("wallet_balance_cents", 0),
            output=data.get("output", {}),
            provenance=Provenance(
                source=prov["source"], fetched_at=prov["fetched_at"]
            )
            if prov
            else Provenance(source="unknown", fetched_at=""),
        )

    @staticmethod
    def _parse_capability(data: Dict[str, Any]) -> Capability:
        return Capability(
            slug=data["slug"],
            name=data["name"],
            description=data["description"],
            category=data["category"],
            price_cents=data["price_cents"],
            input_schema=data.get("input_schema"),
            output_schema=data.get("output_schema"),
            avg_latency_ms=data.get("avg_latency_ms", 0),
            success_rate=data.get("success_rate", 0.0),
        )
