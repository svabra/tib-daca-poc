from datetime import timedelta
from uuid import UUID, uuid4

from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import (
    AdministrativeOrganization,
    AdministrativeOrganizationLabel,
    DataProduct,
    DemoUser,
    FederalPersonMembership,
    IdentityGroup,
    LineageEdge,
    PolicyRevision,
    ProvenanceEvent,
    utc_now,
)
from daca_catalog.organization_network import organization_network
from daca_catalog.organization_network_seed import seed_organization_explorer
from daca_catalog.seed import ESTV_PRODUCT_ID
from daca_catalog.zeughaus_seed import PRODUCT_ID, seed_zeughaus_product
from sqlalchemy import select


def provision(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_organization_explorer(session)
        session.commit()


def test_explorer_exposes_registry_languages_and_official_astra_names_without_changing_ids(client, session_factory):
    provision(session_factory)
    graph = client.get('/api/v1/organization-network', headers={'X-DaCa-User': 'kassandra.valdata'}).json()
    nodes = {node['id']: node for node in graph['nodes']}
    astra = nodes['uvek-astra']
    assert astra['parentId'] == 'uvek'
    assert astra['code'] == 'ASTRA'
    assert astra['label'] == 'Bundesamt für Strassen'
    for language, code, name in (
        ('fr', 'OFROU', 'Office fédéral des routes'),
        ('it', 'USTRA', 'Ufficio federale delle strade'),
        ('en', 'FEDRO', 'Federal Roads Office'),
        ('rm', 'UVIAS', 'Uffizi federal da vias'),
    ):
        assert astra['localizations'][language] == {'code': code, 'label': name, 'description': name}
    assert nodes['uvek']['localizations']['fr']['code'] == 'DETEC'
    assert nodes['eda']['localizations']['rm']['code'] == 'DFAE'
    assert nodes['ejpd']['localizations']['rm']['code'] == 'DFGP'
    with session_factory() as session:
        label = session.get(AdministrativeOrganizationLabel, ('uvek-astra', 'fr'))
        if label is None:
            label = AdministrativeOrganizationLabel(organization_id='uvek-astra', language='fr', label='Nom du registre', short_label='REG')
            session.add(label)
        else:
            label.label, label.short_label = 'Nom du registre', 'REG'
        session.commit()
    updated = client.get('/api/v1/organization-network', headers={'X-DaCa-User': 'kassandra.valdata'}).json()
    localized = next(node for node in updated['nodes'] if node['id'] == 'uvek-astra')['localizations']['fr']
    assert localized == {'label': 'Nom du registre', 'code': 'REG', 'description': 'Nom du registre'}
    assert updated['relations'] == graph['relations']
    assert updated['homeId'] == graph['homeId']


def test_home_hierarchy_active_counts_and_existing_neuchatel_relationship(client, session_factory):
    provision(session_factory)
    response = client.get("/api/v1/organization-network", headers={"X-DaCa-User": "kassandra.valdata"})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    graph = response.json()
    assert graph["homeId"] == "efd"
    nodes = {n["id"]: n for n in graph["nodes"]}
    assert nodes["efd-estv"]["parentId"] == "efd"
    assert nodes["efd-estv-bi"]["parentId"] == "efd-estv"
    assert nodes["efd-estv-bi"]["productCount"] == 0
    assert nodes["efd"]["productCount"] >= nodes["efd-estv"]["productCount"] > 0
    ne = next(n for n in nodes.values() if n["label"] == "Kanton Neuchâtel")
    assert any(e["sourceId"] == ne["id"] and e["targetId"] == "efd-estv" and "catalog" in e["evidence"] for e in graph["relations"])
    sg = next(n for n in nodes.values() if n["label"] == "Kanton St. Gallen")
    assert any(e["sourceId"] == "efd-estv" and e["targetId"] == sg["id"] and e["evidence"] == ["published-policy"] for e in graph["relations"])
    assert {"context:cantons", "context:banks", "context:public"}.issubset(graph["satelliteIds"])
    assert all("requesterId" not in edge and "userId" not in edge for edge in graph["relations"])


def test_offering_and_consumption_are_independent_unique_visible_products(session_factory):
    provision(session_factory)
    with session_factory() as session:
        estv = session.get(DataProduct, ESTV_PRODUCT_ID)
        ne_a = session.get(DataProduct, UUID("14444444-4444-4444-8444-444444444444"))
        ne_b = session.get(DataProduct, UUID("17777777-7777-4777-8777-777777777777"))
        efv = session.get(DataProduct, UUID("15555555-5555-4555-8555-555555555555"))
        selected = {product.id for product in (estv, ne_a, ne_b, efv)}
        for product in session.scalars(select(DataProduct)):
            product.lifecycle = "active" if product.id in selected else "draft"
            product.extra_metadata = {}
            if product.id != ESTV_PRODUCT_ID:
                product.active_policy_revision = None
        for edge in session.scalars(select(LineageEdge)):
            edge.state = "deprecated"
        # Multiple people and a published policy still represent one source product.
        estv.extra_metadata = {"catalogUsage": {
            "consumerUserIds": ["beat.stalder", "sarah.brunner", "noemie.rochat"],
            "sharedWithUserIds": ["beat.stalder"], "requestedByUserIds": ["giuseppe.starwars"],
        }}
        ne_a.extra_metadata = {"catalogUsage": {"consumerUserIds": ["kassandra.valdata", "joel.ruod"]}}
        ne_b.extra_metadata = {"catalogUsage": {"consumerUserIds": ["kassandra.valdata"]}}
        for source, target, state in ((ne_a, estv, "active"), (ne_a, efv, "active"), (ne_b, efv, "inferred")):
            session.add(LineageEdge(id=uuid4(), source_urn=source.urn, target_urn=target.urn, state=state, relation_type="derived-from"))
        session.flush()
        graph = organization_network(session, "kassandra.valdata")
        nodes = {node["id"]: node for node in graph["nodes"]}
        sg = next(node for node in nodes.values() if node["label"] == "Kanton St. Gallen")
        ne = next(node for node in nodes.values() if node["label"] == "Kanton Neuchâtel")
        # Two products remain two points despite duplicate catalog/lineage evidence.
        relation = next(edge for edge in graph["relations"] if edge["sourceId"] == ne["id"] and edge["targetId"] == "efd-estv")
        assert relation["count"] == 2
        assert (sg["productCount"], sg["consumedProductCount"]) == (0, 1)
        assert (ne["productCount"], ne["consumedProductCount"]) == (2, 1)
        assert (nodes["efd-estv"]["productCount"], nodes["efd-estv"]["consumedProductCount"]) == (1, 2)
        assert nodes["efd-estv-bi"]["directConsumedProductCount"] == 1
        assert nodes["efd-efv"]["consumedProductCount"] == 1  # Inference alone is not consumption.
        assert nodes["efd"]["consumedProductCount"] == 2  # Not ESTV + BI + EFV counts added up.
        assert nodes["context:cantons"]["consumedProductCount"] == 1
        assert nodes["vbs-armasuisse"]["consumedProductCount"] == 0  # A request alone is not consumption.
        ne_b.discoverable = False
        session.flush()
        visible = {node["id"]: node for node in organization_network(session, "christian.spider")["nodes"]}
        assert visible["efd-estv"]["consumedProductCount"] == 1
        assert visible[ne["id"]]["productCount"] == 1


def test_private_and_inactive_products_do_not_leak_counts_or_relationships(client, session_factory):
    provision(session_factory)
    hidden_keys = set()
    with session_factory() as session:
        for product in session.scalars(select(DataProduct).where(DataProduct.owner_user_id == "noemie.rochat")):
            product.discoverable = False
            hidden_keys.add(f"product:{product.id}")
        for product in session.scalars(select(DataProduct).where(DataProduct.owner_user_id != "noemie.rochat")):
            product.lifecycle = "draft"
        session.commit()
    response = client.get("/api/v1/organization-network", headers={"X-DaCa-User": "christian.spider"})
    assert response.status_code == 200, response.text
    graph = response.json()
    ne = next(n for n in graph["nodes"] if n["label"] == "Kanton Neuchâtel")
    assert ne["productCount"] == 0
    assert ne["consumedProductCount"] == 0
    assert all(node["consumedProductCount"] == 0 for node in graph["nodes"])
    assert not any(ne["id"] in (e["sourceId"], e["targetId"]) for e in graph["relations"])
    assert not any(n["id"] == "efd-estv" and n["directProductCount"] for n in graph["nodes"])
    assert not any(hidden_keys & set(item["objectKeys"]) for item in graph["nodes"] + graph["domains"])


def test_search_scopes_cover_models_domains_terms_and_consumption_without_counting_the_scope_itself(session_factory):
    from daca_catalog.modeling_seed import PERSONNEL_DOMAIN_ID, PERSONNEL_MODEL_ID

    provision(session_factory)
    with session_factory() as session:
        seed_zeughaus_product(session)
        graph = organization_network(session, "kassandra.valdata")
        nodes = {item["id"]: item for item in graph["nodes"]}
        domains = {item["id"]: item for item in graph["domains"]}
        model = f"logical:{PERSONNEL_MODEL_ID}"
        domain = f"domain:{PERSONNEL_DOMAIN_ID}"
        assert model in nodes["vbs-verteidigung"]["objectKeys"]
        assert model in nodes["vbs"]["objectKeys"]
        assert domain in nodes["vbs-verteidigung"]["objectKeys"]
        # A domain keeps its explicit office when its owner's home office differs.
        assert domain not in nodes["vbs-gs"]["objectKeys"]
        assigned = domains[str(PERSONNEL_DOMAIN_ID)]["objectKeys"]
        assert "organization:vbs-verteidigung" in assigned
        assert "organization:vbs" not in assigned
        assert domain not in assigned
        assert model in assigned
        assert any(key.startswith("term:") for key in assigned)
        assert f"product:{PRODUCT_ID}" in nodes["vbs-armasuisse"]["objectKeys"]
        assert not nodes["vbs-babs"]["objectKeys"]


def test_search_scopes_never_include_physical_tables_after_source_access_was_returned(session_factory):
    from daca_catalog.modeling_seed import VIBDBU_PHYSICAL_SOURCE_ID
    from daca_catalog.models import (
        PhysicalDatabase,
        PhysicalSchema,
        PhysicalSchemaSnapshot,
        PhysicalSourceAccessState,
        PhysicalTable,
    )

    provision(session_factory)
    with session_factory() as session:
        before = organization_network(session, "christian.man")
        table_ids = session.scalars(select(PhysicalTable.id).join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id).join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id).join(PhysicalSchemaSnapshot, PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id).where(PhysicalSchemaSnapshot.source_id == VIBDBU_PHYSICAL_SOURCE_ID))
        keys = {f"table:{identity}" for identity in table_ids}
        assert any(keys & set(item["objectKeys"]) for item in before["nodes"])
        session.add(PhysicalSourceAccessState(source_id=VIBDBU_PHYSICAL_SOURCE_ID, user_id="christian.man", relinquished_at=utc_now()))
        session.flush()
        after = organization_network(session, "christian.man")
        assert not any(keys & set(item["objectKeys"]) for item in after["nodes"] + after["domains"])


