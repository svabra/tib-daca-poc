"""Small RDF boundary for DaCa logical models and DCAT-AP-CH metadata.

The helpers use normative vocabulary IRIs, never mint resources in the I14Y-controlled register
namespace, and keep SHACL field-to-concept links distinct from DCAT dataset metadata.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from types import MappingProxyType
from typing import Any
from typing import Literal as TypingLiteral
from urllib.parse import quote, urlsplit

from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import DCAT, DCTERMS, FOAF, RDF, RDFS, SKOS, XSD

SH = Namespace("http://www.w3.org/ns/shacl#")
VCARD = Namespace("http://www.w3.org/2006/vcard/ns#")
DCATAP = Namespace("http://data.europa.eu/r5r/")
ADMS = Namespace("http://www.w3.org/ns/adms#")
LOCN = Namespace("http://www.w3.org/ns/locn#")
PROV = Namespace("http://www.w3.org/ns/prov#")
SPDX = Namespace("http://spdx.org/rdf/terms#")
GSP = Namespace("http://www.opengis.net/ont/geosparql#")
ODRL = Namespace("http://www.w3.org/ns/odrl/2/")
SCHEMA = Namespace("http://schema.org/")

NORMATIVE_NAMESPACES = MappingProxyType(
    {
        "dcat": str(DCAT),
        "dcatap": str(DCATAP),
        "dct": str(DCTERMS),
        "foaf": str(FOAF),
        "schema": str(SCHEMA),
        "rdf": str(RDF),
        "rdfs": str(RDFS),
        "vcard": str(VCARD),
        "xsd": str(XSD),
        "adms": str(ADMS),
        "skos": str(SKOS),
        "locn": str(LOCN),
        "prov": str(PROV),
        "spdx": str(SPDX),
        "gsp": str(GSP),
        "odrl": str(ODRL),
        "sh": str(SH),
    }
)

RdfFormat = TypingLiteral["turtle", "json-ld", "xml"]
_I14Y_REGISTER_PREFIX = "https://register.ld.admin.ch/i14y/"


class RdfMetadataError(ValueError):
    """Raised when graph input or metadata cannot be represented safely."""


def bind_namespaces(graph: Graph) -> Graph:
    for prefix, iri in NORMATIVE_NAMESPACES.items():
        graph.bind(prefix, Namespace(iri), replace=True)
    return graph


def _daca_owned_uri(value: str, *, field_name: str) -> URIRef:
    if not value.startswith("urn:daca:"):
        raise RdfMetadataError(f"{field_name} must use a stable urn:daca:* identifier")
    if value.startswith(_I14Y_REGISTER_PREFIX):  # defensive if ownership rules are relaxed later
        raise RdfMetadataError("DaCa must not mint resources in the I14Y register namespace")
    return URIRef(value)


def _external_uri(value: str | None, *, field_name: str) -> URIRef | None:
    if value is None:
        return None
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https", "urn", "mailto"}:
        raise RdfMetadataError(f"{field_name} must be an HTTP(S), mailto, or URN IRI")
    return URIRef(value)


def _add_language_map(
    graph: Graph,
    subject: URIRef | BNode,
    predicate: URIRef,
    values: Mapping[str, str],
) -> None:
    for language, value in sorted(values.items()):
        if not value.strip():
            continue
        graph.add(
            (
                subject,
                predicate,
                Literal(value.strip(), lang=None if language == "und" else language),
            )
        )


def _language_map(graph: Graph, subject: URIRef | BNode, predicate: URIRef) -> dict[str, str]:
    values: dict[str, str] = {}
    for value in graph.objects(subject, predicate):
        if isinstance(value, Literal):
            values.setdefault(value.language or "und", str(value))
    return values


def _first_text(graph: Graph, subject: URIRef | BNode, predicate: URIRef) -> str | None:
    value = next(graph.objects(subject, predicate), None)
    return str(value) if value is not None else None


def _first_python(graph: Graph, subject: URIRef | BNode, predicate: URIRef) -> Any:
    value = next(graph.objects(subject, predicate), None)
    return value.toPython() if isinstance(value, Literal) else None


def _integer(graph: Graph, subject: URIRef | BNode, predicate: URIRef) -> int | None:
    value = _first_python(graph, subject, predicate)
    try:
        return int(value) if value is not None else None
    except TypeError, ValueError:
        return None


def _decimal(graph: Graph, subject: URIRef | BNode, predicate: URIRef) -> Decimal | None:
    value = _first_python(graph, subject, predicate)
    try:
        return Decimal(str(value)) if value is not None else None
    except TypeError, ValueError:
        return None


@dataclass(frozen=True, slots=True)
class ShaclPropertyDefinition:
    shape_uri: str
    path_uri: str
    name: Mapping[str, str]
    description: Mapping[str, str] = field(default_factory=dict)
    datatype_uri: str | None = None
    association_class_uri: str | None = None
    association_node_uri: str | None = None
    required: bool = False
    repeated: bool = False
    min_count: int | None = None
    max_count: int | None = None
    order: Decimal | int | float | None = None
    pattern: str | None = None
    min_length: int | None = None
    max_length: int | None = None
    min_inclusive: int | float | Decimal | None = None
    max_inclusive: int | float | Decimal | None = None
    concept_uris: tuple[str, ...] = ()
    primary_concept_uri: str | None = None


@dataclass(frozen=True, slots=True)
class ShaclNodeDefinition:
    shape_uri: str
    target_class_uri: str
    label: Mapping[str, str]
    description: Mapping[str, str] = field(default_factory=dict)
    properties: tuple[ShaclPropertyDefinition, ...] = ()
    closed: bool = True
    identifier: str | None = None
    revision: int | None = None


def _exported_concepts(
    definition: ShaclPropertyDefinition,
    *,
    i14y_compatible: bool,
) -> tuple[str, ...]:
    concepts = tuple(dict.fromkeys(definition.concept_uris))
    primary = definition.primary_concept_uri
    if primary is not None and primary not in concepts:
        raise RdfMetadataError("primary_concept_uri must also occur in concept_uris")
    if not i14y_compatible:
        return concepts
    if len(concepts) <= 1:
        return concepts
    if primary is None:
        raise RdfMetadataError(
            "I14Y-compatible SHACL export needs one primary concept when a field has many"
        )
    return (primary,)


def build_shacl_graph(
    nodes: Sequence[ShaclNodeDefinition],
    *,
    i14y_compatible: bool = False,
) -> Graph:
    """Build deterministic SHACL for one or more logical classes.

    DaCa may retain multiple semantic references internally.  I14Y currently documents
    ``dct:conformsTo`` with cardinality 0..1 on a property, so compatible exports emit only the
    explicitly primary concept.
    """

    graph = bind_namespaces(Graph())
    for node_definition in nodes:
        node = _daca_owned_uri(node_definition.shape_uri, field_name="shape_uri")
        target = _daca_owned_uri(
            node_definition.target_class_uri,
            field_name="target_class_uri",
        )
        graph.add((node, RDF.type, SH.NodeShape))
        graph.add((node, SH.targetClass, target))
        graph.add((node, SH.closed, Literal(node_definition.closed)))
        _add_language_map(graph, node, RDFS.label, node_definition.label)
        _add_language_map(graph, node, DCTERMS.description, node_definition.description)
        if node_definition.identifier:
            graph.add((node, DCTERMS.identifier, Literal(node_definition.identifier)))
        if node_definition.revision is not None:
            graph.add((node, DCTERMS.hasVersion, Literal(node_definition.revision)))

        for definition in sorted(
            node_definition.properties,
            key=lambda item: (
                Decimal(str(item.order)) if item.order is not None else Decimal("Infinity"),
                item.path_uri,
            ),
        ):
            prop = _daca_owned_uri(definition.shape_uri, field_name="property shape_uri")
            path = _external_uri(definition.path_uri, field_name="path_uri")
            if path is None:  # pragma: no cover - non-optional type plus validation
                raise RdfMetadataError("path_uri is required")
            graph.add((prop, RDF.type, SH.PropertyShape))
            graph.add((node, SH.property, prop))
            graph.add((prop, SH.path, path))
            _add_language_map(graph, prop, SH.name, definition.name)
            _add_language_map(graph, prop, SH.description, definition.description)
            if definition.datatype_uri:
                graph.add(
                    (
                        prop,
                        SH.datatype,
                        _external_uri(definition.datatype_uri, field_name="datatype_uri"),
                    )
                )
            if definition.association_class_uri:
                graph.add(
                    (
                        prop,
                        SH["class"],
                        _external_uri(
                            definition.association_class_uri,
                            field_name="association_class_uri",
                        ),
                    )
                )
            if definition.association_node_uri:
                graph.add(
                    (
                        prop,
                        SH.node,
                        _external_uri(
                            definition.association_node_uri,
                            field_name="association_node_uri",
                        ),
                    )
                )
            min_count = (
                definition.min_count
                if definition.min_count is not None
                else (1 if definition.required else 0)
            )
            max_count = (
                definition.max_count
                if definition.max_count is not None
                else (None if definition.repeated else 1)
            )
            if min_count < 0 or (max_count is not None and max_count < min_count):
                raise RdfMetadataError("SHACL min_count/max_count cardinality is inconsistent")
            graph.add((prop, SH.minCount, Literal(min_count)))
            if max_count is not None:
                graph.add((prop, SH.maxCount, Literal(max_count)))
            if definition.order is not None:
                graph.add((prop, SH.order, Literal(Decimal(str(definition.order)))))
            for predicate, value in (
                (SH.pattern, definition.pattern),
                (SH.minLength, definition.min_length),
                (SH.maxLength, definition.max_length),
                (SH.minInclusive, definition.min_inclusive),
                (SH.maxInclusive, definition.max_inclusive),
            ):
                if value is not None:
                    graph.add((prop, predicate, Literal(value)))
            for concept_uri in _exported_concepts(
                definition,
                i14y_compatible=i14y_compatible,
            ):
                graph.add(
                    (
                        prop,
                        DCTERMS.conformsTo,
                        _external_uri(concept_uri, field_name="concept_uri"),
                    )
                )
    return graph


def serialize_shacl(
    nodes: Sequence[ShaclNodeDefinition],
    *,
    rdf_format: RdfFormat = "turtle",
    i14y_compatible: bool = False,
) -> bytes:
    graph = build_shacl_graph(nodes, i14y_compatible=i14y_compatible)
    serialized = graph.serialize(format=rdf_format, encoding="utf-8")
    return serialized if isinstance(serialized, bytes) else serialized.encode("utf-8")


@dataclass(frozen=True, slots=True)
class ParsedPropertyShape:
    shape_uri: str
    path_uri: str | None
    name: dict[str, str]
    description: dict[str, str]
    datatype_uri: str | None
    association_class_uri: str | None
    association_node_uri: str | None
    min_count: int | None
    max_count: int | None
    order: Decimal | None
    pattern: str | None
    min_length: int | None
    max_length: int | None
    min_inclusive: Decimal | None
    max_inclusive: Decimal | None
    concept_uris: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ParsedNodeShape:
    shape_uri: str
    target_class_uri: str | None
    label: dict[str, str]
    description: dict[str, str]
    closed: bool | None
    created: str | None
    modified: str | None
    properties: tuple[ParsedPropertyShape, ...]


@dataclass(frozen=True, slots=True)
class ParsedShaclDocument:
    node_shapes: tuple[ParsedNodeShape, ...]
    triple_count: int


def _detect_rdf_format(
    content: bytes | str,
    *,
    rdf_format: str | None,
    content_type: str | None,
) -> RdfFormat:
    requested = (rdf_format or "").casefold().replace("_", "-")
    media_type = (content_type or "").partition(";")[0].strip().casefold()
    aliases: dict[str, RdfFormat] = {
        "ttl": "turtle",
        "turtle": "turtle",
        "text/turtle": "turtle",
        "jsonld": "json-ld",
        "json-ld": "json-ld",
        "application/ld+json": "json-ld",
        "rdf": "xml",
        "rdf/xml": "xml",
        "xml": "xml",
        "application/rdf+xml": "xml",
    }
    if requested in aliases:
        return aliases[requested]
    if media_type in aliases:
        return aliases[media_type]
    prefix = (
        content[:200].decode("utf-8-sig", errors="ignore")
        if isinstance(content, bytes)
        else content[:200]
    )
    stripped = prefix.lstrip()
    if stripped.startswith(("{", "[")):
        return "json-ld"
    if stripped.startswith("<?xml") or "<rdf:RDF" in stripped:
        return "xml"
    return "turtle"


def parse_graph(
    content: bytes | str,
    *,
    rdf_format: str | None = None,
    content_type: str | None = None,
    max_bytes: int = 5_000_000,
) -> Graph:
    size = len(content if isinstance(content, bytes) else content.encode("utf-8"))
    if size > max_bytes:
        raise RdfMetadataError(f"RDF input exceeds the {max_bytes}-byte safety limit")
    selected_format = _detect_rdf_format(
        content,
        rdf_format=rdf_format,
        content_type=content_type,
    )
    graph = bind_namespaces(Graph())
    try:
        graph.parse(data=content, format=selected_format)
    except Exception as exc:  # rdflib parsers expose several format-specific exception classes
        raise RdfMetadataError(f"Invalid {selected_format} RDF document") from exc
    return graph


def parse_shacl_document(
    content: bytes | str,
    *,
    rdf_format: str | None = None,
    content_type: str | None = None,
) -> ParsedShaclDocument:
    graph = parse_graph(content, rdf_format=rdf_format, content_type=content_type)
    parsed_nodes: list[ParsedNodeShape] = []
    for node in sorted(graph.subjects(RDF.type, SH.NodeShape), key=str):
        properties: list[ParsedPropertyShape] = []
        for prop in graph.objects(node, SH.property):
            concept_uris = tuple(
                sorted(str(value) for value in graph.objects(prop, DCTERMS.conformsTo))
            )
            properties.append(
                ParsedPropertyShape(
                    shape_uri=str(prop),
                    path_uri=_first_text(graph, prop, SH.path),
                    name=_language_map(graph, prop, SH.name),
                    description=_language_map(graph, prop, SH.description),
                    datatype_uri=_first_text(graph, prop, SH.datatype),
                    association_class_uri=_first_text(graph, prop, SH["class"]),
                    association_node_uri=_first_text(graph, prop, SH.node),
                    min_count=_integer(graph, prop, SH.minCount),
                    max_count=_integer(graph, prop, SH.maxCount),
                    order=_decimal(graph, prop, SH.order),
                    pattern=_first_text(graph, prop, SH.pattern),
                    min_length=_integer(graph, prop, SH.minLength),
                    max_length=_integer(graph, prop, SH.maxLength),
                    min_inclusive=_decimal(graph, prop, SH.minInclusive),
                    max_inclusive=_decimal(graph, prop, SH.maxInclusive),
                    concept_uris=concept_uris,
                )
            )
        properties.sort(
            key=lambda item: (
                item.order if item.order is not None else Decimal("Infinity"),
                item.path_uri or item.shape_uri,
            )
        )
        closed = _first_python(graph, node, SH.closed)
        parsed_nodes.append(
            ParsedNodeShape(
                shape_uri=str(node),
                target_class_uri=_first_text(graph, node, SH.targetClass),
                label=_language_map(graph, node, RDFS.label),
                description=_language_map(graph, node, DCTERMS.description),
                closed=closed if isinstance(closed, bool) else None,
                created=_first_text(graph, node, DCTERMS.created),
                modified=_first_text(graph, node, DCTERMS.modified),
                properties=tuple(properties),
            )
        )
    return ParsedShaclDocument(node_shapes=tuple(parsed_nodes), triple_count=len(graph))


@dataclass(frozen=True, slots=True)
class DcatContactPointDefinition:
    uri: str
    name: str
    email: str | None = None


@dataclass(frozen=True, slots=True)
class DcatDistributionDefinition:
    uri: str
    title: Mapping[str, str] = field(default_factory=dict)
    description: Mapping[str, str] = field(default_factory=dict)
    access_url: str | None = None
    download_url: str | None = None
    media_type: str | None = None
    format_uri: str | None = None
    license_uri: str | None = None


@dataclass(frozen=True, slots=True)
class DcatDataServiceDefinition:
    uri: str
    title: Mapping[str, str] = field(default_factory=dict)
    endpoint_url: str = ""
    endpoint_description_uri: str | None = None
    serves_dataset_uris: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class DcatDatasetDefinition:
    uri: str
    identifiers: tuple[str, ...]
    title: Mapping[str, str]
    description: Mapping[str, str]
    publisher_uri: str
    contact_points: tuple[DcatContactPointDefinition, ...]
    distributions: tuple[DcatDistributionDefinition, ...] = ()
    data_services: tuple[DcatDataServiceDefinition, ...] = ()
    themes: tuple[str, ...] = ()
    conforms_to: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    landing_pages: tuple[str, ...] = ()
    access_rights_uri: str | None = None
    created: date | datetime | None = None
    issued: date | datetime | None = None
    modified: date | datetime | None = None


def _require_dataset_metadata(dataset: DcatDatasetDefinition) -> None:
    if not dataset.identifiers or not all(item.strip() for item in dataset.identifiers):
        raise RdfMetadataError("DCAT-AP-CH dataset requires at least one identifier")
    if not any(value.strip() for value in dataset.title.values()):
        raise RdfMetadataError("DCAT-AP-CH dataset requires at least one title")
    if not any(value.strip() for value in dataset.description.values()):
        raise RdfMetadataError("DCAT-AP-CH dataset requires at least one description")
    if not dataset.publisher_uri:
        raise RdfMetadataError("DCAT-AP-CH dataset requires exactly one publisher")
    if not dataset.contact_points:
        raise RdfMetadataError("DCAT-AP-CH dataset requires at least one contact point")


def _media_type_uri(media_type: str) -> URIRef:
    if "/" not in media_type or any(character.isspace() for character in media_type):
        raise RdfMetadataError("media_type must be an IANA-style type/subtype")
    return URIRef(f"https://www.iana.org/assignments/media-types/{quote(media_type, safe='/+-._')}")


def build_dcat_dataset_graph(dataset: DcatDatasetDefinition) -> Graph:
    """Build the mandatory DCAT-AP-CH dataset core; distributions remain legitimately optional."""

    _require_dataset_metadata(dataset)
    graph = bind_namespaces(Graph())
    resource = _daca_owned_uri(dataset.uri, field_name="dataset uri")
    publisher = _external_uri(dataset.publisher_uri, field_name="publisher_uri")
    graph.add((resource, RDF.type, DCAT.Dataset))
    graph.add((resource, DCTERMS.publisher, publisher))
    for identifier in dataset.identifiers:
        graph.add((resource, DCTERMS.identifier, Literal(identifier.strip())))
    _add_language_map(graph, resource, DCTERMS.title, dataset.title)
    _add_language_map(graph, resource, DCTERMS.description, dataset.description)
    for concept_uri in dataset.conforms_to:
        graph.add(
            (
                resource,
                DCTERMS.conformsTo,
                _external_uri(concept_uri, field_name="conforms_to"),
            )
        )
    for theme in dataset.themes:
        graph.add((resource, DCAT.theme, _external_uri(theme, field_name="theme")))
    for keyword in dataset.keywords:
        graph.add((resource, DCAT.keyword, Literal(keyword)))
    for landing_page in dataset.landing_pages:
        graph.add(
            (
                resource,
                DCAT.landingPage,
                _external_uri(landing_page, field_name="landing_page"),
            )
        )
    if dataset.access_rights_uri:
        graph.add(
            (
                resource,
                DCTERMS.accessRights,
                _external_uri(dataset.access_rights_uri, field_name="access_rights_uri"),
            )
        )
    if dataset.created is not None:
        graph.add((resource, DCTERMS.created, Literal(dataset.created)))
    if dataset.issued is not None:
        graph.add((resource, DCTERMS.issued, Literal(dataset.issued)))
    if dataset.modified is not None:
        graph.add((resource, DCTERMS.modified, Literal(dataset.modified)))

    for contact in dataset.contact_points:
        contact_uri = _external_uri(contact.uri, field_name="contact uri")
        if contact_uri is None:  # pragma: no cover - dataclass contract keeps this defensive
            raise RdfMetadataError("contact point requires an email or URI")
        graph.add((resource, DCAT.contactPoint, contact_uri))
        graph.add((contact_uri, RDF.type, VCARD.Kind))
        graph.add((contact_uri, VCARD.fn, Literal(contact.name)))
        if contact.email is not None:
            email = contact.email.removeprefix("mailto:").strip()
            if not email or "@" not in email:
                raise RdfMetadataError("contact email must be a monitored email address")
            graph.add((contact_uri, VCARD.hasEmail, URIRef(f"mailto:{email}")))

    for distribution in dataset.distributions:
        dist = _daca_owned_uri(distribution.uri, field_name="distribution uri")
        graph.add((resource, DCAT.distribution, dist))
        graph.add((dist, RDF.type, DCAT.Distribution))
        _add_language_map(graph, dist, DCTERMS.title, distribution.title)
        _add_language_map(graph, dist, DCTERMS.description, distribution.description)
        if distribution.access_url:
            graph.add(
                (
                    dist,
                    DCAT.accessURL,
                    _external_uri(distribution.access_url, field_name="access_url"),
                )
            )
        if distribution.download_url:
            graph.add(
                (
                    dist,
                    DCAT.downloadURL,
                    _external_uri(distribution.download_url, field_name="download_url"),
                )
            )
        if distribution.media_type:
            graph.add((dist, DCAT.mediaType, _media_type_uri(distribution.media_type)))
        if distribution.format_uri:
            graph.add(
                (
                    dist,
                    DCTERMS.format,
                    _external_uri(distribution.format_uri, field_name="format_uri"),
                )
            )
        if distribution.license_uri:
            graph.add(
                (
                    dist,
                    DCTERMS.license,
                    _external_uri(distribution.license_uri, field_name="license_uri"),
                )
            )

    for data_service in dataset.data_services:
        service = _daca_owned_uri(data_service.uri, field_name="data service uri")
        endpoint_url = _external_uri(
            data_service.endpoint_url,
            field_name="endpoint_url",
        )
        if endpoint_url is None:  # pragma: no cover - required dataclass value
            raise RdfMetadataError("A DCAT data service requires an endpoint URL")
        graph.add((service, RDF.type, DCAT.DataService))
        graph.add((service, DCAT.endpointURL, endpoint_url))
        _add_language_map(graph, service, DCTERMS.title, data_service.title)
        if data_service.endpoint_description_uri:
            graph.add(
                (
                    service,
                    DCAT.endpointDescription,
                    _external_uri(
                        data_service.endpoint_description_uri,
                        field_name="endpoint_description_uri",
                    ),
                )
            )
        served_dataset_uris = data_service.serves_dataset_uris or (dataset.uri,)
        for served_dataset_uri in served_dataset_uris:
            graph.add(
                (
                    service,
                    DCAT.servesDataset,
                    _external_uri(
                        served_dataset_uri,
                        field_name="serves_dataset_uri",
                    ),
                )
            )
    return graph


def serialize_dcat_dataset(
    dataset: DcatDatasetDefinition,
    *,
    rdf_format: RdfFormat = "turtle",
) -> bytes:
    serialized = build_dcat_dataset_graph(dataset).serialize(
        format=rdf_format,
        encoding="utf-8",
    )
    return serialized if isinstance(serialized, bytes) else serialized.encode("utf-8")


@dataclass(frozen=True, slots=True)
class ParsedDcatDataset:
    uri: str
    identifiers: tuple[str, ...]
    title: dict[str, str]
    description: dict[str, str]
    publisher_uri: str | None
    contact_point_uris: tuple[str, ...]
    distribution_uris: tuple[str, ...]
    data_service_uris: tuple[str, ...]
    theme_uris: tuple[str, ...]
    conforms_to: tuple[str, ...]
    created: str | None
    issued: str | None
    modified: str | None


def parse_dcat_datasets(
    content: bytes | str,
    *,
    rdf_format: str | None = None,
    content_type: str | None = None,
) -> tuple[ParsedDcatDataset, ...]:
    graph = parse_graph(content, rdf_format=rdf_format, content_type=content_type)
    datasets: list[ParsedDcatDataset] = []
    for resource in sorted(graph.subjects(RDF.type, DCAT.Dataset), key=str):
        datasets.append(
            ParsedDcatDataset(
                uri=str(resource),
                identifiers=tuple(
                    sorted(str(value) for value in graph.objects(resource, DCTERMS.identifier))
                ),
                title=_language_map(graph, resource, DCTERMS.title),
                description=_language_map(graph, resource, DCTERMS.description),
                publisher_uri=_first_text(graph, resource, DCTERMS.publisher),
                contact_point_uris=tuple(
                    sorted(str(value) for value in graph.objects(resource, DCAT.contactPoint))
                ),
                distribution_uris=tuple(
                    sorted(str(value) for value in graph.objects(resource, DCAT.distribution))
                ),
                data_service_uris=tuple(
                    sorted(str(value) for value in graph.subjects(DCAT.servesDataset, resource))
                ),
                theme_uris=tuple(
                    sorted(str(value) for value in graph.objects(resource, DCAT.theme))
                ),
                conforms_to=tuple(
                    sorted(str(value) for value in graph.objects(resource, DCTERMS.conformsTo))
                ),
                created=_first_text(graph, resource, DCTERMS.created),
                issued=_first_text(graph, resource, DCTERMS.issued),
                modified=_first_text(graph, resource, DCTERMS.modified),
            )
        )
    return tuple(datasets)
