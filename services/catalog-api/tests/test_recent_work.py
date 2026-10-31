from datetime import timedelta
from uuid import uuid4

from daca_catalog.modeling_seed import VIBDBU_PHYSICAL_SOURCE_ID, seed_modeling_catalog
from daca_catalog.models import (
    AuditEvent,
    DataProduct,
    Domain,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    LogicalModel,
    PhysicalSource,
    PhysicalSourceAccessState,
    utc_now,
)
from sqlalchemy import func, select


def event(session, actor, kind, identity, when, action):
    session.add(AuditEvent(id=uuid4(), resource_type=kind, resource_id=str(identity), action=action, actor=actor, revision=1, occurred_at=when, details={}))


def test_own_edits_are_deduplicated_capped_sorted_and_reauthorized(client, session_factory):
    actor = 'kassandra.valdata'
    now = utc_now() + timedelta(days=2)
    products, domains, terms = [], [], []
    with session_factory() as session:
        seed_modeling_catalog(session)
        domain_ids = list(session.scalars(select(Domain.id).where(Domain.lifecycle == 'active').limit(4)))
        visible_domain = select(GlossaryTermDomain.term_id).join(Domain, Domain.id == GlossaryTermDomain.domain_id).where(GlossaryTermDomain.term_id == GlossaryTerm.id, Domain.lifecycle == 'active').exists()
        term_ids = list(session.scalars(select(GlossaryTerm.id).where(GlossaryTerm.lifecycle == 'active', visible_domain).limit(4)))
        assert len(domain_ids) == len(term_ids) == 4
        for index in range(4):
            identity = uuid4()
            product = DataProduct(id=identity, urn=f'urn:test:recent:{identity}', origin_catalog='urn:test', revision=1, owner_user_id='christian.spider', discoverable=True, title=f'Work {index}', description='Synthetic recent-work test', owner='VBS', domain='Test', lifecycle='active', classification='internal')
            session.add(product)
            event(session, actor, 'data-product', identity, now + timedelta(minutes=index), 'metadata-updated')
            event(session, actor, 'domain', domain_ids[index], now + timedelta(minutes=index), 'updated')
            event(session, actor, 'glossary-term', term_ids[index], now + timedelta(minutes=index), 'update-approved')
            products.append(str(identity)); domains.append(str(domain_ids[index])); terms.append(str(term_ids[index]))
        # A duplicate edit updates this item's own time, not its list multiplicity.
        event(session, actor, 'data-product', products[1], now + timedelta(minutes=8), 'metadata-updated')
        hidden_id = uuid4()
        session.add(DataProduct(id=hidden_id, urn=f'urn:test:hidden:{hidden_id}', origin_catalog='urn:test', revision=1, owner_user_id='christian.spider', discoverable=False, title='Hidden current title', description='Private', owner='VBS', domain='Test', lifecycle='active', classification='restricted'))
        event(session, actor, 'data-product', hidden_id, now + timedelta(minutes=10), 'metadata-updated')
        orphan_id = uuid4()
        session.add(GlossaryTerm(id=orphan_id, urn=f'urn:test:orphan:{orphan_id}', origin_catalog_id='urn:test', revision=1, content_hash='0'*64, lifecycle='active'))
        session.flush()
        session.add(GlossaryTermLocalization(term_id=orphan_id, language='de', preferred_label='Orphan term', normalized_label='orphan term', alternative_labels=[], definition='No visible domain'))
        event(session, actor, 'glossary-term', orphan_id, now + timedelta(minutes=20), 'update-approved')
        # Neither visits nor an unrelated actor's newer edit qualify as own work.
        event(session, actor, 'data-product', products[0], now + timedelta(minutes=50), 'viewed')
        event(session, 'beat.stalder', 'data-product', products[0], now + timedelta(minutes=60), 'metadata-updated')
        session.commit()
    response = client.get('/api/v1/me/recent-work', headers={'X-DaCa-User': actor})
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'no-store'
    groups = {group['id']: group['items'] for group in response.json()['categories']}
    assert [item['id'] for item in groups['products']] == [products[1], products[3], products[2]]
    assert [item['id'] for item in groups['domains']] == list(reversed(domains[1:]))
    assert [item['id'] for item in groups['terms']] == list(reversed(terms[1:]))
    assert all(len(items) <= 3 for items in groups.values())
    assert 'Hidden current title' not in response.text
    assert 'Orphan term' not in response.text
    assert all(item['queryParams']['termId'] == item['id'] and item['queryParams']['ownOffice'] == '0' for item in groups['terms'])
    # There is no user selector: an extra query parameter cannot switch identities.
    assert client.get('/api/v1/me/recent-work?userId=beat.stalder', headers={'X-DaCa-User': actor}).json() == response.json()
    other = client.get('/api/v1/me/recent-work', headers={'X-DaCa-User': 'beat.stalder'}).json()
    assert products[1] not in str(other)
    assert client.get('/api/v1/me/recent-work', headers={'X-DaCa-User': 'unknown-user'}).status_code == 401


def test_models_include_saved_authorship_but_hide_returned_sources_and_retired_roots(client, session_factory):
    actor = 'christian.spider'
    now = utc_now() + timedelta(days=3)
    with session_factory() as session:
        seed_modeling_catalog(session)
        model = session.scalar(select(LogicalModel).where(LogicalModel.lifecycle == 'active'))
        source = session.get(PhysicalSource, VIBDBU_PHYSICAL_SOURCE_ID)
        assert model and source
        model_id, source_id = str(model.id), str(source.id)
        event(session, actor, 'logical-model', model.id, now, 'draft-revised')
        event(session, actor, 'physical-source', source.id, now + timedelta(minutes=1), 'updated')
        session.commit()
        audit_count = session.scalar(select(func.count(AuditEvent.id)))
    response = client.get('/api/v1/me/recent-work', headers={'X-DaCa-User': actor})
    assert response.status_code == 200, response.text
    models = next(group['items'] for group in response.json()['categories'] if group['id'] == 'models')
    assert any(item['id'] == model_id and item['route'] == f'/models/{model_id}' for item in models)
    assert any(item['id'] == source_id and item['route'] == f'/physical-models/{source_id}' for item in models)
    with session_factory() as session:
        session.add(PhysicalSourceAccessState(source_id=source.id, user_id=actor, relinquished_at=utc_now()))
        session.get(LogicalModel, model.id).lifecycle = 'retired'
        session.commit()
    current = client.get('/api/v1/me/recent-work', headers={'X-DaCa-User': actor}).json()
    assert model_id not in str(current)
    assert source_id not in str(current)
    with session_factory() as session:
        # A read appends no edit-history events.
        assert session.scalar(select(func.count(AuditEvent.id))) == audit_count
