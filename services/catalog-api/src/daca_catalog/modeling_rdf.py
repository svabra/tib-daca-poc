from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    DcatDataService,
    DcatDataServiceVersion,
    DcatDataset,
    DcatDatasetVersion,
    DcatDatasetVersionLocalization,
    DcatDistribution,
    DcatDistributionVersion,
    I14yConcept,
    LogicalConceptLink,
    LogicalEntity,
    LogicalEntityVersion,
    LogicalField,
    LogicalFieldVersion,
    LogicalModel,
    LogicalModelVersion,
)
from .rdf_metadata import (
    DcatContactPointDefinition,
    DcatDataServiceDefinition,
    DcatDatasetDefinition,
    DcatDistributionDefinition,
    ShaclNodeDefinition,
    ShaclPropertyDefinition,
    serialize_dcat_dataset,
    serialize_shacl,
)

_XSD_TYPES = {
    "string": "http://www.w3.org/2001/XMLSchema#string",
    "text": "http://www.w3.org/2001/XMLSchema#string",
    "integer": "http://www.w3.org/2001/XMLSchema#integer",
    "decimal": "http://www.w3.org/2001/XMLSchema#decimal",
    "numeric": "http://www.w3.org/2001/XMLSchema#decimal",
    "boolean": "http://www.w3.org/2001/XMLSchema#boolean",
    "date": "http://www.w3.org/2001/XMLSchema#date",
    "datetime": "http://www.w3.org/2001/XMLSchema#dateTime",
    "timestamp": "http://www.w3.org/2001/XMLSchema#dateTime",
    "time": "http://www.w3.org/2001/XMLSchema#time",
    "uuid": "http://www.w3.org/2001/XMLSchema#string",
}


def _xsd_datatype(value: str) -> str:
    normalized = value.strip()
    if normalized.startswith("http://www.w3.org/2001/XMLSchema#"):
        return normalized
    if normalized.casefold().startswith("xsd:"):
        normalized = normalized.split(":", 1)[1]
    return _XSD_TYPES.get(normalized.casefold(), _XSD_TYPES["string"])


def export_logical_shacl(
    session: Session, model: LogicalModel, version: LogicalModelVersion, rdf_format: str
) -> bytes:
    localizations = list(
        session.scalars(
            select(DcatDatasetVersionLocalization).where(
                DcatDatasetVersionLocalization.dataset_version_id == version.dataset_version_id
            )
        )
    )
    descriptions = {row.language: row.description for row in localizations}
    nodes: list[ShaclNodeDefinition] = []
    entity_rows = session.execute(
        select(LogicalEntityVersion, LogicalEntity)
        .join(LogicalEntity, LogicalEntity.id == LogicalEntityVersion.logical_entity_id)
        .where(LogicalEntityVersion.logical_model_version_id == version.id)
        .order_by(LogicalEntityVersion.position)
    ).all()
    for entity_version, entity in entity_rows:
        properties: list[ShaclPropertyDefinition] = []
        field_rows = session.execute(
            select(LogicalFieldVersion, LogicalField)
            .join(LogicalField, LogicalField.id == LogicalFieldVersion.logical_field_id)
            .where(LogicalFieldVersion.logical_entity_version_id == entity_version.id)
            .order_by(LogicalFieldVersion.position)
        ).all()
        for field_version, field in field_rows:
            concept_links = list(
                session.scalars(
                    select(LogicalConceptLink).where(
                        LogicalConceptLink.logical_field_version_id == field_version.id
                    )
                )
            )
            concept_uris: list[str] = []
            primary_uri = None
            for link in concept_links:
                concept = session.get(I14yConcept, link.concept_id)
                # API detail URLs are provenance, not semantic concept IRIs.
                if concept is None or not concept.register_uri:
                    continue
                concept_uris.append(concept.register_uri)
                if link.primary_for_i14y:
                    primary_uri = concept.register_uri
            field_description = (
                {"de": field_version.short_description} if field_version.short_description else {}
            )
            properties.append(
                ShaclPropertyDefinition(
                    shape_uri=f"{field.urn}:shape",
                    path_uri=field.urn,
                    name={"de": field_version.name},
                    description=field_description,
                    datatype_uri=_xsd_datatype(field_version.data_type),
                    required=field_version.min_count > 0,
                    repeated=field_version.max_count is None or field_version.max_count > 1,
                    min_count=field_version.min_count,
                    max_count=field_version.max_count,
                    order=field_version.position,
                    max_length=field_version.length,
                    concept_uris=tuple(concept_uris),
                    primary_concept_uri=primary_uri,
                )
            )
        nodes.append(
            ShaclNodeDefinition(
                shape_uri=f"{entity.urn}:shape",
                target_class_uri=entity.urn,
                label={"de": entity_version.name},
                description=descriptions,
                properties=tuple(properties),
                closed=True,
                identifier=f"{model.urn}:{entity_version.name}",
                revision=version.revision,
            )
        )
    selected = "turtle" if rdf_format == "ttl" else "json-ld"
    return serialize_shacl(nodes, rdf_format=selected, i14y_compatible=True)