def test_expired_primary_scope_has_no_directory_fallback_and_seed_preserves_edits(client, session_factory):
    provision(session_factory)
    with session_factory() as session:
        memberships = list(session.scalars(select(FederalPersonMembership).where(FederalPersonMembership.user_id == "kassandra.valdata", FederalPersonMembership.is_primary.is_(True))))
        if not memberships:
            session.add(FederalPersonMembership(id=uuid4(), user_id="kassandra.valdata", organization_id="efd-estv", is_primary=True, valid_from=utc_now().date() - timedelta(days=20), valid_to=utc_now().date() - timedelta(days=1)))
        else:
            for membership in memberships:
                membership.valid_from = utc_now().date() - timedelta(days=20)
                membership.valid_to = utc_now().date() - timedelta(days=1)
        session.get(AdministrativeOrganization, "efd-estv-bi").active = False
        session.commit()
        seed_organization_explorer(session)
        session.commit()
    response = client.get("/api/v1/organization-network", headers={"X-DaCa-User": "kassandra.valdata"})
    assert response.status_code == 200, response.text
    assert response.json()["homeId"] is None
    assert not any(n["id"] == "efd-estv-bi" for n in response.json()["nodes"])
    assert client.get("/api/v1/organization-network", headers={"X-DaCa-User": "unknown-person"}).status_code == 401


