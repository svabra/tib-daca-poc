"""Product-scoped feedback, private owner delivery and author-controlled public deletion."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import Field, field_validator
from sqlalchemy import select

from .modeling_api import ActorDep, SessionDep
from .modeling_service import record_audit
from .models import DataProduct, DataProductComment, DemoUser, utc_now
from .object_governance import product_owners
from .schemas import ApiModel, reject_unsafe_service_level_text


class CommentWrite(ApiModel):
    text: str = Field(min_length=1, max_length=4000)
    visibility: Literal["public", "private"] = "private"

    @field_validator("text")
    @classmethod
    def safe_text(cls, value: str) -> str:
        value = reject_unsafe_service_level_text(value)
        if not value:
            raise ValueError("Enter a comment")
        return value


class CommentReceipt(ApiModel):
    id: uuid.UUID
    visibility: Literal["public", "private"]
    created_at: datetime


class CommentResponse(CommentReceipt):
    text: str
    author_user_id: str
    author_name: str
    author_organization: str


class CommentPage(ApiModel):
    items: list[CommentResponse]
    can_view_private: bool
    next_offset: int | None


def readable_product(session, product_id, actor):
    from .main import require_product_view

    product = session.get(DataProduct, product_id)
    if product is None:
        raise HTTPException(404, "Data product not found")
    require_product_view(session, product, actor)
    return product


def prevent_caching(response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "X-DaCa-User"


def create_product_comments_router():
    router = APIRouter(prefix="/api/v1/data-products", tags=["product comments"])

    @router.get("/{product_id}/comments", response_model=CommentPage)
    def list_comments(
        product_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
    ):
        product = readable_product(session, product_id, actor)
        can_view_private = actor in product_owners(session, product)
        query = (
            select(DataProductComment, DemoUser)
            .join(DemoUser, DemoUser.id == DataProductComment.author_user_id)
            .where(DataProductComment.data_product_id == product_id)
        )
        if not can_view_private:
            query = query.where(DataProductComment.visibility == "public")
        rows = session.execute(
            query.order_by(DataProductComment.created_at.desc(), DataProductComment.id.desc())
            .offset(offset)
            .limit(limit + 1)
        ).all()
        prevent_caching(response)
        return CommentPage(
            items=[
                CommentResponse(
                    id=comment.id,
                    visibility=comment.visibility,
                    created_at=comment.created_at,
                    text=comment.text,
                    author_user_id=comment.author_user_id,
                    author_name=author.display_name,
                    author_organization=author.organization,
                )
                for comment, author in rows[:limit]
            ],
            can_view_private=can_view_private,
            next_offset=offset + limit if len(rows) > limit else None,
        )

    @router.post("/{product_id}/comments", response_model=CommentReceipt, status_code=201)
    def create_comment(
        product_id: uuid.UUID,
        body: CommentWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ):
        readable_product(session, product_id, actor)
        comment = DataProductComment(
            id=uuid.uuid4(),
            data_product_id=product_id,
            author_user_id=actor,
            text=body.text,
            visibility=body.visibility,
            created_at=utc_now(),
        )
        session.add(comment)
        record_audit(
            session,
            "data-product-comment",
            comment.id,
            "created",
            actor,
            None,
            {"productId": str(product_id), "visibility": body.visibility},
        )
        session.commit()
        prevent_caching(response)
        return CommentReceipt(
            id=comment.id, visibility=comment.visibility, created_at=comment.created_at
        )

    @router.delete("/{product_id}/comments/{comment_id}", status_code=204, response_class=Response)
    def delete_public_comment(
        product_id: uuid.UUID,
        comment_id: uuid.UUID,
        session: SessionDep,
        actor: ActorDep,
    ):
        readable_product(session, product_id, actor)
        comment = session.scalar(
            select(DataProductComment)
            .where(
                DataProductComment.id == comment_id,
                DataProductComment.data_product_id == product_id,
            )
            .with_for_update()
        )
        if comment is None:
            raise HTTPException(404, "Comment not found")
        if comment.visibility != "public" or comment.author_user_id != actor:
            raise HTTPException(403, "Only your own public comments can be deleted")
        record_audit(
            session,
            "data-product-comment",
            comment.id,
            "deleted",
            actor,
            None,
            {"productId": str(product_id), "visibility": "public"},
        )
        session.delete(comment)
        session.commit()
        response = Response(status_code=204)
        prevent_caching(response)
        return response

    return router
