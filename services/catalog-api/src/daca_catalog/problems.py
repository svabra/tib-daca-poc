from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

PROBLEM_MEDIA_TYPE = "application/problem+json"
logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CatalogProblem(Exception):
    """A safe, structured problem that may be shown in the catalog UI.

    Database driver messages must never be used as the public problem detail.  They
    often contain query values and therefore belong in the server log only.
    """

    status: int
    title: str
    detail: str
    problem_type: str = "about:blank"
    error_code: str | None = None
    suggested_action: str | None = None
    errors: list[dict[str, Any]] | None = None
    technical_details: dict[str, str] | None = None


def problem_response(
    request: Request,
    status: int,
    title: str,
    detail: str,
    *,
    problem_type: str = "about:blank",
    errors: list[dict[str, Any]] | None = None,
    error_code: str | None = None,
    suggested_action: str | None = None,
    technical_details: dict[str, str] | None = None,
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
    if error_code:
        body["errorCode"] = error_code
    if suggested_action:
        body["suggestedAction"] = suggested_action
    if technical_details:
        body["technicalDetails"] = technical_details
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE)


def integrity_problem(exc: IntegrityError) -> CatalogProblem:
    """Translate known PostgreSQL integrity failures without exposing SQL values."""

    diagnostic = getattr(exc.orig, "diag", None)
    constraint = getattr(diagnostic, "constraint_name", None)
    sql_state = getattr(exc.orig, "sqlstate", None) or getattr(diagnostic, "sqlstate", None)
    safe_technical = {
        "category": "PostgreSQL integrity constraint",
        "sqlState": str(sql_state or "unknown"),
        "constraint": str(constraint or "unclassified"),
        "timestamp": datetime.now(UTC).isoformat(),
    }
    if constraint == "uq_logical_model_identifier_normalized":
        return CatalogProblem(
            409,
            "Identifier bereits vergeben",
            "Dieser Identifier wird bereits von einem anderen logischen Modell verwendet.",
            "urn:daca:problem:logical-model:identifier-conflict",
            "DACA-LM-IDENTIFIER-DUPLICATE",
            "Wählen Sie einen anderen Identifier. Identifier sind katalogweit eindeutig.",
            [{"location": "body.identifiers.0", "message": "Dieser Identifier ist bereits vergeben.", "type": "unique"}],
            safe_technical,
        )
    if constraint == "uq_logical_entity_version_name":
        return CatalogProblem(
            422,
            "Entitätsname doppelt",
            "Innerhalb einer Modellversion darf jeder Entitätsname nur einmal vorkommen.",
            "urn:daca:problem:logical-model:entity-name-duplicate",
            "DACA-LM-ENTITY-NAME-DUPLICATE",
            "Benennen Sie eine der markierten Entitäten um.",
            [{"location": "body.entities", "message": "Entitätsnamen müssen innerhalb des Modells eindeutig sein.", "type": "unique"}],
            safe_technical,
        )
    if constraint == "uq_logical_field_version_name":
        return CatalogProblem(
            422,
            "Feldname doppelt",
            "Innerhalb einer Entität darf jeder Feldname nur einmal vorkommen.",
            "urn:daca:problem:logical-model:field-name-duplicate",
            "DACA-LM-FIELD-NAME-DUPLICATE",
            "Benennen Sie eines der markierten Felder um.",
            [{"location": "body.entities", "message": "Feldnamen müssen innerhalb einer Entität eindeutig sein.", "type": "unique"}],
            safe_technical,
        )
    if sql_state in {"23502", "23503", "23514"}:
        return CatalogProblem(
            422,
            "Angaben nicht gültig",
            "Mindestens eine Angabe erfüllt eine Datenregel nicht.",
            "urn:daca:problem:logical-model:data-validation",
            "DACA-LM-DATA-VALIDATION",
            "Prüfen Sie die markierten Angaben und speichern Sie danach erneut.",
            [{"location": "body", "message": "Eine Datenregel wurde verletzt.", "type": "integrity"}],
            safe_technical,
        )
    return CatalogProblem(
        409,
        "Speichern nicht möglich",
        "Der Entwurf konnte wegen einer Datenkonsistenzregel nicht gespeichert werden.",
        "urn:daca:problem:logical-model:integrity-conflict",
        "DACA-LM-INTEGRITY-CONFLICT",
        "Versuchen Sie das Speichern erneut. Besteht das Problem weiter, kopieren Sie die technische Meldung für den Support.",
        technical_details=safe_technical,
    )


