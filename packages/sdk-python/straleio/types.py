"""Type definitions for the Strale Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional


@dataclass
class DoRequest:
    """Request payload for POST /v1/do."""

    max_price_cents: int
    """Maximum price in EUR cents you're willing to pay."""

    task: Optional[str] = None
    """Natural language description of what you need done."""

    capability_slug: Optional[str] = None
    """Direct capability slug override (bypasses matching)."""

    inputs: Optional[Dict[str, Any]] = None
    """Structured input for the capability."""

    timeout_seconds: Optional[int] = None
    """Execution timeout in seconds (max 60)."""

    dry_run: bool = False
    """If True, returns what would execute without charging."""

    idempotency_key: Optional[str] = None
    """Idempotency key for safe retries."""


@dataclass
class Provenance:
    """Provenance metadata for a capability execution."""

    source: str
    fetched_at: str


@dataclass
class DoResponse:
    """Response from POST /v1/do (completed or executing)."""

    transaction_id: str
    status: str
    capability_used: str
    price_cents: int
    latency_ms: int
    wallet_balance_cents: int
    output: Dict[str, Any]
    provenance: Provenance


@dataclass
class DryRunResponse:
    """Response from POST /v1/do with dry_run=True."""

    dry_run: bool
    would_execute: str
    price_cents: int
    wallet_balance_cents: int
    wallet_sufficient: bool


@dataclass
class Capability:
    """A capability available on the Strale platform."""

    slug: str
    name: str
    description: str
    category: str
    price_cents: int
    input_schema: Any
    output_schema: Any
    sqs: int
    sqs_label: str
    quality: str
    reliability: str
    trend: str
    usable: bool
    strategy: str


@dataclass
class BalanceResponse:
    """Wallet balance response."""

    balance_cents: int
    currency: str


@dataclass
class Transaction:
    """Transaction summary from list endpoint."""

    id: str
    status: str
    capability_slug: str
    price_cents: int
    latency_ms: int
    created_at: str
    completed_at: Optional[str]


@dataclass
class TransactionDetail:
    """Full transaction detail."""

    id: str
    status: str
    capability_slug: str
    input: Dict[str, Any]
    output: Optional[Dict[str, Any]]
    error: Optional[str]
    price_cents: int
    latency_ms: int
    provenance: Optional[Provenance]
    created_at: str
    completed_at: Optional[str]
