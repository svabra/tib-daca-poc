from daca_catalog.main import _domain_response, _term_response
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import Domain, GlossaryTerm
from daca_catalog.office_governance import seed_requested_steward_mandates
from daca_catalog.semantic_read import semantic_read
from sqlalchemy import event, select


def test_bulk_domain_reads_preserve_actor_permissions_and_use_bounded_queries(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_requested_steward_mandates(session)
        session.flush()
        domains = list(session.scalars(select(Domain)))
        for actor in (None, "kassandra.valdata", "sibilla.micheli", "christian.spider", "lawrence.hill"):
            expected = [_domain_response(session, domain, actor) for domain in domains]
            queries = []
            def count(*args, statements=queries):
                statements.append(args[2])
            event.listen(session.get_bind(), "before_cursor_execute", count)
            try:
                with semantic_read(session, domains=domains, actor=actor):
                    actual = [_domain_response(session, domain, actor) for domain in domains]
            finally:
                event.remove(session.get_bind(), "before_cursor_execute", count)
            assert actual == expected
            assert len(queries) <= 12, (actor, len(queries))
            assert "semantic_read" not in session.info
        # A later change in the same session must not use a stale read snapshot.
        domain = domains[0]
        domain.lifecycle = "retired"
        session.flush()
        assert not _domain_response(session, domain, domain.owner_user_id).can_edit_metadata


def test_bulk_terms_preserve_ownership_labels_and_relations_with_bounded_queries(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        terms = list(session.scalars(select(GlossaryTerm)))
        expected = [_term_response(session, term) for term in terms]
        queries = []
        def count(*args):
            queries.append(args[2])
        event.listen(session.get_bind(), "before_cursor_execute", count)
        try:
            with semantic_read(session, terms=terms):
                actual = [_term_response(session, term) for term in terms]
        finally:
            event.remove(session.get_bind(), "before_cursor_execute", count)
        assert actual == expected
        assert len(queries) <= 10, len(queries)
        assert "semantic_read" not in session.info
