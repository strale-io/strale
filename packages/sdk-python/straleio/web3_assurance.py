"""
Web3 Assurance — Python helpers + FastAPI drop-in.

Python-side equivalent of the TypeScript drop-in middlewares (Hono / Express /
LangGraph / AgentKit). Provides:

- ``Web3AssuranceClient`` — a small typed client for POST /v1/web3-assurance.
- ``strale_web3_guard`` — a FastAPI dependency that gates inbound x402 payers
  or outbound on-chain actions, mirroring the Hono / Express middleware.

Both surface the same response-header conventions as the TypeScript drop-ins
(X-Strale-Verdict, X-Strale-Confidence, X-Strale-Flags, X-Strale-Audit-Url).

Ships in-process inside the Strale SDK as a reference implementation. Once
PMF lands, extracts to its own package (strale-web3-assurance-fastapi).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Literal, Optional

import httpx

DEFAULT_BASE_URL = "https://api.strale.io"

Mode = Literal["outbound", "reverse-call"]
Verdict = Literal["proceed", "review", "block", "insufficient_evidence"]


@dataclass
class Web3AssuranceResult:
    verdict: Verdict
    reason_codes: list[str]
    confidence: float
    critical_flags: list[str]
    suggested_action: str
    audit_url: str
    evidence: dict[str, Any]
    raw: dict[str, Any]


class Web3AssuranceClient:
    """Thin client for POST /v1/web3-assurance."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = 10.0,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout_s = timeout_s

    async def assess(
        self,
        target: str,
        *,
        target_type: Optional[str] = None,
        chain: Optional[str] = None,
        action: Optional[str] = None,
        amount_usd: Optional[float] = None,
        mode: Mode = "outbound",
        agent_id: Optional[str] = None,
        caller_jurisdiction: Optional[str] = None,
    ) -> Web3AssuranceResult:
        body: dict[str, Any] = {"target": target, "mode": mode}
        for key, value in {
            "target_type": target_type,
            "chain": chain,
            "action": action,
            "amount_usd": amount_usd,
            "agent_id": agent_id,
            "caller_jurisdiction": caller_jurisdiction,
        }.items():
            if value is not None:
                body[key] = value

        headers: dict[str, str] = {"Accept": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        async with httpx.AsyncClient(timeout=self._timeout_s) as client:
            response = await client.post(
                f"{self._base_url}/v1/web3-assurance",
                json=body,
                headers=headers,
            )
        response.raise_for_status()
        data = response.json()

        return Web3AssuranceResult(
            verdict=data["verdict"],
            reason_codes=data.get("reason_codes", []),
            confidence=float(data.get("confidence", 0)),
            critical_flags=data.get("critical_flags", []),
            suggested_action=data.get("suggested_action", ""),
            audit_url=data.get("audit_url", ""),
            evidence=data.get("evidence", {}),
            raw=data,
        )


def strale_web3_guard(
    *,
    mode: Literal["gate-outbound", "gate-inbound"],
    api_key: Optional[str] = None,
    base_url: str = DEFAULT_BASE_URL,
    block_on: Literal["block", "review"] = "block",
    min_confidence: float = 0.5,
    extract_target: Optional[Callable[[Any], Awaitable[Optional[str]] | Optional[str]]] = None,
):
    """FastAPI dependency that gates a request based on Web3 Assurance verdict.

    Usage::

        from fastapi import FastAPI, Depends
        from straleio.web3_assurance import strale_web3_guard

        app = FastAPI()

        guard = strale_web3_guard(mode="gate-inbound", api_key="sk_...")

        @app.post("/api/service", dependencies=[Depends(guard)])
        async def service():
            return {"ok": True}

    Sets X-Strale-Verdict / X-Strale-Confidence / X-Strale-Flags / X-Strale-Audit-Url
    response headers and raises HTTPException(403, ...) when the verdict says block.
    """
    from fastapi import HTTPException, Request, Response

    client = Web3AssuranceClient(api_key=api_key, base_url=base_url)
    request_mode: Mode = "reverse-call" if mode == "gate-inbound" else "outbound"

    async def _default_extract_inbound(request: Request) -> Optional[str]:
        sig = request.headers.get("x-payment-signature") or ""
        import re

        m = re.search(r"0x[a-fA-F0-9]{40}", sig)
        if m:
            return m.group(0)
        payer = request.headers.get("x-payment-payer") or ""
        if re.fullmatch(r"0x[a-fA-F0-9]{40}", payer):
            return payer
        return None

    async def _dependency(request: Request, response: Response) -> None:
        if extract_target is not None:
            maybe = extract_target(request)
            if hasattr(maybe, "__await__"):
                target = await maybe  # type: ignore[assignment]
            else:
                target = maybe  # type: ignore[assignment]
        elif mode == "gate-inbound":
            target = await _default_extract_inbound(request)
        else:
            target = None

        if not target:
            response.headers["X-Strale-Verdict"] = "skipped:no-target"
            return

        try:
            result = await client.assess(target=target, mode=request_mode)
        except Exception as exc:  # noqa: BLE001
            response.headers["X-Strale-Verdict"] = f"skipped:fetch-error"
            response.headers["X-Strale-Error"] = str(exc)[:200]
            return

        response.headers["X-Strale-Verdict"] = result.verdict
        response.headers["X-Strale-Confidence"] = str(result.confidence)
        response.headers["X-Strale-Flags"] = ",".join(result.critical_flags[:10])
        response.headers["X-Strale-Audit-Url"] = result.audit_url

        should_block = (
            result.verdict == "block"
            or (block_on == "review" and result.verdict == "review")
            or result.confidence < min_confidence
        )
        if should_block:
            raise HTTPException(
                status_code=403,
                detail={
                    "error_code": "strale_blocked",
                    "message": result.suggested_action,
                    "verdict": result.verdict,
                    "reason_codes": result.reason_codes,
                    "confidence": result.confidence,
                    "critical_flags": result.critical_flags,
                    "audit_url": result.audit_url,
                },
            )

    return _dependency


__all__ = [
    "Web3AssuranceClient",
    "Web3AssuranceResult",
    "strale_web3_guard",
    "Mode",
    "Verdict",
]
