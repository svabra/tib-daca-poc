from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

PROBLEM_MEDIA_TYPE = "application/problem+json"


def problem_response(
    request: Request,
    status: int,
    title: str,
    detail: str,
    *,
    problem_type: str = "about:blank",
    errors: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": problem_type,
        "title": title,
        "status": status,
        "detail": detail,
        "instance": request.url.path,
        "requestId": getattr(request.state, "request_id", None),
    }
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE)


def install_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        titles = {
            401: "Authentication required",
            403: "Forbidden",
            404: "Not found",
            409: "Conflict",
            412: "Precondition failed",
            422: "Unprocessable entity",
            428: "Precondition required",
            503: "Service unavailable",
        }
        detail = exc.detail if isinstance(exc.detail, str) else "The request could not be completed"
        return problem_response(request, exc.status_code, titles.get(exc.status_code, "Request failed"), detail)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for issue in exc.errors():
            errors.append(
                {
                    "location": ".".join(str(part) for part in issue["loc"]),
                    "message": issue["msg"],
                    "type": issue["type"],
                }
            )
        return problem_response(
            request,
            422,
            "Validation failed",
            "The request body or parameters are invalid",
            problem_type="urn:didaca:problem:validation",
            errors=errors,
        )

    @app.exception_handler(IntegrityError)
    async def integrity_exception_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        return problem_response(
            request,
            409,
            "Conflict",
            "The requested change conflicts with an existing catalog resource",
            problem_type="urn:didaca:problem:conflict",
        )