def export_logical_dcat(
    session: Session, model: LogicalModel, version: LogicalModelVersion, rdf_format: str
) -> bytes:
    dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset_version is None:
        raise HTTPException(500, "Logical model has no DCAT dataset version")
    dataset = session.get(DcatDataset, dataset_version.dataset_id)
    if dataset is None:
        raise HTTPException(500, "Logical model has no DCAT dataset")
    localizations = list(
        session.scalars(
            select(DcatDatasetVersionLocalization).where(
                DcatDatasetVersionLocalization.dataset_version_id == dataset_version.id
            )
        )
    )
    distributions = session.execute(
        select(DcatDistributionVersion, DcatDistribution)
        .join(DcatDistribution, DcatDistribution.id == DcatDistributionVersion.distribution_id)
        .where(DcatDistributionVersion.dataset_version_id == dataset_version.id)
    ).all()
    data_services = session.execute(
        select(DcatDataServiceVersion, DcatDataService)
        .join(
            DcatDataService,
            DcatDataService.id == DcatDataServiceVersion.data_service_id,
        )
        .where(DcatDataServiceVersion.dataset_version_id == dataset_version.id)
    ).all()
    publisher = dataset_version.publisher
    publisher_uri = publisher.get("uri") or (
        f"urn:daca:organization:{dataset_version.organization_id}"
    )
    contacts = tuple(
        DcatContactPointDefinition(
            uri=contact.get("uri") or f"{dataset.urn}:contact:{index}",
            name=contact["name"],
            email=contact.get("email"),
        )
        for index, contact in enumerate(dataset_version.contact_points, start=1)
    )
    definition = DcatDatasetDefinition(
        uri=dataset.urn,
        identifiers=tuple(dataset_version.identifiers),
        title={row.language: row.title for row in localizations},
        description={row.language: row.description for row in localizations},
        publisher_uri=publisher_uri,
        contact_points=contacts,
        distributions=tuple(
            DcatDistributionDefinition(
                uri=root.urn,
                title=row.title,
                access_url=row.access_url,
                download_url=row.download_url,
                media_type=row.media_type,
                format_uri=row.format if row.format and ":" in row.format else None,
                license_uri=row.license_uri,
            )
            for row, root in distributions
        ),
        data_services=tuple(
            DcatDataServiceDefinition(
                uri=root.urn,
                title=row.title,
                endpoint_url=row.endpoint_url,
                endpoint_description_uri=row.endpoint_description,
                serves_dataset_uris=tuple(row.serves_dataset_urns),
            )
            for row, root in data_services
        ),
        themes=tuple(dataset_version.themes),
        access_rights_uri=dataset_version.access_rights,
        created=dataset_version.date_created,
        issued=dataset_version.issued,
        modified=dataset_version.modified,
    )
    selected = "turtle" if rdf_format == "ttl" else "json-ld"
    return serialize_dcat_dataset(definition, rdf_format=selected)


def content_type(rdf_format: str) -> str:
    return "text/turtle" if rdf_format == "ttl" else "application/ld+json"
