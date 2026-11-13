import uuid

import pytest
from daca_catalog.models import (
    AuditEvent,
    CatalogObjectResponsibility,
    DataProduct,
    DataProductComment,
    DemoUser,
)
from sqlalchemy import select

PRODUCT = uuid.UUID("11111111-1111-4111-8111-111111111111")
BASE = f"/api/v1/data-products/{PRODUCT}"
COMMENTS = BASE + "/comments"


def headers(actor):
    return {"X-DaCa-User": actor}


@pytest.fixture(autouse=True)
def prepare_product(session_factory):
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.owner_user_id = "kassandra.valdata"
        product.deputy_owner_user_id = "joel.ruod"
        product.discoverable = True
        product.lifecycle = "active"
        session.commit()


def post(client, text="Ein fachlicher Kommentar.", visibility="private", actor="jan.waser"):
    response = client.post(
        COMMENTS, headers=headers(actor), json={"text": text, "visibility": visibility}
    )
    assert response.status_code == 201, response.text
    return response


def page(client, actor="jan.waser", **params):
    response = client.get(COMMENTS, headers=headers(actor), params=params)
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.headers["Vary"] == "X-DaCa-User"
    return response.json()


def test_private_comments_are_owner_deputy_only_even_for_the_author(client):
    public = post(client, "Öffentliche Rückfrage", "public").json()
    private = post(client, "Vertraulicher fachlicher Hinweis").json()
    assert set(private) == {"id", "visibility", "createdAt"}
    for actor in ("jan.waser", "beat.stalder", "thomas.kriegli", "ariane.keller"):
        visible = page(client, actor)
        assert not visible["canViewPrivate"]
        assert [comment["id"] for comment in visible["items"]] == [public["id"]]
        assert "Vertraulicher" not in str(visible)
    for actor in ("kassandra.valdata", "joel.ruod"):
        visible = page(client, actor)
        assert visible["canViewPrivate"]
        assert {comment["id"] for comment in visible["items"]} == {public["id"], private["id"]}
    assert post(client).headers["Cache-Control"] == "private, no-store"


def test_author_is_trusted_and_private_text_never_enters_metadata_or_audit(client, session_factory):
    receipt = post(client, "Privater eindeutiger Testinhalt").json()
    spoofed = client.post(
        COMMENTS,
        headers=headers("jan.waser"),
        json={"text": "Kommentar", "authorUserId": "kassandra.valdata"},
    )
    assert spoofed.status_code == 422
    with session_factory() as session:
        comment = session.get(DataProductComment, uuid.UUID(receipt["id"]))
        assert comment.author_user_id == "jan.waser"
        event = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "data-product-comment",
                AuditEvent.resource_id == receipt["id"],
            )
        )
        assert event.details == {"productId": str(PRODUCT), "visibility": "private"}
        assert "Privater eindeutiger Testinhalt" not in str(event.details)
    response = client.get(BASE, headers=headers("jan.waser"))
    assert response.status_code == 200
    assert "Privater eindeutiger Testinhalt" not in response.text


def test_visibility_filter_precedes_pagination_and_does_not_reveal_private_counts(client):
    expected = []
    for index in range(3):
        expected.append(post(client, f"Öffentlich {index}", "public").json()["id"])
        post(client, f"Privat {index}")
    first = page(client, limit=2)
    second = page(client, limit=2, offset=first["nextOffset"])
    assert [item["id"] for item in first["items"] + second["items"]] == expected[::-1]
    assert first["nextOffset"] == 2 and second["nextOffset"] is None
    assert "total" not in first and "privateCount" not in first


def test_private_visibility_follows_current_assignments_after_handover(client, session_factory):
    post(client)
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.owner_user_id = "ariane.keller"
        product.deputy_owner_user_id = "noemie.rochat"
        for assignment in session.scalars(
            select(CatalogObjectResponsibility).where(
                CatalogObjectResponsibility.data_product_id == PRODUCT
            )
        ):
            assignment.active = False
        session.commit()
    assert page(client, "kassandra.valdata")["items"] == []
    assert page(client, "joel.ruod")["items"] == []
    assert len(page(client, "ariane.keller")["items"]) == 1
    assert len(page(client, "noemie.rochat")["items"]) == 1


def test_comment_scope_does_not_reveal_inaccessible_products(client, session_factory):
    post(client)
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.discoverable = False
        product.lifecycle = "draft"
        session.commit()
    assert client.get(COMMENTS, headers=headers("ariane.keller")).status_code == 404
    assert (
        client.post(
            COMMENTS, headers=headers("ariane.keller"), json={"text": "Kein Zugriff"}
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/v1/data-products/{uuid.uuid4()}/comments", headers=headers("jan.waser")
        ).status_code
        == 404
    )


