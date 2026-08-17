# DaCa OpenShift presentation stack

These manifests deploy the DaCa presentation workloads into `daai-brs-d`. They intentionally
contain no PostgreSQL, pgAdmin, PVC or database-service resource. The deployed workloads are
Catalog UI, Catalog API, Sample Data Product/Policy Projector and OPA. Control Plane images are
published by CI but are not part of this RHOS presentation profile.

## Docker Hub repositories

Create these five repositories under the `svabra` account before publishing a release:

```text
svabra/tib-daca-catalog-ui
svabra/tib-daca-catalog-api
svabra/tib-daca-control-plane-ui
svabra/tib-daca-control-plane-api
svabra/tib-daca-sample-data-product
```

Each repository receives an exact release tag such as `0.1.1` and a `sha-<commit>` tag. The
OpenShift manifests pull the three deployed first-party images through the BIT Nexus Docker Hub
mirror. OPA is also referenced through that mirror.

## Shared PostgreSQL profile

Catalog and Sample use the existing DAAIF PostgreSQL connection and the `evo1_oltp` database.
They create and migrate separate `daca_catalog` and `daca_sample` schemas. The existing database
user therefore needs `CREATE` on `evo1_oltp`; if it does not have that privilege, a database
administrator must create both schemas once and make that user their owner.

The two API Deployments read these keys directly from the existing DAAIF objects:

```text
ConfigMap tib-daail-evo1-poc-query-engine-config: PG_HOST, PG_PORT, PG_OLTP_DATABASE
Secret    tib-daail-evo1-poc-query-engine-secret: PG_USER, PG_PASSWORD
```

`DACA_SHARED_POSTGRES=true` is deliberately limited to the presentation profile. It reuses the
same login for the Sample API and policy projector; no direct PostgreSQL consumer credentials
are exposed. Local Compose and installations with dedicated roles continue to use their full
database URLs and stronger role separation.

## Manual ConfigMap and Secret changes

The checked-in files are references. Edit the production objects manually in the RHOS UI.

Keep the existing `tib-daca-poc-config` values and add:

```yaml
DACA_CATALOG_SCHEMA: daca_catalog
DACA_SAMPLE_SCHEMA: daca_sample
DACA_SHARED_POSTGRES: "true"
```

Create or update `tib-daca-poc-secret` with two matching token pairs:

```yaml
DACA_POLICY_DEPLOYMENT_TOKEN: <token-1>
SAMPLE_POLICY_PROJECTION_TOKEN: <same-token-1>
INTERNAL_TOKEN: <token-2>
CATALOG_INTERNAL_TOKEN: <same-token-2>
```

Do not copy PostgreSQL or S3 credentials into the DaCa Secret. S3 is not a DaCa delivery
protocol and no DaCa pod receives unused S3 credentials.

After the Catalog Route exists, add these values to the existing DAAIF ConfigMap and restart
DAAIF:

```yaml
DACA_BASE_URL: http://daca-catalog-api:8001
DACA_OPA_URL: http://daca-opa:8181/v1/data/daca/authz/decision
DACA_UI_URL: https://<generated-daca-route-host>
DAAIF_PUBLIC_BASE_URL: https://<existing-daaif-route-host>
```

## Apply order

Apply the manually maintained Secret before the Catalog API.

```bash
oc apply -f k8s/daca-configmap.yaml
oc apply -f k8s/daca-catalog-api.yaml
oc rollout status deployment/daca-catalog-api -n daai-brs-d

oc apply -f k8s/daca-sample-data-product.yaml
oc rollout status deployment/daca-sample-data-product -n daai-brs-d

oc apply -f k8s/daca-opa.yaml
oc rollout status deployment/daca-opa -n daai-brs-d

oc apply -f k8s/daca-catalog-ui.yaml
oc rollout status deployment/daca-catalog-ui -n daai-brs-d
```

DAAIF publishes metadata inside the namespace to
`http://daca-catalog-api:8001/api/v1/metadata-publications`. Only the Catalog UI Route is
external; its reverse proxy serves Catalog API, Swagger/OpenAPI and sample-product paths.

## Verification and rollback

```bash
oc get pods,services,routes -n daai-brs-d -l app.kubernetes.io/part-of=tib-daca-poc
oc logs deployment/daca-catalog-api -n daai-brs-d
oc logs deployment/daca-sample-data-product -n daai-brs-d
oc get route daca-catalog -n daai-brs-d
```

Rollback means pinning the previous immutable version tag in the three first-party Deployment
manifests and applying them again. Alembic migrations are forward-only during ordinary
deployment; database rollback requires a reviewed migration and backup plan.
