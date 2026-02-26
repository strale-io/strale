"""Error classes for the Strale Python SDK."""

from __future__ import annotations

from typing import Any, Dict, Optional


class StraleError(Exception):
    """Base error class for all Strale API errors."""

    def __init__(
        self,
        error_code: str,
        message: str,
        status_code: int,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}


class InsufficientBalanceError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("insufficient_balance", message, 402, details)
        self.wallet_balance_cents: int = (details or {}).get("wallet_balance_cents", 0)
        self.required_cents: int = (details or {}).get("required_cents", 0)


class NoMatchingCapabilityError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("no_matching_capability", message, 404, details)


class CapabilityUnavailableError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("capability_unavailable", message, 503, details)


class ExecutionFailedError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("execution_failed", message, 500, details)
        self.transaction_id: Optional[str] = (details or {}).get("transaction_id")


class TimeoutExceededError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("timeout_exceeded", message, 408, details)


class InvalidRequestError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("invalid_request", message, 400, details)


class RateLimitedError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("rate_limited", message, 429, details)


class UnauthorizedError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("unauthorized", message, 401, details)


class NotFoundError(StraleError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__("not_found", message, 404, details)


_ERROR_MAP = {
    "insufficient_balance": InsufficientBalanceError,
    "no_matching_capability": NoMatchingCapabilityError,
    "capability_unavailable": CapabilityUnavailableError,
    "execution_failed": ExecutionFailedError,
    "timeout_exceeded": TimeoutExceededError,
    "invalid_request": InvalidRequestError,
    "rate_limited": RateLimitedError,
    "unauthorized": UnauthorizedError,
    "not_found": NotFoundError,
}


def create_error(
    error_code: str,
    message: str,
    status_code: int,
    details: Optional[Dict[str, Any]] = None,
) -> StraleError:
    """Create a typed error from an API error response."""
    cls = _ERROR_MAP.get(error_code, StraleError)
    if cls is StraleError:
        return StraleError(error_code, message, status_code, details)
    return cls(message, details)
