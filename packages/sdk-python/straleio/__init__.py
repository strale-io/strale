"""Strale Python SDK — let AI agents buy capabilities at runtime."""

from .client import Strale
from .errors import (
    CapabilityUnavailableError,
    ExecutionFailedError,
    InsufficientBalanceError,
    InvalidRequestError,
    NoMatchingCapabilityError,
    NotFoundError,
    RateLimitedError,
    StraleError,
    TimeoutExceededError,
    UnauthorizedError,
)
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

__all__ = [
    # Client
    "Strale",
    # Types
    "DoRequest",
    "DoResponse",
    "DryRunResponse",
    "Provenance",
    "Capability",
    "BalanceResponse",
    "Transaction",
    "TransactionDetail",
    # Errors
    "StraleError",
    "InsufficientBalanceError",
    "NoMatchingCapabilityError",
    "CapabilityUnavailableError",
    "ExecutionFailedError",
    "TimeoutExceededError",
    "InvalidRequestError",
    "RateLimitedError",
    "UnauthorizedError",
    "NotFoundError",
]

__version__ = "0.1.0"
