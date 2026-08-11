from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .schemas import Problem


class ApiProblem(Exception):
    def __init__(
        self,
        status: int,
        title: str,
        detail: str,
        *,
        problem_type: str = "about:blank",
        errors: list[dict[str, object]] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status = status
        self.title = title
        self.detail = detail
        self.problem_type = problem_type
        self.errors = errors


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def problem_response(
    request: Request,
    *,
    status: int,
    title: str,
    detail: str,
    problem_type: str = "about:blank",
    errors: list[dict[str, object]] | None = None,
) -> JSONResponse:
    body = Problem(
        type=problem_type,
        title=title,
        status=status,
        detail=detail,
        instance=request.url.path,
        request_id=request_id(request),
        errors=errors,
    )
    return JSONResponse(
        status_code=status,
        content=body.model_dump(mode="json", by_alias=True, exclude_none=True),
        media_type="application/problem+json",
    )


def install_problem_handlers(app: FastAPI) -> None:
    @app.middleware("http")
    async def correlate_requests(request: Request, call_next: Any):
        incoming = request.headers.get("X-Request-ID", "").strip()
        request.state.request_id = incoming[:100] or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(ApiProblem)
    async def handle_api_problem(request: Request, exc: ApiProblem) -> JSONResponse:
        return problem_response(
            request,
            status=exc.status,
            title=exc.title,
            detail=exc.detail,
            problem_type=exc.problem_type,
            errors=exc.errors,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for item in exc.errors():
            errors.append(
                {
                    "location": [str(part) for part in item.get("loc", ())],
                    "message": str(item.get("msg", "Invalid value")),
                    "code": str(item.get("type", "validation_error")),
                }
            )
        return problem_response(
            request,
            status=422,
            title="Validation failed",
            detail="The request does not conform to the API contract.",
            problem_type="urn:didaca:problem:validation",
            errors=errors,
        )

    @app.exception_handler(IntegrityError)
    async def handle_integrity(request: Request, _exc: IntegrityError) -> JSONResponse:
        return problem_response(
            request,
            status=409,
            title="Conflict",
            detail="The request conflicts with an existing control-plane resource.",
            problem_type="urn:didaca:problem:conflict",
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return problem_response(
            request,
            status=exc.status_code,
            title=_title_for_status(exc.status_code),
            detail=str(exc.detail),
        )


def _title_for_status(status: int) -> str:
    return {
        400: "Bad request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not found",
        405: "Method not allowed",
        409: "Conflict",
        412: "Precondition failed",
        422: "Unprocessable content",
        428: "Precondition required",
        503: "Service unavailable",
    }.get(status, "HTTP error")
