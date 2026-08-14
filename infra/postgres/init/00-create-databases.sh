#!/usr/bin/env bash
set -Eeuo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v catalog_password="$CATALOG_DB_PASSWORD" \
  -v control_password="$CONTROL_PLANE_DB_PASSWORD" \
  -v sample_owner_password="$SAMPLE_DB_OWNER_PASSWORD" \
  -v sample_api_password="$SAMPLE_DB_PASSWORD" \
  -v projector_password="$POLICY_PROJECTOR_DB_PASSWORD" \
  -v sg_password="$SG_DB_PASSWORD" \
  -v bern_password="$BERN_DB_PASSWORD" <<-'EOSQL'
  CREATE ROLE daca_catalog LOGIN PASSWORD :'catalog_password';
  CREATE ROLE daca_control LOGIN PASSWORD :'control_password';
  CREATE ROLE daca_sample_owner LOGIN PASSWORD :'sample_owner_password';
  CREATE ROLE daca_sample_api LOGIN PASSWORD :'sample_api_password' NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE daca_policy_projector LOGIN PASSWORD :'projector_password' NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE "kanton-st-gallen" LOGIN PASSWORD :'sg_password' NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE "kanton-bern" LOGIN PASSWORD :'bern_password' NOSUPERUSER NOBYPASSRLS;

  CREATE DATABASE daca_catalog OWNER daca_catalog;
  CREATE DATABASE daca_control_plane OWNER daca_control;
  CREATE DATABASE daca_sample OWNER daca_sample_owner;

  REVOKE ALL ON DATABASE daca_catalog FROM PUBLIC;
  REVOKE ALL ON DATABASE daca_control_plane FROM PUBLIC;
  REVOKE ALL ON DATABASE daca_sample FROM PUBLIC;
  GRANT CONNECT ON DATABASE daca_catalog TO daca_catalog;
  GRANT CONNECT ON DATABASE daca_control_plane TO daca_control;
  GRANT CONNECT ON DATABASE daca_sample TO daca_sample_owner, daca_sample_api,
    daca_policy_projector, "kanton-st-gallen", "kanton-bern";
EOSQL
