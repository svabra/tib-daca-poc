from contextlib import contextmanager

from daca_catalog import modeling_seed
from daca_catalog import seed as seed_module
from daca_catalog import site_glossary_seed


def test_catalog_seed_cli_runs_foundational_and_modeling_seeds(monkeypatch, capsys) -> None:
    calls: list[tuple[str, object]] = []
    class FakeSession:
        def commit(self) -> None:
            calls.append(("commit", self))

    session = FakeSession()

    @contextmanager
    def session_context():
        yield session

    monkeypatch.setattr(seed_module, "get_settings", lambda: object())
    monkeypatch.setattr(seed_module, "default_session_factory", lambda _settings: session_context)
    monkeypatch.setattr(
        seed_module,
        "seed_catalog",
        lambda actual_session: calls.append(("catalog", actual_session)) or False,
    )
    monkeypatch.setattr(
        modeling_seed,
        "seed_modeling_catalog",
        lambda actual_session: calls.append(("modeling", actual_session)),
    )
    monkeypatch.setattr(
        site_glossary_seed,
        "seed_site_glossary_terms",
        lambda actual_session: calls.append(("glossary", actual_session)),
    )

    seed_module.main()

    assert calls == [
        ("catalog", session),
        ("modeling", session),
        ("glossary", session),
        ("commit", session),
    ]
    assert capsys.readouterr().out.strip() == "catalog seed already present"
