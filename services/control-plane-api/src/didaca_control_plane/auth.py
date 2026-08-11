from typing import Annotated

from fastapi import Header, Request

from .problems import ApiProblem


def require_mutation_actor(
    request: Request,
    actor: Annotated[str | None, Header(alias="X-DiDaCa-Actor")] = None,
) -> str:
    """Gate the POC mutation surface behind explicitly enabled demo identity."""
    if not request.app.state.settings.demo_auth:
        raise ApiProblem(
            503,
            "Production identity provider not configured",
            "Demo mutation identity is disabled and no production identity provider is configured.",
            problem_type="urn:didaca:problem:identity-unavailable",
        )
    normalized = actor.strip() if actor else ""
    if not normalized:
        raise ApiProblem(
            401,
            "Actor identity required",
            "Provide a nonblank X-DiDaCa-Actor header for this control-plane mutation.",
            problem_type="urn:didaca:problem:identity-required",
        )
    if len(normalized) > 200:
        raise ApiProblem(
            422,
            "Actor identity is too long",
            "X-DiDaCa-Actor must contain at most 200 characters.",
            problem_type="urn:didaca:problem:validation",
        )
    return normalized
