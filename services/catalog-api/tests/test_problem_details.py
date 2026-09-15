from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError

from daca_catalog.problems import integrity_problem


@dataclass
class _Diagnostic:
    constraint_name: str | None
    sqlstate: str | None


class _DatabaseFailure(Exception):
    def __init__(self, constraint_name: str | None, sqlstate: str | None) -> None:
        self.diag = _Diagnostic(constraint_name, sqlstate)
        self.sqlstate = sqlstate


def _integrity_error(constraint_name: str | None, sqlstate: str | None) -> IntegrityError:
    return IntegrityError("INSERT INTO hidden_values", {}, _DatabaseFailure(constraint_name, sqlstate))


def test_identifier_integrity_problem_is_actionable_and_hides_database_values() -> None:
    problem = integrity_problem(_integrity_error("uq_logical_model_identifier_normalized", "23505"))

    assert problem.status == 409
    assert problem.error_code == "DACA-LM-IDENTIFIER-DUPLICATE"
    assert problem.suggested_action == "Wählen Sie einen anderen Identifier. Identifier sind katalogweit eindeutig."
    assert problem.errors == [{"location": "body.identifiers.0", "message": "Dieser Identifier ist bereits vergeben.", "type": "unique"}]
    assert problem.technical_details == {
        "category": "PostgreSQL integrity constraint",
        "sqlState": "23505",
        "constraint": "uq_logical_model_identifier_normalized",
        "timestamp": problem.technical_details["timestamp"],
    }
    assert "hidden_values" not in problem.detail


def test_unknown_integrity_problem_remains_safe_and_supportable() -> None:
    problem = integrity_problem(_integrity_error("internal_constraint", "23505"))

    assert problem.status == 409
    assert problem.error_code == "DACA-LM-INTEGRITY-CONFLICT"
    assert "technische Meldung" in problem.suggested_action
    assert problem.technical_details is not None
    assert problem.technical_details["constraint"] == "internal_constraint"