def test_policy_projection_requires_current_allow_and_trusted_directory_and_deduplicates(session_factory):
    provision(session_factory)
    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        policy = session.scalar(select(PolicyRevision).where(PolicyRevision.data_product_id == product.id))
        original = policy.definition
        sg_id = next(node["id"] for node in organization_network(session, "kassandra.valdata")["nodes"] if node["label"] == "Kanton St. Gallen")

        def edges():
            session.flush()
            return [edge for edge in organization_network(session, "kassandra.valdata")["relations"] if edge["sourceId"] == "efd-estv" and edge["targetId"] == sg_id]

        assert len(edges()) == 1
        for invalid in ({**original, "effect": "deny"}, {"effect": "allow", "subjects": []},
                        {**original, "resources": {"productUrns": ["urn:other"], "owners": ["ESTV"]}},
                        {**original, "subjects": {"userIds": ["unknown-kanton"]}},
                        {**original, "grants": [{"subject": {"type": "person", "id": "beat.stalder"}, "protocols": ["http"], "validFrom": "2020-01-01", "validUntil": "2020-12-31"}]}):
            policy.definition = invalid
            assert edges() == []
        policy.definition = original
        policy.status = "draft"
        assert edges() == []
        policy.status = "published"
        group = session.get(IdentityGroup, "kanton-st-gallen")
        group.active = False
        assert edges() == []
        group.active = True
        group.system_managed = False
        assert edges() == []
        group.system_managed = True
        product.active_policy_revision = 999
        assert edges() == []
        product.active_policy_revision = policy.revision
        today = utc_now().date()
        grant = {"subject": {"type": "person", "id": "beat.stalder"}, "protocols": ["http"],
                 "validFrom": (today - timedelta(days=1)).isoformat(),
                 "validUntil": (today + timedelta(days=1)).isoformat()}
        policy.definition = {**original, "subjects": {}, "grants": [grant]}
        assert len(edges()) == 1
        policy.definition = {**original, "grants": [{**grant, "subject": {"type": "machine", "id": "svc-estv-cantonal-tax-dashboard"}}]}
        assert edges() == []  # Old unbound request/label is not machine ownership evidence.
        group_grant = {**grant, "subject": {"type": "group", "id": group.id},
                       "groupSnapshot": {"groupId": group.id, "membershipRevision": group.membership_revision, "memberIds": ["beat.stalder"]}}
        policy.definition = {**original, "grants": [group_grant]}
        assert len(edges()) == 1
        policy.definition = {**original, "grants": [{**group_grant, "groupSnapshot": None}]}
        assert edges() == []  # A stale legacy selector cannot rescue an incomplete grant.
        policy.definition = original
        product.extra_metadata = {**product.extra_metadata, "catalogUsage": {"consumerUserIds": ["beat.stalder", "sarah.brunner"], "sharedWithUserIds": ["beat.stalder"]}}
        relation = edges()[0]
        assert relation["count"] == 1
        assert relation["evidence"] == ["catalog", "published-policy"]
        sg = next(node for node in organization_network(session, "kassandra.valdata")["nodes"] if node["id"] == sg_id)
        assert sg["consumedProductCount"] == 1
        # Requests and private access receipts are not projected into the graph.
        assert set(relation) == {"sourceId", "targetId", "count", "inferred", "evidence"}


