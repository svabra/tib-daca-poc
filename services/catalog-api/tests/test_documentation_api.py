from __future__ import annotations

import uuid

from daca_catalog.modeling_seed import (
    REAL_ESTATE_DOMAIN_ID,
    VIBDBU_PHYSICAL_SOURCE_ID,
    seed_modeling_catalog,
)
from daca_catalog.modeling_service import ensure_dcat_catalog
from daca_catalog.models import (
    CatalogObjectResponsibility,
    DcatCatalogVersion,
    GlossaryTerm,
    GlossaryTermLocalization,
    SiteGlossaryTerm,
    utc_now,
)
from daca_catalog.site_glossary_seed import seed_site_glossary_terms
from sqlalchemy import select


def test_three_responsibility_perspectives_share_persisted_relationships(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        rows = list(session.scalars(select(CatalogObjectResponsibility).where(
            CatalogObjectResponsibility.domain_id == REAL_ESTATE_DOMAIN_ID
        )))
        assert {row.user_id for row in rows} == {"mirjam.keller", "christian.spider", "christian.man"}

    response = client.get("/api/v1/documentation/responsibilities?lang=de", headers={"X-DaCa-User": "christian.man"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert {"people", "objects", "domains"} == set(payload)
    assert {"domain", "logical_model", "physical_representation", "data_product"} <= {
        item["category"] for item in payload["objects"]
    }
    person_ids = {person["id"] for person in payload["people"]}
    domain_ids = {domain["id"] for domain in payload["domains"]}
    for item in payload["objects"]:
        assert set(item["domainIds"]) <= domain_ids
        assert {responsibility["userId"] for responsibility in item["responsibilities"]} <= person_ids
    domain = next(item for item in payload["objects"] if item["id"] == f"domain:{REAL_ESTATE_DOMAIN_ID}")
    assert {row["userId"] for row in domain["responsibilities"]} >= {
        "daniel.wenger", "eliane.rossi", "mirjam.keller", "christian.man", "christian.spider"
    }
    physical = [item for item in payload["objects"] if item["id"].startswith(
        f"physical_representation:{VIBDBU_PHYSICAL_SOURCE_ID}:"
    )]
    assert any("VIBDBU" in item["name"] and any(
        row["userId"] == "christian.man" for row in item["responsibilities"]
    ) for item in physical)
    assert any(str(REAL_ESTATE_DOMAIN_ID) in item["domainIds"] for item in physical)
    assert all(str(REAL_ESTATE_DOMAIN_ID) not in item["domainIds"]
               for item in physical if "tax_statistics" in item["name"])
    assert any(person["id"] == "christian.man" for person in payload["people"])


def test_glossary_tooltip_and_detail_use_the_same_database_term(client, session_factory) -> None:
    with session_factory() as session:
        seed_site_glossary_terms(session)
        seed_site_glossary_terms(session)
        session.commit()

    headers = {"X-DaCa-User": "daca-test-editor"}
    lookup = client.get("/api/v1/documentation/glossary/lookup?term=Data%20Steward&lang=de", headers=headers)
    assert lookup.status_code == 200, lookup.text
    item = lookup.json()
    assert item["term"] == "Data Steward"
    assert item["shortDescription"]
    assert item["detailedDescription"]
    assert item["isTermdat"] is False
    detail = client.get(f"/api/v1/documentation/glossary/{item['id']}?lang=de", headers=headers)
    assert detail.status_code == 200
    assert detail.json() == item
    terms = client.get("/api/v1/documentation/glossary?q=Data%20Steward", headers=headers)
    assert any(row["id"] == item["id"] for row in terms.json())


def test_site_glossary_is_independent_of_business_terminology(client, session_factory) -> None:
    with session_factory() as session:
        seed_site_glossary_terms(session)
        for label in ("Bergepanzer", "Data Steward"):
            term_id = uuid.uuid4()
            session.add(GlossaryTerm(
                id=term_id, urn=f"urn:daca:glossary-term:{term_id}",
                origin_catalog_id="urn:daca:catalog:bit-poc", revision=1,
                content_hash="0" * 64, lifecycle="active", is_termdat=False,
                created_at=utc_now(), updated_at=utc_now(),
            ))
            session.add(GlossaryTermLocalization(
                term_id=term_id, language="de", preferred_label=label,
                alternative_labels=[], definition="Fachlicher Terminologieeintrag.",
                normalized_label=label.casefold(),
            ))
        seed_site_glossary_terms(session)
        session.commit()

    headers = {"X-DaCa-User": "daca-test-editor"}
    listing = client.get("/api/v1/documentation/glossary?lang=de", headers=headers)
    assert listing.status_code == 200
    labels = [row["term"] for row in listing.json()]
    assert "Bergepanzer" not in labels
    assert labels.count("Data Steward") == 1
    owner = next(row for row in listing.json() if row["term"] == "Data Owner")
    steward = next(row for row in listing.json() if row["term"] == "Data Steward")
    daca = next(row for row in listing.json() if row["term"] == "DaCa")
    assert "zentrale Datenkatalog" in daca["shortDescription"]
    for item in (owner, steward):
        assert "Aufgaben:" in item["detailedDescription"]
        assert "Kompetenzen:" in item["detailedDescription"]
        assert "Verantwortung:" in item["detailedDescription"]
        assert item["isTermdat"] is False
    lookup = client.get("/api/v1/documentation/glossary/lookup?term=Data%20Steward", headers=headers)
    assert lookup.status_code == 200
    assert lookup.json()["id"] == steward["id"]
    assert client.get("/api/v1/documentation/glossary/lookup?term=Bergepanzer", headers=headers).status_code == 404
    with session_factory() as session:
        assert session.query(GlossaryTerm).filter_by(lifecycle="active").count() >= 2
        assert session.query(SiteGlossaryTerm).count() == len(labels)
        assert all(
            row.short_description is None and row.detailed_description is None
            for row in session.scalars(select(GlossaryTermLocalization).where(
                GlossaryTermLocalization.preferred_label.in_(["Bergepanzer", "Data Steward"])
            ))
        )


def test_new_dcat_catalog_uses_central_description(session_factory) -> None:
    with session_factory() as session:
        catalog = ensure_dcat_catalog(session)
        version = session.scalar(select(DcatCatalogVersion).where(
            DcatCatalogVersion.catalog_id == catalog.id,
            DcatCatalogVersion.revision == catalog.revision,
        ))
        assert version is not None
        assert "Zentraler Datenkatalog" in version.description["de"]
        assert "Central data catalog" in version.description["en"]
