"""PostgreSQL guards and capture triggers for the append-only role protocol."""

CAPTURE_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION daca_capture_role_change() RETURNS trigger AS $$
DECLARE
    before_row jsonb;
    after_row jsonb;
    row_data jsonb;
    before_state jsonb;
    after_state jsonb;
    role_field text;
    old_user text;
    new_user text;
    target_type text;
    target_id text;
    changed_action text;
    actor_id text := COALESCE(NULLIF(current_setting('daca.role_actor', true), ''), 'system');
BEGIN
    -- Serialize writers so protocol numbers follow commit order, including concurrent requests.
    PERFORM pg_advisory_xact_lock(14270, 1);
    IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
    row_data := COALESCE(after_row, before_row);

    IF TG_TABLE_NAME IN ('domains', 'data_products', 'dcat_dataset_versions') THEN
        IF TG_TABLE_NAME = 'dcat_dataset_versions' THEN
            target_type := 'dataset_version';
        ELSIF TG_TABLE_NAME = 'data_products' THEN
            target_type := 'data_product';
        ELSE
            target_type := 'domain';
        END IF;
        target_id := row_data->>'id';
        FOREACH role_field IN ARRAY ARRAY['data_owner', 'deputy_data_owner'] LOOP
            IF role_field = 'data_owner' THEN
                IF TG_TABLE_NAME = 'dcat_dataset_versions' THEN
                    old_user := before_row->>'data_owner_user_id';
                    new_user := after_row->>'data_owner_user_id';
                ELSE
                    old_user := before_row->>'owner_user_id';
                    new_user := after_row->>'owner_user_id';
                END IF;
            ELSE
                old_user := before_row->>'deputy_owner_user_id';
                new_user := after_row->>'deputy_owner_user_id';
            END IF;
            IF old_user IS DISTINCT FROM new_user THEN
                changed_action := CASE WHEN old_user IS NULL THEN 'assigned'
                    WHEN new_user IS NULL THEN 'removed' ELSE 'changed' END;
                INSERT INTO role_change_events
                    (actor_user_id, action, scope_type, scope_id, entity_id, role,
                     subject_user_id, before_state, after_state)
                VALUES
                    (actor_id, changed_action, target_type, target_id, target_id, role_field,
                     COALESCE(new_user, old_user),
                     CASE WHEN old_user IS NULL THEN NULL ELSE jsonb_build_object('userId', old_user, 'role', role_field) END,
                     CASE WHEN new_user IS NULL THEN NULL ELSE jsonb_build_object('userId', new_user, 'role', role_field) END);
            END IF;
        END LOOP;
    ELSE
        IF TG_TABLE_NAME = 'data_model_role_assignments' THEN
            target_type := 'organization';
            target_id := row_data->>'organization_id';
            before_state := CASE WHEN before_row IS NULL THEN NULL ELSE jsonb_build_object(
                'userId', before_row->>'user_id', 'role', before_row->>'role',
                'organizationId', before_row->>'organization_id', 'active', (before_row->>'active')::boolean,
                'delegatedOwnerUserId', before_row->>'delegated_owner_user_id') END;
            after_state := CASE WHEN after_row IS NULL THEN NULL ELSE jsonb_build_object(
                'userId', after_row->>'user_id', 'role', after_row->>'role',
                'organizationId', after_row->>'organization_id', 'active', (after_row->>'active')::boolean,
                'delegatedOwnerUserId', after_row->>'delegated_owner_user_id') END;
        ELSE
            target_type := CASE WHEN row_data->>'domain_id' IS NOT NULL THEN 'domain'
                WHEN row_data->>'logical_model_id' IS NOT NULL THEN 'logical_model'
                WHEN row_data->>'physical_source_id' IS NOT NULL THEN 'physical_representation'
                ELSE 'data_product' END;
            target_id := COALESCE(row_data->>'domain_id', row_data->>'logical_model_id',
                                  row_data->>'physical_source_id', row_data->>'data_product_id');
            before_state := CASE WHEN before_row IS NULL THEN NULL ELSE jsonb_build_object(
                'userId', before_row->>'user_id', 'role', before_row->>'role',
                'organizationId', before_row->>'organization_id', 'active', (before_row->>'active')::boolean,
                'physicalTableKey', before_row->>'physical_table_key') END;
            after_state := CASE WHEN after_row IS NULL THEN NULL ELSE jsonb_build_object(
                'userId', after_row->>'user_id', 'role', after_row->>'role',
                'organizationId', after_row->>'organization_id', 'active', (after_row->>'active')::boolean,
                'physicalTableKey', after_row->>'physical_table_key') END;
        END IF;
        IF before_state IS DISTINCT FROM after_state
           AND (COALESCE((before_state->>'active')::boolean, false)
                OR COALESCE((after_state->>'active')::boolean, false)) THEN
            changed_action := CASE WHEN before_state IS NULL OR (before_state->>'active')::boolean IS FALSE
                THEN 'assigned' WHEN after_state IS NULL OR (after_state->>'active')::boolean IS FALSE
                THEN 'removed' ELSE 'changed' END;
            INSERT INTO role_change_events
                (actor_user_id, action, scope_type, scope_id, entity_id, role,
                 subject_user_id, before_state, after_state)
            VALUES
                (actor_id, changed_action, target_type, target_id, row_data->>'id',
                 row_data->>'role', row_data->>'user_id', before_state, after_state);
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

GUARD_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION daca_reject_role_change_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'role_change_events is append-only';
END;
$$ LANGUAGE plpgsql;
"""

CAPTURE_TABLES = (
    'data_model_role_assignments', 'catalog_object_responsibilities',
    'domains', 'data_products', 'dcat_dataset_versions',
)


def install_statements() -> list[str]:
    statements = [CAPTURE_FUNCTION_SQL, GUARD_FUNCTION_SQL]
    statements += [
        f"CREATE TRIGGER trg_role_change_{table} AFTER INSERT OR UPDATE OR DELETE "
        f"ON {table} FOR EACH ROW EXECUTE FUNCTION daca_capture_role_change()"
        for table in CAPTURE_TABLES
    ]
    statements.append(
        "CREATE TRIGGER trg_role_change_immutable BEFORE UPDATE OR DELETE OR TRUNCATE "
        "ON role_change_events FOR EACH STATEMENT EXECUTE FUNCTION daca_reject_role_change_mutation()"
    )
    return statements
