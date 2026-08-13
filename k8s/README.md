# DaCa OpenShift presentation stack

These manifests deploy only the DaCa presentation workloads into `daai-brs-d`. They intentionally
contain no PostgreSQL, pgAdmin, PVC or database-service resource. Production uses the existing
PostgreSQL 17 and administration platform shared with DAAIF, with separate DaCa databases and
roles.

## Prerequisites

1. Ask the database administrator to run `infra/postgres/production/bootstrap-daca.sql` against
   the existing PostgreSQL instance. Pass passwords through `psql -v`; do not edit them into the
   script.
2. Copy `daca-secret.example.yaml` outside the repository, replace every placeholder, and apply
   the resulting Secret. Use the same real PostgreSQL host as DAAIF, but DaCa-specific roles.
3. Configure the GitHub repository secret `DOCKERHUB_TOKEN` and confirm that the three
   `svabra/tib-daca-*` repositories exist in Docker Hub.

## Apply order

```bash
oc apply -f k8s/daca-configmap.yaml
oc apply -f /secure/path/daca-secret.yaml
oc apply -f k8s/daca-catalog-api.yaml
oc apply -f k8s/daca-opa.yaml
oc apply -f k8s/daca-sample-data-product.yaml
oc apply -f k8s/daca-catalog-ui.yaml
```

DAAIF publishes metadata inside the namespace to
`http://daca-catalog-api:8001/api/v1/metadata-publications`. Only the Catalog UI route is exposed
externally. Its reverse proxy provides the Catalog API, Swagger/OpenAPI and sample-product paths.

## Verification and rollback

```bash
oc get pods,services,routes -n daai-brs-d -l app.kubernetes.io/part-of=tib-daca-poc
oc rollout status deployment/daca-catalog-api -n daai-brs-d
oc rollout status deployment/daca-sample-data-product -n daai-brs-d
oc rollout status deployment/daca-catalog-ui -n daai-brs-d
```

Rollback means pinning the previous immutable image tag in the three Deployment manifests and
applying them again. Alembic migrations are forward-only during ordinary deployment; database
rollback requires an explicit reviewed migration and backup plan.