def test_zeughaus_fixture_reuses_people_and_preserves_later_edits_and_roles(session_factory):
    provision(session_factory)
    with session_factory() as session:
        roles_before = {user.id: list(user.roles) for user in session.scalars(select(DemoUser))}
        assert seed_zeughaus_product(session)
        product = session.get(DataProduct, PRODUCT_ID)
        assert product.owner_user_id == "beat.stalder"
        assert product.deputy_owner_user_id == "sarah.brunner"
        assert product.extra_metadata["catalogUsage"]["consumerUserIds"] == ["giuseppe.starwars"]
        assert product.active_policy_revision is None and not product.endpoints
        graph = organization_network(session, "christian.spider")
        sg = next(node for node in graph["nodes"] if node["label"] == "Kanton St. Gallen")
        assert sg["directProductCount"] == 1
        assert any(edge["sourceId"] == sg["id"] and edge["targetId"] == "vbs-armasuisse" for edge in graph["relations"])
        assert session.scalar(select(ProvenanceEvent).where(ProvenanceEvent.data_product_id == PRODUCT_ID))
        product.title = "Bearbeitetes Zeughausprodukt"
        product.lifecycle = "retired"
        session.commit()
        assert not seed_zeughaus_product(session)
        assert session.get(DataProduct, PRODUCT_ID).title == "Bearbeitetes Zeughausprodukt"
        assert session.get(DataProduct, PRODUCT_ID).lifecycle == "retired"
        assert {user.id: list(user.roles) for user in session.scalars(select(DemoUser))} == roles_before
