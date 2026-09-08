from __future__ import annotations

import asyncio

import pytest
from daca_catalog.i14y_publication import (
    DisabledI14YPublicationAdapter,
    I14YPublicationDisabled,
    I14YPublicationPackage,
    I14YPublicationPort,
)
from daca_catalog.modeling_schemas import (
    InternalOrganisationCreator,
    LogicalModelResponse,
)
from daca_catalog.modeling_seed import VEHICLE_MODEL_ID, seed_modeling_catalog
from pydantic import ValidationError


def test_logical_response_creator_is_a_discriminated_union(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)

    response = client.get(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}",
        headers={"X-DaCa-User": "christian.man"},
    )
    assert response.status_code == 200, response.text

    parsed = LogicalModelResponse.model_validate(response.json())
    assert isinstance(parsed.creator, InternalOrganisationCreator)
    assert parsed.creator.organization_id == "vbs-verteidigung"

    creator_schema = LogicalModelResponse.model_json_schema()["properties"]["creator"]
    assert creator_schema["discriminator"]["propertyName"] == "type"
    assert set(creator_schema["discriminator"]["mapping"]) == {
        "Application",
        "ExternalOrganisationOrPerson",
        "InternalOrganisation",
        "InternalPerson",
    }
    invalid = {**response.json(), "creator": {"type": "UnknownCreator"}}
    with pytest.raises(ValidationError):
        LogicalModelResponse.model_validate(invalid)


def test_i14y_publication_port_is_separate_and_disabled_by_default(client) -> None:
    port = client.app.state.i14y_publication_port

    assert isinstance(port, I14YPublicationPort)
    assert isinstance(port, DisabledI14YPublicationAdapter)
    assert port is not client.app.state.i14y_client
    assert port.enabled is False
    assert not hasattr(port, "base_url")
    assert not hasattr(port, "_client")

    package = I14YPublicationPackage(
        resource_urn="urn:daca:logical-model:test",
        revision=1,
        media_type="text/turtle",
        document="@prefix dcat: <http://www.w3.org/ns/dcat#> .",
    )
    with pytest.raises(I14YPublicationDisabled, match="disabled"):
        asyncio.run(port.publish_dataset(package))
