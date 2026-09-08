from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from daca_catalog.rdf_metadata import (
    NORMATIVE_NAMESPACES,
    DcatContactPointDefinition,
    DcatDatasetDefinition,
    DcatDistributionDefinition,
    RdfMetadataError,
    ShaclNodeDefinition,
    ShaclPropertyDefinition,
    parse_dcat_datasets,
    parse_graph,
    parse_shacl_document,
    serialize_dcat_dataset,
    serialize_shacl,
)
from rdflib import URIRef
from rdflib.compare import isomorphic
from rdflib.namespace import DCAT, RDF

FIXTURES = Path(__file__).parent / "fixtures" / "i14y"
LEGAL_FORM = "https://register.ld.admin.ch/i14y/concept/legalForm/version/1.2.0"


def test_real_i14y_turtle_excerpt_parses_node_property_order_and_concept_links():
    content = (FIXTURES / "dataset-structure-ce087cbd-excerpt.ttl").read_bytes()

    document = parse_shacl_document(content, content_type="text/turtle; charset=utf-8")

    assert len(document.node_shapes) == 1
    node = document.node_shapes[0]
    assert node.label == {"de": "Firmen nach Zweck, Rechtsform und Standort"}
    assert node.closed is True
    assert [prop.name["de"] for prop in node.properties] == [
        "rechtsform_code",
        "rechtsform",
    ]
    assert node.properties[0].order == Decimal(13)
    assert node.properties[0].min_count == 1
    assert node.properties[0].max_count == 1
    assert node.properties[0].concept_uris == (LEGAL_FORM,)


def test_real_i14y_turtle_and_json_ld_structure_exports_are_graph_isomorphic():
    turtle = parse_graph(
        (FIXTURES / "dataset-structure-ce087cbd-excerpt.ttl").read_bytes(),
        content_type="text/turtle",
    )
    json_ld = parse_graph(
        (FIXTURES / "dataset-structure-ce087cbd-excerpt.jsonld").read_bytes(),
        content_type="application/ld+json",
    )

    assert len(turtle) == len(json_ld)
    assert isomorphic(turtle, json_ld)


def _logical_shape() -> ShaclNodeDefinition:
    return ShaclNodeDefinition(
        shape_uri="urn:daca:logical-model:company:revision:3:shape",
        target_class_uri="urn:daca:logical-model:company:record",
        label={"de": "Unternehmen", "en": "Company"},
        identifier="company",
        revision=3,
        properties=(
            ShaclPropertyDefinition(
                shape_uri="urn:daca:logical-field:legal-form:shape",
                path_uri="urn:daca:logical-field:legal-form",
                name={"de": "Rechtsform"},
                datatype_uri="http://www.w3.org/2001/XMLSchema#string",
                required=True,
                min_count=1,
                max_count=3,
                order=1,
                concept_uris=(LEGAL_FORM, "urn:daca:concept:internal-taxonomy"),
                primary_concept_uri=LEGAL_FORM,
            ),
        ),
    )


def test_shacl_roundtrip_preserves_internal_many_concepts_but_i14y_export_selects_primary():
    internal = parse_shacl_document(serialize_shacl([_logical_shape()]))
    compatible = parse_shacl_document(
        serialize_shacl([_logical_shape()], rdf_format="json-ld", i14y_compatible=True),
        content_type="application/ld+json",
    )

    assert internal.node_shapes[0].properties[0].concept_uris == (
        "https://register.ld.admin.ch/i14y/concept/legalForm/version/1.2.0",
        "urn:daca:concept:internal-taxonomy",
    )
    assert compatible.node_shapes[0].properties[0].concept_uris == (LEGAL_FORM,)
    assert compatible.node_shapes[0].target_class_uri == (
        "urn:daca:logical-model:company:record"
    )
    assert compatible.node_shapes[0].properties[0].min_count == 1
    assert compatible.node_shapes[0].properties[0].max_count == 3


def test_i14y_compatible_export_rejects_ambiguous_many_to_many_reference():
    shape = _logical_shape()
    ambiguous = ShaclNodeDefinition(
        shape_uri=shape.shape_uri,
        target_class_uri=shape.target_class_uri,
        label=shape.label,
        properties=(
            ShaclPropertyDefinition(
                shape_uri="urn:daca:logical-field:ambiguous:shape",
                path_uri="urn:daca:logical-field:ambiguous",
                name={"en": "Ambiguous"},
                concept_uris=("urn:daca:concept:a", "urn:daca:concept:b"),
            ),
        ),
    )

    with pytest.raises(RdfMetadataError, match="one primary concept"):
        serialize_shacl([ambiguous], i14y_compatible=True)


