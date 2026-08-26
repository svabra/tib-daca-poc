from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Literal, Protocol

from rapidfuzz import fuzz

_TOKEN_PATTERN = re.compile(r"[^\W_]+", re.UNICODE)
_NON_SEMANTIC_TOKENS = frozenset(
    {
        "and",
        "als",
        "am",
        "an",
        "as",
        "at",
        "auf",
        "bei",
        "bis",
        "by",
        "data",
        "das",
        "dem",
        "den",
        "der",
        "die",
        "domain",
        "ein",
        "for",
        "from",
        "für",
        "hat",
        "if",
        "im",
        "in",
        "is",
        "ist",
        "it",
        "mit",
        "nach",
        "no",
        "of",
        "on",
        "or",
        "subject",
        "sie",
        "so",
        "the",
        "to",
        "um",
        "und",
        "von",
        "vor",
        "wie",
        "wir",
        "with",
        "zu",
        "zum",
        "zur",
        "daten",
        "eine",
        "einer",
        "eines",
        "fachliche",
        "fachlicher",
        "fachliches",
        "oder",
        "sowie",
        "über",
    }
)
_FIELD_LABELS = {
    "title": "Titel",
    "description": "Beschreibung",
    "keywords": "Keywords",
    "fieldDescriptions": "Feldbeschreibungen",
}


@dataclass(frozen=True)
class _Match:
    score: float
    candidate_token: str | None = None
    field_token: str | None = None


def _meaningful_tokens(value: str) -> tuple[str, ...]:
    """Return stable content tokens while ignoring taxonomy boilerplate and stop words."""

    return tuple(
        token
        for token in _TOKEN_PATTERN.findall(value.casefold())
        if len(token) >= 4 and token not in _NON_SEMANTIC_TOKENS
    )


def _short_identifier_tokens(value: str) -> tuple[str, ...]:
    """Return curated short labels such as C2, Spz or VHF without fuzzy matching them."""

    tokens = tuple(_TOKEN_PATTERN.findall(value))
    if len(tokens) != 1:
        return ()
    token = tokens[0]
    if not 2 <= len(token) <= 3:
        return ()
    if not (
        any(character.isdigit() for character in token)
        or token[0].isupper()
        or token.isupper()
    ):
        return ()
    if token.casefold() in _NON_SEMANTIC_TOKENS and not token.isupper():
        return ()
    return (token,)


def _contains_exact_phrase(candidate_tokens: tuple[str, ...], field_tokens: tuple[str, ...]) -> bool:
    if len(candidate_tokens) < 2 or len(candidate_tokens) > len(field_tokens):
        return False
    candidate = tuple(token.casefold() for token in candidate_tokens)
    field = tuple(token.casefold() for token in field_tokens)
    width = len(candidate)
    return any(field[index : index + width] == candidate for index in range(len(field) - width + 1))


def _match_value(candidate_value: str, field_value: str) -> _Match:
    """Score meaningful token sets and individual terms, including German compounds."""

    raw_candidate_tokens = tuple(_TOKEN_PATTERN.findall(candidate_value))
    field_tokens = tuple(_TOKEN_PATTERN.findall(field_value))
    if _contains_exact_phrase(raw_candidate_tokens, field_tokens):
        phrase = " ".join(token.casefold() for token in raw_candidate_tokens)
        return _Match(score=100.0, candidate_token=phrase, field_token=phrase)

    candidate_identifiers = _short_identifier_tokens(candidate_value)
    field_token_lookup = {token.casefold() for token in field_tokens}
    for identifier in candidate_identifiers:
        exact_identifier_match = (
            identifier in field_tokens
            if len(identifier) == 2 and identifier.isalpha()
            else identifier.casefold() in field_token_lookup
        )
        if exact_identifier_match:
            # Abbreviations below four characters are too short for useful fuzzy matching. An
            # exact, token-boundary match remains strong evidence and makes metadata such as C2,
            # Spz, UID, VHF, IFV or VAT derivable without creating substring noise.
            normalized_identifier = identifier.casefold()
            return _Match(
                score=100.0,
                candidate_token=normalized_identifier,
                field_token=normalized_identifier,
            )

    candidate_tokens = _meaningful_tokens(candidate_value)
    field_tokens = _meaningful_tokens(field_value)
    best = _Match(
        score=(
            fuzz.token_set_ratio(" ".join(candidate_tokens), " ".join(field_tokens))
            if candidate_tokens and field_tokens
            else 0.0
        )
    )
    for candidate_token in candidate_tokens:
        for field_token in field_tokens:
            token_score = fuzz.ratio(candidate_token, field_token)
            # Domain definitions often contain a base noun while product metadata uses a
            # compound (for example "Mittel" and "Einsatzmittel"). Such containment is
            # stronger evidence than a generic partial-string score, provided both terms
            # are substantial words after stop-word filtering.
            shorter, longer = sorted((candidate_token, field_token), key=len)
            if longer.startswith(shorter) or longer.endswith(shorter):
                token_score = 100.0
            elif token_score < 85.0:
                # A permissive 70% character score produces misleading German matches such
                # as "Bergepanzer" for "gepanzerte Fahrzeuge". Keep configurable fuzzy
                # phrase matching, but require stronger evidence for isolated word pairs.
                continue
            if token_score > best.score:
                best = _Match(
                    score=token_score,
                    candidate_token=candidate_token,
                    field_token=field_token,
                )
    return best


