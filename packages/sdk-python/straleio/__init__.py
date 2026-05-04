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

# Web3 Assurance retired 2026-05-04. The Web3AssuranceClient module was
# deleted in lockstep with the backend code. Imports of
# `straleio.web3_assurance` will raise ImportError on this and later
# package versions.

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

__version__ = "0.2.0"
