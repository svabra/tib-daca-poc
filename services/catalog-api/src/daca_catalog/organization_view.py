"""Private organization-canvas anchors, independent of catalog/governance metadata."""

from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_session
from .lineage_access import access_actor
from .models import AuditEvent, DemoUser
from .schemas import ApiModel

PREFERENCE = "organization-network-layout"
Identity = Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r"^[a-zA-Z0-9:_.-]+$")]


class OrganizationPosition(ApiModel):
    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=0, le=100000, allow_inf_nan=False)
    y: float = Field(ge=0, le=100000, allow_inf_nan=False)


class OrganizationOfficePosition(OrganizationPosition):
    # Office anchors retain their original y=240 canvas origin. The expanded
    # strip beside the heading extends 120 units above it.
    y: float = Field(ge=-120, le=100000, allow_inf_nan=False)


class OrganizationScope(ApiModel):
    model_config = ConfigDict(extra="forbid")
    offices: dict[Identity, OrganizationOfficePosition] = Field(default_factory=dict, max_length=2000)
    satellites: dict[Identity, OrganizationPosition] = Field(default_factory=dict, max_length=200)


class OrganizationConfiguration(ApiModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    scopes: dict[Identity, OrganizationScope] = Field(default_factory=dict, max_length=100)

    @model_validator(mode="after")
    def bounded_anchors(self):
        mappings = [self.scopes, *(mapping for scope in self.scopes.values() for mapping in (scope.offices, scope.satellites))]
        if any(set(mapping) & {"__proto__", "prototype", "constructor"} for mapping in mappings):
            raise ValueError("Unsupported layout key")
        if sum(len(scope.offices) + len(scope.satellites) for scope in self.scopes.values()) > 2000:
            raise ValueError("At most 2000 organization anchors may be saved")
        overview = self.scopes.get("overview")
        if overview and any(point.y < 0 for point in overview.offices.values()):
            raise ValueError("Overview anchors must remain nonnegative")
        return self


class OrganizationView(ApiModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    configuration: OrganizationConfiguration


def organization_view(user: DemoUser) -> OrganizationView:
    stored = (user.preferences or {}).get(PREFERENCE)
    return OrganizationView.model_validate(stored) if stored else OrganizationView(revision=0, configuration=OrganizationConfiguration())


def create_organization_view_router():
    router = APIRouter(prefix="/api/v1/organization-network/view", tags=["organization explorer"])
    session_dep = Annotated[Session, Depends(get_session)]
    actor_dep = Annotated[str, Depends(access_actor)]

    @router.get("", response_model=OrganizationView)
    def read_view(response: Response, session: session_dep, actor: actor_dep):
        response.headers["Cache-Control"] = "no-store"
        user = session.get(DemoUser, actor)
        if user is None or not user.active:
            raise HTTPException(401, "An active profile is required")
        return organization_view(user)

    @router.put("", response_model=OrganizationView)
    def save_view(body: OrganizationView, response: Response, session: session_dep, actor: actor_dep):
        # Serialize all writes to this profile and refresh any dependency-loaded row.
        user = session.scalar(select(DemoUser).where(DemoUser.id == actor).with_for_update().execution_options(populate_existing=True))
        if user is None or not user.active:
            raise HTTPException(401, "An active profile is required")
        current = organization_view(user)
        if body.revision != current.revision:
            raise HTTPException(409, "Your organization layout changed; reload the saved layout before saving")
        result = body.model_copy(update={"revision": current.revision + 1})
        user.preferences = {**(user.preferences or {}), PREFERENCE: result.model_dump(mode="json", by_alias=True)}
        session.add(AuditEvent(id=uuid4(), resource_type="organization-network-view", resource_id=actor,
                               action="view-saved", actor=actor, revision=result.revision,
                               details={"scopeCount": len(result.configuration.scopes)}))
        session.commit()
        response.headers["Cache-Control"] = "no-store"
        return result

    return router