@dataclass(frozen=True)
class SuggestionCandidate:
    kind: Literal["domain", "glossaryTerm"]
    id: uuid.UUID
    label: str
    search_values: tuple[str, ...]


@dataclass(frozen=True)
class RankedSuggestion:
    kind: Literal["domain", "glossaryTerm"]
    id: uuid.UUID
    label: str
    score: float
    matched_fields: list[str]
    reason: str
    source: Literal["deterministic-fuzzy"] = "deterministic-fuzzy"


class SemanticSuggestionProvider(Protocol):
    def rank(
        self,
        candidates: list[SuggestionCandidate],
        fields: dict[str, str],
        *,
        threshold: float,
        limit: int = 5,
    ) -> list[RankedSuggestion]: ...


class RapidFuzzSuggestionProvider:
    """Deterministic, explainable PoC matcher without an external model."""

    def rank(
        self,
        candidates: list[SuggestionCandidate],
        fields: dict[str, str],
        *,
        threshold: float,
        limit: int = 5,
    ) -> list[RankedSuggestion]:
        ranked: list[RankedSuggestion] = []
        for candidate in candidates:
            best_match = _Match(score=0.0)
            matched_field = "title"
            for field_name, text in fields.items():
                for value in candidate.search_values:
                    if not value.strip() or not text.strip():
                        continue
                    match = _match_value(value, text)
                    if match.score > best_match.score:
                        best_match = match
                        matched_field = field_name
            if best_match.score < threshold:
                continue
            descriptor = (
                "Domain-Label oder -Definition"
                if candidate.kind == "domain"
                else "Term-Label oder Synonym"
            )
            evidence = ""
            if best_match.candidate_token and best_match.field_token:
                evidence = f" durch „{best_match.candidate_token}“ und „{best_match.field_token}“"
            field_label = _FIELD_LABELS.get(matched_field, matched_field)
            ranked.append(
                RankedSuggestion(
                    kind=candidate.kind,
                    id=candidate.id,
                    label=candidate.label,
                    score=best_match.score,
                    matched_fields=[matched_field],
                    reason=f"{descriptor} ähnelt dem Feld „{field_label}“{evidence}",
                )
            )
        ordered = sorted(
            ranked,
            key=lambda item: (
                -item.score,
                item.label.casefold(),
                item.kind,
                item.id.hex,
            ),
        )
        if limit <= 0 or not ordered:
            return []

        # Domains and terms support two different editor decisions. A larger glossary must not
        # crowd every domain out of the shared five-result response (or vice versa), so reserve
        # up to two places for each represented kind before filling the remainder by score.
        selected: list[RankedSuggestion] = []
        represented_kinds = {item.kind for item in ordered}
        if len(represented_kinds) > 1 and limit >= 2:
            reserved_per_kind = min(2, limit // 2)
            for kind in ("domain", "glossaryTerm"):
                selected.extend(
                    [item for item in ordered if item.kind == kind][:reserved_per_kind]
                )
        selected_ids = {(item.kind, item.id) for item in selected}
        selected.extend(
            item
            for item in ordered
            if (item.kind, item.id) not in selected_ids
        )
        return selected[:limit]
