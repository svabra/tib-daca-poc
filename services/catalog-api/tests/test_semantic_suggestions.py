from __future__ import annotations

import uuid

from daca_catalog.semantic_suggestions import RapidFuzzSuggestionProvider, SuggestionCandidate


def test_rapidfuzz_provider_is_deterministic_explainable_and_limited():
    candidates = [
        SuggestionCandidate(
            kind="domain",
            id=uuid.UUID(int=index + 1),
            label=f"Vehicle {index}",
            search_values=("armored vehicle",),
        )
        for index in range(8)
    ]
    provider = RapidFuzzSuggestionProvider()
    first = provider.rank(candidates, {"title": "armored vehicle fleet"}, threshold=70)
    second = provider.rank(candidates, {"title": "armored vehicle fleet"}, threshold=70)
    assert first == second
    assert len(first) == 5
    assert all(item.source == "deterministic-fuzzy" for item in first)
    assert all(item.matched_fields == ["title"] for item in first)
    assert all("Titel" in item.reason for item in first)


def test_rapidfuzz_provider_applies_threshold():
    candidate = SuggestionCandidate(
        kind="glossaryTerm",
        id=uuid.uuid4(),
        label="Armored Vehicle",
        search_values=("armored vehicle", "armoured vehicle"),
    )
    assert (
        RapidFuzzSuggestionProvider().rank([candidate], {"title": "tax revenue"}, threshold=90)
        == []
    )


def test_rapidfuzz_provider_recognizes_meaningful_terms_inside_compounds():
    candidate = SuggestionCandidate(
        kind="domain",
        id=uuid.uuid4(),
        label="Verteidigung",
        search_values=(
            "Fachliche Domain für Fähigkeiten, Mittel und Daten zur Verteidigung.",
        ),
    )

    suggestions = RapidFuzzSuggestionProvider().rank(
        [candidate],
        {"keywords": "Fahrzeugflotte Einsatzmittel Logistik synthetisch"},
        threshold=70,
    )

    assert len(suggestions) == 1
    assert suggestions[0].score == 100
    assert suggestions[0].matched_fields == ["keywords"]
    assert "„mittel“ und „einsatzmittel“" in suggestions[0].reason
