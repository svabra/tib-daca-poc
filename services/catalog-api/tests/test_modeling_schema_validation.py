from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

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


def test_logical_model_requires_one_whitespace_free_identifier_and_allows_no_creator() -> None:
    body = {
        "identifiers": ["VBS_model-v1"],
        "identifierMode": "organization_derived",
        "localizations": [{"language": "de", "title": "Identifier-Test", "description": "Prüft Identifier und optionale Erstellerangabe."}],
        "dataOwnerUserId": "christian.spider",
        "dataDomainId": str(uuid.uuid4()),
        "organizationUnitId": "vbs-verteidigung",
        "dataClassification": "internal",
        "dateCreated": "2026-09-15",
        "contactPoints": [{"name": "Data Office", "email": "data@example.test"}],
        "publisher": {"name": "Verteidigung"},
        "accessRights": "urn:daca:access-rights:internal",
        "entities": [{"name": "record", "fields": [{"name": "record_id", "dataType": "xsd:string", "shortDescription": "Testwert."}]}],
    }
    model = LogicalModelWrite.model_validate(body)
    assert model.creator is None
    assert model.identifier_mode == "organization_derived"

    for invalid_identifier in (["two identifiers", "second"], ["contains whitespace"], [" "]):
        invalid = {**body, "identifiers": invalid_identifier}
        with pytest.raises(ValidationError):
            LogicalModelWrite.model_validate(invalid)
