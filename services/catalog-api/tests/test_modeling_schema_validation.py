from __future__ import annotations

import uuid

from daca_catalog.modeling_schemas import LogicalModelWrite


def test_logical_model_accepts_omitted_i14y_concepts() -> None:
    model = LogicalModelWrite.model_validate(
        {
            "identifiers": ["MODEL-WITHOUT-I14Y"],
            "localizations": [
                {
                    "language": "de",
                    "title": "Modell ohne I14Y-Verknüpfung",
                    "description": "Ein vollständiger Entwurf ohne optionale I14Y-Auswahl.",
                }
            ],
            "dataOwnerUserId": "christian.spider",
            "creator": {"type": "Application", "applicationName": "Schema-Test"},
            "dataDomainId": str(uuid.uuid4()),
            "organizationUnitId": "vbs-verteidigung",
            "dataClassification": "internal",
            "dateCreated": "2026-09-14",
            "contactPoints": [{"name": "Data Office", "email": "data@example.test"}],
            "publisher": {"name": "Verteidigung"},
            "accessRights": "urn:daca:access-rights:internal",
            "entities": [
                {
                    "name": "mitarbeitende",
                    "businessObject": "Mitarbeitende",
                    "fields": [
                        {
                            "name": "personalnummer",
                            "dataType": "xsd:string",
                            "shortDescription": "Stabile Personalnummer",
                        }
                    ],
                }
            ],
        }
    )

    assert model.concept_ids == []
    field = model.entities[0].fields[0]
    assert field.concept_ids == []
    assert field.primary_concept_id is None
    assert field.value_list_concept_id is None
    assert field.concept_match_explicitly_none is False
