import copy

from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import (
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DataProduct,
    DemoUser,
    Domain,
    DomainNetworkView,
    PhysicalSource,
    SeedMarker,
)
from daca_catalog.rohs_cps_seed import DEPUTY, MARKER, ORG, OWNER, identity, seed_rohs_cps_catalog
from sqlalchemy import select


def seed(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_rohs_cps_catalog(session)
        session.commit()


def test_private_views_allow_readers_without_changing_shared_graph(client, session_factory):
    seed(session_factory)
    domain = str(identity("domain:telemetry"))
    with session_factory() as session:
        session.add(
            DemoUser(
                id="domain-network-reader",
                display_name="Reader",
                organization="PoC",
                email="reader@example.invalid",
                roles=[],
                active=True,
            )
        )
        session.commit()
    headers = {"X-DaCa-User": "domain-network-reader"}
    graph = client.get("/api/v1/semantic-graphs/domains", headers=headers).json()
    view = {
        "revision": 0,
        "configuration": {
            "schemaVersion": 1,
            "addedDomainIds": [domain],
            "hiddenDomainIds": [],
            "positions": {f"domain:{domain}": {"x": 45, "y": 60}},
            "visibleKinds": ["product", "logical", "physical", "term"],
        },
    }
    saved = client.put("/api/v1/domain-network/view", headers=headers, json=view)
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    assert client.put("/api/v1/domain-network/view", headers=headers, json=view).status_code == 409
    assert (
        client.get("/api/v1/domain-network/view", headers={"X-DaCa-User": OWNER}).json()["revision"]
        == 0
    )
    assert client.get("/api/v1/semantic-graphs/domains", headers=headers).json() == graph
    assert (
        client.put(
            "/api/v1/semantic-graphs/domains",
            headers=headers,
            json={"revision": graph["revision"], "positions": {}, "relations": []},
        ).status_code
        == 403
    )
    invalid = copy.deepcopy(saved.json())
    invalid["configuration"]["relations"] = []
    assert (
        client.put("/api/v1/domain-network/view", headers=headers, json=invalid).status_code == 422
    )
    assert (
        client.get("/api/v1/domain-network/view", headers=headers).headers["cache-control"]
        == "no-store"
    )
    with session_factory() as session:
        assert session.get(DomainNetworkView, "domain-network-reader").configuration[
            "addedDomainIds"
        ] == [domain]


def test_product_positions_are_private_authorized_and_preserve_hidden_anchors(client, session_factory):
    seed(session_factory)
    headers = {"X-DaCa-User": OWNER}
    key = f"product:{identity('product:telemetry')}"
    body = {"revision": 0, "configuration": {"schemaVersion": 1, "positions": {key: {"x": 480, "y": 360}}}}
    saved = client.put("/api/v1/domain-network/view", headers=headers, json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["configuration"]["positions"][key] == {"x": 480, "y": 360}
    assert client.get("/api/v1/domain-network/view", headers={"X-DaCa-User": DEPUTY}).json()["configuration"]["positions"] == {}
    assert client.put("/api/v1/domain-network/view", headers=headers, json=body).status_code == 409
    with session_factory() as session:
        session.get(DataProduct, identity("product:telemetry")).discoverable = False
        session.commit()
    denied = client.put("/api/v1/domain-network/view", headers={"X-DaCa-User": "christian.spider"}, json=body)
    assert denied.status_code == 422
    unknown = copy.deepcopy(saved.json())
    unknown["configuration"]["positions"]["product:00000000-0000-0000-0000-000000000000"] = {"x": 50, "y": 60}
    assert client.put("/api/v1/domain-network/view", headers=headers, json=unknown).status_code == 422
    with session_factory() as session:
        session.get(DataProduct, identity("product:telemetry")).lifecycle = "retired"
        session.commit()
    # A retained, unchanged hidden/retired anchor must not prevent unrelated saves.
    retained = saved.json()
    retained["configuration"]["visibleKinds"] = []
    assert client.put("/api/v1/domain-network/view", headers=headers, json=retained).status_code == 200
    changed = copy.deepcopy(retained)
    changed["revision"] = 2
    changed["configuration"]["positions"][key]["x"] += 10
    assert client.put("/api/v1/domain-network/view", headers=headers, json=changed).status_code == 422


def test_group_positions_support_all_readable_layers_and_keep_scope_checks(client, session_factory):
    seed(session_factory)
    headers = {"X-DaCa-User": OWNER}
    domain = str(identity("domain:telemetry"))
    objects = client.get(f"/api/v1/domain-network/objects?domain_id={domain}", headers=headers).json()["items"]
    selected = {kind: next(item for item in objects if item["kind"] == kind) for kind in ("product", "term", "logical", "physical")}
    positions = {item["key"]: {"x": 420 + index * 260, "y": 300} for index, item in enumerate(selected.values())}
    body = {"revision": 0, "configuration": {"schemaVersion": 1, "positions": positions}}
    graph = client.get("/api/v1/semantic-graphs/domains", headers=headers).json()
    saved = client.put("/api/v1/domain-network/view", headers=headers, json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["configuration"]["positions"] == positions
    moved = saved.json()
    for point in moved["configuration"]["positions"].values():
        point["x"] += 40
        point["y"] += 20
    saved = client.put("/api/v1/domain-network/view", headers=headers, json=moved)
    assert saved.status_code == 200, saved.text
    assert client.get("/api/v1/semantic-graphs/domains", headers=headers).json() == graph
    assert client.get("/api/v1/domain-network/view", headers={"X-DaCa-User": DEPUTY}).json()["configuration"]["positions"] == {}
    # A foreign office cannot add or move physical-source anchors it cannot read.
    foreign = {"revision": 0, "configuration": {"positions": {selected["physical"]["key"]: {"x": 40, "y": 60}}}}
    assert client.put("/api/v1/domain-network/view", headers={"X-DaCa-User": "christian.spider"}, json=foreign).status_code == 422
    unknown = saved.json()
    unknown["configuration"]["positions"]["term:00000000-0000-0000-0000-000000000000"] = {"x": 50, "y": 60}
    assert client.put("/api/v1/domain-network/view", headers=headers, json=unknown).status_code == 422


def test_rohs_network_has_trusted_scope_owners_and_all_object_layers(client, session_factory):
    seed(session_factory)
    domain = str(identity("domain:telemetry"))
    foreign = client.get(
        f"/api/v1/domains/{domain}", headers={"X-DaCa-User": "christian.spider"}
    ).json()
    assert foreign["departmentCodes"] == ["EFD"]
    assert foreign["officeCodes"] == ["BIT"]
    assert foreign["foreignDepartment"] is True
    assert foreign["ownerName"] == "Marcello Hebeisa"
    # Even an explicit foreign-department responsibility does not make this
    # explorer's gray source card editable.
    with session_factory() as session:
        session.add(
            CatalogObjectResponsibility(
                id=identity("test:foreign-responsibility"),
                user_id="christian.spider",
                role="data_owner",
                domain_id=identity("domain:telemetry"),
                organization_id=ORG,
                active=True,
            )
        )
        session.add(
            DemoUser(
                id="bit-parent-reader",
                display_name="BIT parent",
                organization="BIT",
                email="bit-parent@example.invalid",
                roles=[],
                active=True,
            )
        )
        session.flush()
        session.add(
            DataModelRoleAssignment(
                id=identity("test:parent-role"),
                user_id="bit-parent-reader",
                department_code="EFD",
                organization_id="efd-bit",
                role="data_steward",
                active=True,
            )
        )
        session.commit()
    graph = client.get(
        "/api/v1/semantic-graphs/domains", headers={"X-DaCa-User": "christian.spider"}
    ).json()
    assert f"domain:{domain}" not in graph["relationSourceNodeIds"]
    desired = [
        {**link, "relationType": "related"} if link["sourceId"] == domain else link
        for link in graph["relations"]
    ]
    assert (
        client.put(
            "/api/v1/semantic-graphs/domains",
            headers={"X-DaCa-User": "christian.spider"},
            json={
                "revision": graph["revision"],
                "positions": graph["positions"],
                "relations": desired,
            },
        ).status_code
        == 403
    )
    parent = client.get(
        "/api/v1/domain-network/objects",
        params={"domain_id": domain},
        headers={"X-DaCa-User": "bit-parent-reader"},
    )
    assert parent.status_code == 200, parent.text
    assert not any(item["kind"] == "physical" for item in parent.json()["items"])
    own = client.get(f"/api/v1/domains/{domain}", headers={"X-DaCa-User": OWNER}).json()
    assert own["foreignDepartment"] is False
    response = client.get(
        "/api/v1/domain-network/objects",
        params=[("domain_id", domain), ("domain_id", str(identity("domain:analytics")))],
        headers={"X-DaCa-User": OWNER},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert {item["kind"] for item in items} == {"product", "term", "logical", "physical"}
    assert sum(item["kind"] == "physical" for item in items) == 4
    assert all(item["ownerName"] == "Marcello Hebeisa" for item in items)
    assert any("ROHS.PROMETHEUS.metric_samples" == item["label"] for item in items)
    assert any(item["description"].startswith("Physische Deklaration") for item in items)
    assert any(item["label"].startswith("s3://rohs-poc-analytics/") for item in items)
    outsider = client.get(
        "/api/v1/domain-network/objects",
        params={"domain_id": domain},
        headers={"X-DaCa-User": "sibilla.micheli"},
    )
    assert outsider.status_code == 200, outsider.text
    assert not any(item["kind"] == "physical" for item in outsider.json()["items"])
    # A private product must never leak via a domain membership.
    with session_factory() as session:
        session.get(DataProduct, identity("product:telemetry")).discoverable = False
        session.commit()
    outsider = client.get(
        "/api/v1/domain-network/objects",
        params={"domain_id": domain},
        headers={"X-DaCa-User": "sibilla.micheli"},
    )
    assert not any(
        item["id"] == str(identity("product:telemetry")) for item in outsider.json()["items"]
    )


def test_rohs_fixture_preserves_later_edits_and_does_not_connect_sources(session_factory):
    seed(session_factory)
    with session_factory() as session:
        assert session.get(SeedMarker, MARKER)
        sources = list(
            session.scalars(select(PhysicalSource).where(PhysicalSource.organization_id == ORG))
        )
        assert len(sources) == 4
        assert {source.adapter_type for source in sources} == {"csv", "postgresql", "s3"}
        assert all(source.config_ref is None for source in sources)
        domain = session.get(Domain, identity("domain:telemetry"))
        domain.owner_user_id, domain.deputy_owner_user_id = DEPUTY, OWNER
        domain.revision += 1
        sources[0].lifecycle = "retired"
        session.commit()
        seed_rohs_cps_catalog(session)
        session.commit()
        assert domain.owner_user_id == DEPUTY
        assert sources[0].lifecycle == "retired"