def _dataset(*, with_distribution: bool) -> DcatDatasetDefinition:
    distributions = (
        DcatDistributionDefinition(
            uri="urn:daca:distribution:companies-json",
            title={"de": "JSON-Download"},
            download_url="https://data.example.test/companies.json",
            media_type="application/json",
            license_uri="https://creativecommons.org/publicdomain/zero/1.0/",
        ),
    ) if with_distribution else ()
    return DcatDatasetDefinition(
        uri="urn:daca:data-product:companies",
        identifiers=("companies",),
        title={"de": "Unternehmen"},
        description={"de": "Veröffentlichte Unternehmensdaten."},
        publisher_uri="urn:daca:organization:publisher",
        contact_points=(
            DcatContactPointDefinition(
                uri="urn:daca:contact:companies",
                name="Data Office",
                email="data@example.test",
            ),
        ),
        distributions=distributions,
        conforms_to=("urn:daca:logical-model:company:revision:3",),
        themes=("http://publications.europa.eu/resource/authority/data-theme/ECON",),
        created=datetime(2026, 8, 20, tzinfo=UTC),
        issued=datetime(2026, 9, 1, tzinfo=UTC),
        modified=datetime(2026, 9, 5, tzinfo=UTC),
    )


def test_dcat_ap_ch_core_roundtrips_with_and_without_distribution():
    logical_only = parse_dcat_datasets(serialize_dcat_dataset(_dataset(with_distribution=False)))
    published = parse_dcat_datasets(
        serialize_dcat_dataset(_dataset(with_distribution=True), rdf_format="json-ld"),
        content_type="application/ld+json",
    )

    assert logical_only[0].identifiers == ("companies",)
    assert logical_only[0].distribution_uris == ()
    assert logical_only[0].contact_point_uris == ("urn:daca:contact:companies",)
    assert logical_only[0].created == "2026-08-20T00:00:00+00:00"
    assert logical_only[0].issued == "2026-09-01T00:00:00+00:00"
    assert logical_only[0].modified == "2026-09-05T00:00:00+00:00"
    assert published[0].distribution_uris == ("urn:daca:distribution:companies-json",)
    assert published[0].conforms_to == ("urn:daca:logical-model:company:revision:3",)


def test_dcat_contact_point_accepts_uri_without_email_and_serializes_vcard_resource():
    dataset = _dataset(with_distribution=False)
    contact_uri = URIRef("https://example.test/contact/data-office")
    uri_only = DcatDatasetDefinition(
        uri=dataset.uri,
        identifiers=dataset.identifiers,
        title=dataset.title,
        description=dataset.description,
        publisher_uri=dataset.publisher_uri,
        contact_points=(
            DcatContactPointDefinition(
                uri=str(contact_uri),
                name="Data Office",
            ),
        ),
    )

    graph = parse_graph(serialize_dcat_dataset(uri_only), content_type="text/turtle")

    assert (URIRef(dataset.uri), DCAT.contactPoint, contact_uri) in graph
    assert (contact_uri, RDF.type, URIRef("http://www.w3.org/2006/vcard/ns#Kind")) in graph
    assert not list(graph.objects(contact_uri, URIRef("http://www.w3.org/2006/vcard/ns#hasEmail")))


def test_rdf_builder_enforces_daca_ownership_and_dcat_mandatory_contact():
    shape = _logical_shape()
    foreign_shape = ShaclNodeDefinition(
        shape_uri=(
            "https://register.ld.admin.ch/i14y/dataset/example/structure/ExampleShape"
        ),
        target_class_uri=shape.target_class_uri,
        label=shape.label,
    )
    with pytest.raises(RdfMetadataError, match="urn:daca"):
        serialize_shacl([foreign_shape])

    dataset = _dataset(with_distribution=False)
    without_contact = DcatDatasetDefinition(
        uri=dataset.uri,
        identifiers=dataset.identifiers,
        title=dataset.title,
        description=dataset.description,
        publisher_uri=dataset.publisher_uri,
        contact_points=(),
    )
    with pytest.raises(RdfMetadataError, match="contact point"):
        serialize_dcat_dataset(without_contact)


def test_normative_namespace_table_uses_current_dcat_ap_ch_iris():
    assert NORMATIVE_NAMESPACES["dcat"] == "http://www.w3.org/ns/dcat#"
    assert NORMATIVE_NAMESPACES["dcatap"] == "http://data.europa.eu/r5r/"
    assert NORMATIVE_NAMESPACES["dct"] == "http://purl.org/dc/terms/"
    assert NORMATIVE_NAMESPACES["sh"] == "http://www.w3.org/ns/shacl#"
    assert NORMATIVE_NAMESPACES["odrl"] == "http://www.w3.org/ns/odrl/2/"