def test_unknown_anonymous_and_inactive_actors_are_denied(client, session_factory):
    with session_factory() as session:
        session.get(DemoUser, "jan.waser").active = False
        session.commit()
    for actor in ("", "unknown", "jan.waser"):
        assert client.get(COMMENTS, headers=headers(actor)).status_code == 401
        assert (
            client.post(
                COMMENTS, headers=headers(actor), json={"text": "Ein Kommentar"}
            ).status_code
            == 401
        )


def test_unrelated_comments_are_never_returned(client, session_factory):
    with session_factory() as session:
        another = session.scalar(select(DataProduct).where(DataProduct.id != PRODUCT).limit(1))
        session.add(
            DataProductComment(
                id=uuid.uuid4(),
                data_product_id=another.id,
                author_user_id="jan.waser",
                text="Anderes Produkt",
                visibility="public",
            )
        )
        session.commit()
    assert page(client, "kassandra.valdata")["items"] == []


def test_validation_rejects_empty_oversized_markup_and_unknown_visibility(client):
    for body in (
        {"text": "   "},
        {"text": "x" * 4001},
        {"text": "<script>alert(1)</script>"},
        {"text": "Ein Kommentar", "visibility": "everyone"},
    ):
        assert client.post(COMMENTS, headers=headers("jan.waser"), json=body).status_code == 422
    assert page(client, "kassandra.valdata")["items"] == []


def test_author_can_delete_own_public_comment_without_deleting_audit_history(
    client, session_factory
):
    receipt = post(client, "Öffentlicher löschbarer Testkommentar", "public").json()
    private = post(client, "Privater unveränderter Testkommentar").json()
    response = client.delete(COMMENTS + "/" + receipt["id"], headers=headers("jan.waser"))
    assert response.status_code == 204
    assert response.headers["Cache-Control"] == "private, no-store"
    assert page(client)["items"] == []
    assert [row["id"] for row in page(client, "kassandra.valdata")["items"]] == [private["id"]]
    with session_factory() as session:
        assert session.get(DataProductComment, uuid.UUID(receipt["id"])) is None
        events = list(
            session.scalars(
                select(AuditEvent).where(
                    AuditEvent.resource_type == "data-product-comment",
                    AuditEvent.resource_id == receipt["id"],
                )
            )
        )
        assert {event.action for event in events} == {"created", "deleted"}
        assert all("löschbarer Testkommentar" not in str(event.details) for event in events)
    assert (
        client.delete(COMMENTS + "/" + receipt["id"], headers=headers("jan.waser")).status_code
        == 404
    )


def test_public_deletion_is_author_only_and_private_comments_cannot_be_deleted(client):
    public = post(client, "Öffentlich", "public").json()
    private = post(client).json()
    for actor in ("kassandra.valdata", "joel.ruod", "thomas.kriegli"):
        assert (
            client.delete(COMMENTS + "/" + public["id"], headers=headers(actor)).status_code == 403
        )
    for actor in ("jan.waser", "kassandra.valdata", "joel.ruod"):
        assert (
            client.delete(COMMENTS + "/" + private["id"], headers=headers(actor)).status_code == 403
        )
    assert len(page(client, "kassandra.valdata")["items"]) == 2


def test_comment_deletion_checks_product_scope_and_identity(client, session_factory):
    public = post(client, "Öffentlich", "public").json()
    with session_factory() as session:
        other = session.scalar(select(DataProduct).where(DataProduct.id != PRODUCT).limit(1))
        other_id = other.id
    assert (
        client.delete(
            f"/api/v1/data-products/{other_id}/comments/{public['id']}",
            headers=headers("jan.waser"),
        ).status_code
        == 404
    )
    assert (
        client.delete(COMMENTS + "/" + public["id"], headers=headers("unknown")).status_code == 401
    )
    assert len(page(client)["items"]) == 1


def test_capabilities_and_direct_mutations_follow_product_ownership(client):
    for actor, allowed in (
        ("kassandra.valdata", True),
        ("joel.ruod", True),
        ("jan.waser", False),
        ("ariane.keller", False),
        ("thomas.kriegli", False),
    ):
        response = client.get(BASE, headers=headers(actor))
        assert response.status_code == 200, response.text
        assert response.json()["canManage"] is allowed
        assert response.headers["Cache-Control"] == "private, no-store"
        if not allowed:
            assert (
                client.patch(
                    BASE,
                    headers={**headers(actor), "If-Match": '"1"'},
                    json={"title": "Unberechtigter Versuch"},
                ).status_code
                == 403
            )
            assert (
                client.delete(
                    BASE + "/access-permissions/not-a-grant",
                    headers={**headers(actor), "If-Match": '"1"'},
                ).status_code
                == 403
            )
