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
        "data",
        "domain",
        "from",
        "subject",
        "the",
        "with",
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


def _match_value(candidate_value: str, field_value: str) -> _Match:
    """Score meaningful token sets and individual terms, including German compounds."""

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
            if candidate_token in field_token or field_token in candidate_token:
                token_score = 100.0
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
                else "Term-Label, Synonym oder Definition"
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
        return sorted(ranked, key=lambda item: (-item.score, item.label))[:limit]
