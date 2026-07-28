"""
Standard error envelope middleware — every API in the system returns this shape on failure:

{
  "error": {
    "code": "AGENT_SCHEMA_VALIDATION_FAILED",
    "message": "...",
    "http_status": 422,
    "retryable": false,
    "trace_id": "uuid",
    "details": {},
    "occurred_at": "iso8601"
  }
}

Per ADM_2.0_API_ERRORS_AND_TOPOLOGY.md §1.
"""

from __future__ import annotations

import traceback
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

# ──────────────────────────────────────────────────────────────────────────────
# Error code → (http_status, retryable) registry
# ADM_2.0_API_ERRORS_AND_TOPOLOGY.md §1.1
# ──────────────────────────────────────────────────────────────────────────────
ERROR_REGISTRY: dict[str, tuple[int, bool]] = {
    "AUTH_REQUIRED":                    (401, False),
    "FORBIDDEN_ROLE":                   (403, False),
    "NOT_FOUND":                        (404, False),
    "VALIDATION_ERROR":                 (400, False),
    "CONFLICT":                         (409, False),
    "PROJECT_NAME_DUPLICATE":           (409, False),
    "SESSION_LOCKED":                   (409, False),
    "PUSH_ALREADY_IN_PROGRESS":         (409, False),
    "GATE_UNSAVED_CHANGES":             (409, False),
    "CHECKPOINT_CONFLICT":              (409, False),
    "PEER_CALL_BUDGET_EXCEEDED":        (409, False),
    "RATE_LIMITED":                     (429, True),
    "FILE_PARSE_FAILED":                (422, True),
    "DB_CONNECTION_FAILED":             (502, True),
    "AGENT_TOOL_FAILURE":               (502, True),
    "AGENT_SCHEMA_VALIDATION_FAILED":   (422, False),
    "AGENT_TIMEOUT":                    (504, True),
    "LLM_PROVIDER_ERROR":               (502, True),
    "PUSH_TARGET_UNREACHABLE":          (502, True),
    "SKILL_STAGE_MISMATCH":             (400, False),
    "INTERNAL_ERROR":                   (500, False),
}


def _envelope(
    code: str,
    message: str,
    http_status: int | None = None,
    retryable: bool | None = None,
    details: dict | None = None,
    trace_id: str | None = None,
) -> JSONResponse:
    reg = ERROR_REGISTRY.get(code, (http_status or 500, False))
    status_code = http_status if http_status is not None else reg[0]
    is_retryable = retryable if retryable is not None else reg[1]
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "http_status": status_code,
                "retryable": is_retryable,
                "trace_id": trace_id or str(uuid4()),
                "details": details or {},
                "occurred_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


# ──────────────────────────────────────────────────────────────────────────────
# Public helper — use this in route handlers to raise spec-compliant errors
# ──────────────────────────────────────────────────────────────────────────────
class ADMException(Exception):
    """Raise this instead of HTTPException to get the standard error envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        http_status: int | None = None,
        retryable: bool | None = None,
        details: dict | None = None,
        trace_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.retryable = retryable
        self.details = details or {}
        self.trace_id = trace_id or str(uuid4())


# ──────────────────────────────────────────────────────────────────────────────
# Exception handlers — register all on the FastAPI app
# ──────────────────────────────────────────────────────────────────────────────
async def adm_exception_handler(request: Request, exc: ADMException) -> JSONResponse:
    return _envelope(
        code=exc.code,
        message=exc.message,
        http_status=exc.http_status,
        retryable=exc.retryable,
        details=exc.details,
        trace_id=exc.trace_id,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Map common HTTP status codes to spec error codes
    code_map = {
        401: "AUTH_REQUIRED",
        403: "FORBIDDEN_ROLE",
        404: "NOT_FOUND",
        400: "VALIDATION_ERROR",
        409: "CONFLICT",
        429: "RATE_LIMITED",
        422: "VALIDATION_ERROR",
        500: "INTERNAL_ERROR",
        502: "AGENT_TOOL_FAILURE",
        504: "AGENT_TIMEOUT",
    }
    code = code_map.get(exc.status_code, "INTERNAL_ERROR")
    message = str(exc.detail) if exc.detail else "An error occurred"
    return _envelope(code=code, message=message, http_status=exc.status_code)


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = {"errors": exc.errors()}
    return _envelope(
        code="VALIDATION_ERROR",
        message="Request body validation failed",
        http_status=status.HTTP_400_BAD_REQUEST,
        details=details,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log server-side; never send stack trace to client
    print(f"[INTERNAL_ERROR] {type(exc).__name__}: {exc}\n{traceback.format_exc()}")
    return _envelope(
        code="INTERNAL_ERROR",
        message="An unexpected internal error occurred. Our team has been notified.",
        http_status=500,
    )


def register_error_handlers(app) -> None:
    """Call this in main.py after creating the FastAPI app."""
    app.add_exception_handler(ADMException, adm_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
