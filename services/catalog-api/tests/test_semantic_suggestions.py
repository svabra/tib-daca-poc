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


def test_rapidfuzz_provider_keeps_domains_and_terms_visible_in_a_shared_limit():
    candidates = [
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=index + 1),
            label=f"Armoured vehicle type {index}",
            search_values=("armoured vehicle",),
        )
        for index in range(8)
    ] + [
        SuggestionCandidate(
            kind="domain",
            id=uuid.UUID(int=100 + index),
            label=label,
            search_values=("armoured vehicle",),
        )
        for index, label in enumerate(("Defence", "Mobility and logistics"))
    ]

    suggestions = RapidFuzzSuggestionProvider().rank(
        candidates,
        {"title": "armoured vehicle fleet"},
        threshold=70,
    )

    assert len(suggestions) == 5
    assert [item.label for item in suggestions[:2]] == ["Defence", "Mobility and logistics"]
    assert sum(item.kind == "domain" for item in suggestions) == 2


def test_rapidfuzz_provider_does_not_confuse_armoured_with_recovery_tank():
    candidates = [
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=1),
            label="Gepanzertes Fahrzeug",
            search_values=("Gepanzertes Fahrzeug", "GepFz"),
        ),
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=2),
            label="Bergepanzer",
            search_values=("Bergepanzer",),
        ),
    ]

    suggestions = RapidFuzzSuggestionProvider().rank(
        candidates,
        {"title": "Flottenbestand gepanzerte Fahrzeuge"},
        threshold=70,
    )

    assert [item.label for item in suggestions] == ["Gepanzertes Fahrzeug"]


def test_rapidfuzz_provider_derives_exact_short_glossary_abbreviations():
    abbreviations = ("C2", "VHF", "UID", "Spz", "KPz", "VSt", "Pz")
    candidates = [
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=index + 1),
            label=abbreviation,
            search_values=(abbreviation,),
        )
        for index, abbreviation in enumerate(abbreviations)
    ]

    suggestions = RapidFuzzSuggestionProvider().rank(
        candidates,
        {
                "fieldDescriptions": (
                    "c2 Lagebild, vhf Verbindung, uid des Unternehmens, spz, kpz, vst und Pz"
                )
            },
            threshold=70,
            limit=10,
        )

    assert {item.label for item in suggestions} == set(abbreviations)
    assert all(item.score == 100 for item in suggestions)


def test_rapidfuzz_provider_never_fuzzy_matches_short_identifiers():
    candidates = [
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=1),
            label="C2",
            search_values=("C2",),
        ),
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=2),
            label="VHF",
            search_values=("VHF",),
        ),
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=3),
            label="UID",
            search_values=("UID",),
        ),
    ]

    suggestions = RapidFuzzSuggestionProvider().rank(
        candidates,
        {"title": "C3 VHG UDI"},
        threshold=70,
    )

    assert suggestions == []


def test_rapidfuzz_provider_requires_case_for_two_letter_alphabetic_abbreviations():
    candidates = [
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=1),
            label="Anticipatory Tax",
            search_values=("AT",),
        ),
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=2),
            label="Leopard value preservation",
            search_values=("WE",),
        ),
    ]
    provider = RapidFuzzSuggestionProvider()

    assert provider.rank(
        candidates,
        {"description": "data at source; we monitor values"},
        threshold=70,
    ) == []
    assert {item.label for item in provider.rank(
        candidates,
        {"keywords": "AT WE"},
        threshold=70,
    )} == {"Anticipatory Tax", "Leopard value preservation"}


def test_rapidfuzz_provider_breaks_identical_score_and_label_ties_by_identity():
    candidates = [
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=2),
            label="VHF",
            search_values=("VHF",),
        ),
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=1),
            label="VHF",
            search_values=("VHF",),
        ),
    ]

    result = RapidFuzzSuggestionProvider().rank(
        candidates,
        {"keywords": "VHF"},
        threshold=70,
    )

    assert [item.id for item in result] == [uuid.UUID(int=1), uuid.UUID(int=2)]


def test_rapidfuzz_provider_does_not_treat_short_words_inside_labels_as_acronyms():
    candidates = [
        SuggestionCandidate(
            kind="glossaryTerm",
            id=uuid.UUID(int=index + 1),
            label=label,
            search_values=(label,),
        )
        for index, label in enumerate(("Tax period", "Tax at source", "Direct Federal Tax"))
    ]

    assert RapidFuzzSuggestionProvider().rank(
        candidates,
        {"title": "General tax dataset"},
        threshold=70,
    ) == []


def test_rapidfuzz_provider_exactly_matches_multi_token_abbreviations():
    candidate = SuggestionCandidate(
        kind="glossaryTerm",
        id=uuid.UUID(int=1),
        label="Pionierpanzer 21",
        search_values=("Pi Pz 21",),
    )

    result = RapidFuzzSuggestionProvider().rank(
        [candidate],
        {"keywords": "Flotte Pi Pz 21 Bestand"},
        threshold=70,
    )

    assert [item.label for item in result] == ["Pionierpanzer 21"]
