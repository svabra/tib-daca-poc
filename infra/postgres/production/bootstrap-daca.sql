\set ON_ERROR_STOP on

-- Run once with a PostgreSQL cluster administrator. Supply all passwords with
-- psql -v; never place real credentials in this file or in a Kubernetes manifest.
SELECT format('CREATE ROLE daca_catalog LOGIN PASSWORD %L', :'catalog_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'daca_catalog') \gexec
SELECT format('CREATE ROLE daca_sample_owner LOGIN PASSWORD %L', :'sample_owner_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'daca_sample_owner') \gexec
SELECT format('CREATE ROLE daca_sample_api LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'sample_api_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'daca_sample_api') \gexec
SELECT format('CREATE ROLE daca_policy_projector LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'projector_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'daca_policy_projector') \gexec
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', 'kanton-st-gallen', :'sg_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kanton-st-gallen') \gexec
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', 'kanton-bern', :'bern_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kanton-bern') \gexec

SELECT format('CREATE DATABASE daca_catalog OWNER daca_catalog')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'daca_catalog') \gexec
SELECT format('CREATE DATABASE daca_sample OWNER daca_sample_owner')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'daca_sample') \gexec

REVOKE ALL ON DATABASE daca_catalog FROM PUBLIC;
REVOKE ALL ON DATABASE daca_sample FROM PUBLIC;
GRANT CONNECT ON DATABASE daca_catalog TO daca_catalog;
GRANT CONNECT ON DATABASE daca_sample TO daca_sample_owner, daca_sample_api,
  daca_policy_projector, "kanton-st-gallen", "kanton-bern";
