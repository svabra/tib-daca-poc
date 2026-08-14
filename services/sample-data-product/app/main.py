from __future__ import annotations

import datetime as dt
import hmac
import threading
import uuid
from typing import Any

import httpx
from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import database_ready, fetch_statistics, projector_engine
from app.models import PolicyDeployment, PolicyEntitlement
from app.schemas import PolicyProjection
from app.settings import get_settings

settings = get_settings()
_seed_projection_ack_lock = threading.Lock()
_seed_projection_acknowledged = False


class ProblemError(Exception):
    def __init__(self, status: int, title: str, detail: str, problem_type: str) -> None:
        self.status = status
        self.title = title
        self.detail = detail
        self.problem_type = problem_type


app = FastAPI(
    title="BIT DaCa Synthetic ESTV Data Product",
    version="0.1.0",
    description="HTTP PEP for a synthetic aggregate ESTV tax-statistics product.",
    root_path=settings.root_path,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_methods=["GET", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-DaCa-User", "X-DaCa-Machine", "X-Request-ID"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


def problem_response(
    request: Request,
    *,
    status: int,
    title: str,
    detail: str,
    problem_type: str,
    errors: list[dict[str, str]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    content: dict[str, Any] = {
        "type": f"https://daca.bit.admin.ch/problems/{problem_type}",
        "title": title,
        "status": status,
        "detail": detail,
        "instance": str(request.url.path),
        "requestId": getattr(request.state, "request_id", None),
    }
    if errors is not None:
        content["errors"] = errors
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content=content,
        headers=headers,
    )


@app.exception_handler(ProblemError)
async def problem_handler(request: Request, exc: ProblemError) -> JSONResponse:
    return problem_response(
        request,
        status=exc.status,
        title=exc.title,
        detail=exc.detail,
        problem_type=exc.problem_type,
    )


@app.exception_handler(StarletteHTTPException)
async def http_problem_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    titles = {
        404: "Not found",
        405: "Method not allowed",
    }
    problem_types = {
        404: "not-found",
        405: "method-not-allowed",
    }
    return problem_response(
        request,
        status=exc.status_code,
        title=titles.get(exc.status_code, "HTTP error"),
        detail=str(exc.detail),
        problem_type=problem_types.get(exc.status_code, "http-error"),
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_problem_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = [
        {
            "location": ".".join(str(part) for part in issue["loc"]),
            "message": str(issue["msg"]),
            "type": str(issue["type"]),
        }
        for issue in exc.errors()
    ]
    return problem_response(
        request,
        status=422,
        title="Validation failed",
        detail="The request body or parameters are invalid.",
        problem_type="validation",
        errors=errors,
    )


def decision_input(
    subject_id: str,
    request: Request,
    *,
    subject_type: str = "person",
    product_id: str | None = None,
) -> dict[str, Any]:
    resolved_product_id = product_id or settings.product_id
    return {
        "subject": {"id": subject_id, "type": subject_type},
        "action": "data.read",
        "resource": {
            "id": resolved_product_id,
            "slug": settings.product_slug,
            "owner": settings.product_owner,
            "classification": settings.product_classification,
        },
        "endpoint": {"protocol": "http-rest"},
        "request": {
            "method": request.method,
            "path": request.url.path,
            "requestId": request.state.request_id,
        },
        "context": {"requestTimestamp": dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")},
    }


async def evaluate_opa(input_document: dict[str, Any]) -> tuple[bool, str, str | None]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.post(settings.opa_decision_url, json={"input": input_document})
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ProblemError(
            503,
            "Policy decision unavailable",
            "The policy decision point could not return a valid decision.",
            "pdp-unavailable",
        ) from exc

    if not isinstance(body, dict):
        raise ProblemError(
            503,
            "Policy decision malformed",
            "OPA returned a JSON value that is not a decision document.",
            "pdp-malformed",
        )
    if "result" not in body or not isinstance(body["result"], dict):
        raise ProblemError(
            503,
            "Policy decision undefined",
            "OPA returned no defined DaCa decision; access failed closed.",
            "pdp-undefined",
        )
    result = body["result"]
    if not isinstance(result.get("allow"), bool):
        raise ProblemError(
            503,
            "Policy decision malformed",
            "OPA returned a decision without a Boolean allow value.",
            "pdp-malformed",
        )
    return result["allow"], str(result.get("reason", "policy evaluated")), body.get("decision_id")


def acknowledge_seed_projection() -> bool:
    """Best-effort acknowledgement retried by readiness until the catalog accepts it."""
    global _seed_projection_acknowledged

    if _seed_projection_acknowledged:
        return True
    if not settings.catalog_deployment_ack_url:
        return False

    with _seed_projection_ack_lock:
        if _seed_projection_acknowledged:
            return True
        try:
            response = httpx.put(
                settings.catalog_deployment_ack_url,
                headers={"Authorization": f"Bearer {settings.catalog_internal_token}"},
                json={
                    "policyRevisionId": settings.seed_policy_revision_id,
                    "target": "postgresql",
                    "observedRevision": 1,
                    "state": "deployed",
                    "error": None,
                },
                timeout=settings.deployment_ack_timeout_seconds,
            )
            response.raise_for_status()
            acknowledgement = response.json()
            if (
                acknowledgement.get("target") != "postgresql"
                or acknowledgement.get("desiredRevision") != 1
                or acknowledgement.get("observedRevision") != 1
                or acknowledgement.get("state") != "deployed"
            ):
                return False
        except (httpx.HTTPError, TypeError, ValueError):
            return False
        _seed_projection_acknowledged = True
        return True


@app.get("/health/live", tags=["health"])
def live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/health/ready", tags=["health"])
def ready() -> dict[str, str]:
    try:
        if not database_ready():
            raise RuntimeError("database probe failed")
    except Exception as exc:
        raise ProblemError(503, "Service not ready", "PostgreSQL is unavailable.", "not-ready") from exc
    acknowledge_seed_projection()
    return {"status": "ready"}


@app.get("/api/v1/estv/tax-statistics", tags=["data products"])
async def read_tax_statistics(
    request: Request,
    x_daca_user: str | None = Header(default=None, alias="X-DaCa-User"),
) -> dict[str, Any]:
    if not settings.daca_demo_auth:
        raise ProblemError(
            503,
            "Production identity provider not configured",
            "Demo identity is disabled and no OIDC provider is configured for this POC.",
            "identity-unavailable",
        )
    if not x_daca_user or not x_daca_user.strip():
        raise ProblemError(401, "Identity required", "Provide X-DaCa-User.", "identity-required")
    subject_id = x_daca_user.strip()
    allow, reason, decision_id = await evaluate_opa(decision_input(subject_id, request))
    if not allow:
        raise ProblemError(403, "Access denied", reason, "access-denied")

    product_id = uuid.UUID(settings.product_id)
    rows = await run_in_threadpool(fetch_statistics, subject_id, product_id)
    return {
        "dataProduct": {
            "id": settings.product_id,
            "slug": settings.product_slug,
            "title": "ESTV tax statistics by canton",
            "owner": settings.product_owner,
            "classification": settings.product_classification,
            "synthetic": True,
        },
        "records": rows,
        "authorization": {
            "subjectId": subject_id,
            "decision": "allow",
            "reason": reason,
            "decisionId": decision_id,
        },
    }


DAAIF_REFERENCE_PRODUCT_ID = "9c9a0112-d4ef-57d0-862c-0d27872c82c2"


@app.get("/api/v1/daaif/{source_product_id}", tags=["data products"])
async def read_daaif_reference_product(
    source_product_id: str,
    request: Request,
    x_daca_user: str | None = Header(default=None, alias="X-DaCa-User"),
    x_daca_machine: str | None = Header(default=None, alias="X-DaCa-Machine"),
) -> dict[str, Any]:
    if source_product_id != "estv.direct-tax-assessments.v1":
        raise ProblemError(404, "Data product not found", "This fixture has metadata only.", "not-found")
    if not settings.daca_demo_auth:
        raise ProblemError(503, "Production identity provider not configured", "Demo identity is disabled.", "identity-unavailable")
    identities = [value.strip() for value in (x_daca_user, x_daca_machine) if value and value.strip()]
    if len(identities) != 1:
        raise ProblemError(401, "Identity required", "Provide exactly one demo person or machine identity.", "identity-required")
    subject_id = identities[0]
    subject_type = "machine" if x_daca_machine and x_daca_machine.strip() else "person"
    allow, reason, decision_id = await evaluate_opa(
        decision_input(subject_id, request, subject_type=subject_type, product_id=DAAIF_REFERENCE_PRODUCT_ID)
    )
    if not allow:
        raise ProblemError(403, "Access denied", reason, "access-denied")
    rows = await run_in_threadpool(
        fetch_statistics,
        subject_id,
        uuid.UUID(DAAIF_REFERENCE_PRODUCT_ID),
        subject_type,
    )
    return {
        "dataProduct": {
            "id": DAAIF_REFERENCE_PRODUCT_ID,
            "sourceProductId": source_product_id,
            "title": "Direkte Bundessteuer – Veranlagungsindikatoren nach Kanton und Gemeinde",
            "owner": "ESTV",
            "classification": "internal",
            "synthetic": True,
        },
        "records": rows,
        "authorization": {
            "subjectId": subject_id,
            "subjectType": subject_type,
            "decision": "allow",
            "reason": reason,
            "decisionId": decision_id,
        },
    }


def apply_projection(product_id: uuid.UUID, projection: PolicyProjection) -> dict[str, Any]:
    weekday_numbers = {
        "monday": 1,
        "tuesday": 2,
        "wednesday": 3,
        "thursday": 4,
        "friday": 5,
        "saturday": 6,
        "sunday": 7,
    }
    with Session(projector_engine()) as session, session.begin():
        current = session.scalar(
            select(PolicyDeployment).where(PolicyDeployment.product_id == product_id)
        )
        if current and projection.revision < current.revision:
            raise ProblemError(
                409,
                "Stale policy projection",
                f"Revision {current.revision} is already deployed.",
                "stale-policy-projection",
            )
        if current and projection.revision == current.revision:
            return {
                "productId": str(product_id),
                "revision": current.revision,
                "status": "already-current",
            }

        session.execute(delete(PolicyEntitlement).where(PolicyEntitlement.product_id == product_id))
        for entitlement in projection.entitlements:
            availability = entitlement.weekly_availability
            session.add(
                PolicyEntitlement(
                    product_id=product_id,
                    subject_id=entitlement.subject_id,
                    subject_type=entitlement.subject_type,
                    action=entitlement.action,
                    protocol=entitlement.protocol,
                    valid_from=entitlement.valid_from,
                    valid_until=entitlement.valid_until,
                    data_variant=entitlement.data_variant,
                    weekly_days=(
                        ",".join(str(weekday_numbers[item]) for item in availability.weekdays)
                        if availability
                        else None
                    ),
                    weekly_start_time=(
                        dt.time.fromisoformat(availability.start_time) if availability else None
                    ),
                    weekly_end_time=(
                        dt.time.fromisoformat(availability.end_time) if availability else None
                    ),
                    weekly_time_zone=availability.time_zone if availability else None,
                    policy_revision=projection.revision,
                    active=True,
                )
            )
        session.execute(
            insert(PolicyDeployment)
            .values(
                product_id=product_id,
                revision=projection.revision,
                deployed_at=dt.datetime.now(dt.UTC),
            )
            .on_conflict_do_update(
                index_elements=[PolicyDeployment.product_id],
                set_={
                    "revision": projection.revision,
                    "deployed_at": dt.datetime.now(dt.UTC),
                },
            )
        )
    return {"productId": str(product_id), "revision": projection.revision, "status": "deployed"}


@app.put("/internal/v1/policy-projections/{product_id}", tags=["internal"])
def deploy_policy_projection(
    product_id: uuid.UUID,
    projection: PolicyProjection,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    expected = f"Bearer {settings.daca_policy_deployment_token}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise ProblemError(401, "Invalid deployment identity", "Bearer token required.", "invalid-token")
    return apply_projection(product_id, projection)
