#!/usr/bin/env bash
set -Eeuo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v control_password="$CONTROL_PLANE_DB_PASSWORD" \
  -v sample_owner_password="$SAMPLE_DB_OWNER_PASSWORD" \
  -v sample_api_password="$SAMPLE_DB_PASSWORD" \
  -v projector_password="$POLICY_PROJECTOR_DB_PASSWORD" \
  -v sg_password="$SG_DB_PASSWORD" \
  -v bern_password="$BERN_DB_PASSWORD" <<-'EOSQL'
  CREATE ROLE didaca_control LOGIN PASSWORD :'control_password';
  CREATE ROLE didaca_sample_owner LOGIN PASSWORD :'sample_owner_password';
  CREATE ROLE didaca_sample_api LOGIN PASSWORD :'sample_api_password' NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE didaca_policy_projector LOGIN PASSWORD :'projector_password' NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE "kanton-st-gallen" LOGIN PASSWORD :'sg_password' NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE "kanton-bern" LOGIN PASSWORD :'bern_password' NOSUPERUSER NOBYPASSRLS;

  CREATE DATABASE didaca_control_plane OWNER didaca_control;
  CREATE DATABASE didaca_sample OWNER didaca_sample_owner;

  REVOKE ALL ON DATABASE didaca_control_plane FROM PUBLIC;
  REVOKE ALL ON DATABASE didaca_sample FROM PUBLIC;
  GRANT CONNECT ON DATABASE didaca_control_plane TO didaca_control;
  GRANT CONNECT ON DATABASE didaca_sample TO didaca_sample_owner, didaca_sample_api,
    didaca_policy_projector, "kanton-st-gallen", "kanton-bern";
EOSQL