def _is_logical_model_request(request: Request) -> bool:
    """Return whether the editor-specific logical-model error contract applies.

    Other catalog APIs have independently established RFC-7807 details.  They
    must retain their existing contract rather than receiving editor guidance.
    """

    return "/logical-model" in request.url.path


def install_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(CatalogProblem)
    async def catalog_problem_handler(request: Request, exc: CatalogProblem) -> JSONResponse:
        return problem_response(
            request,
            exc.status,
            exc.title,
            exc.detail,
            problem_type=exc.problem_type,
            errors=exc.errors,
            error_code=exc.error_code,
            suggested_action=exc.suggested_action,
            technical_details=exc.technical_details,
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        is_logical_model_request = _is_logical_model_request(request)
        if is_logical_model_request and exc.status_code == 412:
            return problem_response(
                request,
                412,
                "Entwurf wurde zwischenzeitlich geändert",
                "Eine neuere Version dieses Entwurfs liegt bereits vor.",
                problem_type="urn:daca:problem:logical-model:etag-conflict",
                error_code="DACA-LM-ETAG-CONFLICT",
                suggested_action="Laden Sie den Entwurf neu und prüfen Sie Ihre Änderungen, bevor Sie erneut speichern.",
            )
        if is_logical_model_request and exc.status_code == 428:
            return problem_response(
                request,
                428,
                "Speicherstand fehlt",
                "Die Aktion enthält keinen gültigen Speicherstand der Modellversion.",
                problem_type="urn:daca:problem:logical-model:precondition-required",
                error_code="DACA-LM-ETAG-REQUIRED",
                suggested_action="Öffnen Sie den Entwurf erneut und versuchen Sie die Aktion nochmals.",
            )
        if is_logical_model_request and exc.status_code == 409:
            return problem_response(
                request,
                409,
                "Speichern nicht möglich",
                "Die Änderung steht im Konflikt mit einem bestehenden Katalogeintrag.",
                problem_type="urn:daca:problem:logical-model:conflict",
                error_code="DACA-LM-RESOURCE-CONFLICT",
                suggested_action="Prüfen Sie die markierten Angaben und versuchen Sie das Speichern erneut.",
            )
        if is_logical_model_request and exc.status_code == 422:
            return problem_response(
                request,
                422,
                "Eingaben korrigieren",
                "Mindestens eine Angabe ist unvollständig oder ungültig.",
                problem_type="urn:daca:problem:logical-model:data-validation",
                error_code="DACA-LM-DATA-VALIDATION",
                suggested_action="Prüfen Sie die markierten Angaben und speichern Sie danach erneut.",
            )
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
        if not _is_logical_model_request(request):
            return problem_response(
                request,
                422,
                "Validation failed",
                "The request body or parameters are invalid",
                problem_type="urn:daca:problem:validation",
                errors=errors,
            )
        return problem_response(
            request,
            422,
            "Eingaben korrigieren",
            "Mindestens eine Angabe ist unvollständig oder ungültig.",
            problem_type="urn:daca:problem:validation",
            errors=errors,
            error_code="DACA-LM-REQUEST-VALIDATION",
            suggested_action="Prüfen Sie die markierten Angaben und speichern Sie danach erneut.",
        )

    @app.exception_handler(IntegrityError)
    async def integrity_exception_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        session = getattr(request.state, "db_session", None)
        if session is not None:
            session.rollback()
        problem = integrity_problem(exc)
        logger.warning(
            "catalog_integrity_error request_id=%s status=%s error_code=%s sql_state=%s constraint=%s",
            getattr(request.state, "request_id", None),
            problem.status,
            problem.error_code,
            problem.technical_details.get("sqlState") if problem.technical_details else None,
            problem.technical_details.get("constraint") if problem.technical_details else None,
        )
        return problem_response(
            request,
            problem.status,
            problem.title,
            problem.detail,
            problem_type=problem.problem_type,
            errors=problem.errors,
            error_code=problem.error_code,
            suggested_action=problem.suggested_action,
            technical_details=problem.technical_details,
        )

