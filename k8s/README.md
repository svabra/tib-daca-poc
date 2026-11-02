# DaCa OpenShift presentation stack

An API image containing migration `0048_open_ended_access_requests` upgrades the existing
request column to support an explicit null end date before serving. Initial requests may
be indefinite; renewals retain a finite end date. The migration preserves existing requests
and refuses downgrade while unbounded requests exist. No manual data rewrite or database
reset is required. See [the Catalog data model](../docs/data-model/catalog.md).

The **0.3.6** release pins Catalog UI, Catalog API and Sample Data Product to matching
0.3.6 images. Wait for the image-publication workflow to succeed before applying these
manifests. This release includes the external-organization placement fix and the verified
ROHS CPS backfill procedure below; applying a manifest remains a separate PoC rollout.

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
DAAIF_UI_URL: "https://evo1-bdw-daai-brs-d.apps.p-szb-ros-nopi-npr-01.cloud.admin.ch"
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

### ROHS CPS example metadata in the PoC

The ROHS example products describe a synthetic catalog use case. They are unrelated to
the OpenShift platform hosting DaCa. The published Catalog API image `0.3.5` includes
`rohs-cps-catalog-v1`; its image command runs `daca-catalog-seed` after migrations even
when the ConfigMap sets `SEED_ON_STARTUP=false`. Existing catalog seed markers do not
skip the separate ROHS fixture. No database reset or local database export is needed.

If the fixture is missing from an existing PoC with a compatible image, open the
**Terminal of the Catalog API pod** in the OpenShift console and run the scoped command:

```bash
uv run --no-sync python -m daca_catalog.rohs_cps_seed
```

The equivalent CLI command is:

```bash
oc exec -n daai-brs-d deployment/daca-catalog-api -c catalog-api -- uv run --no-sync python -m daca_catalog.rohs_cps_seed
```

This uses the pod's existing database/schema configuration. Verify the two catalog URNs
`urn:daca:ch:bit:cps:rohs-telemetry` (**ROHS Container-Ereignisse**) and
`urn:daca:ch:bit:cps:rohs-analytics` (**ROHS SLO & Kapazitätsanalyse**) in product search
with the active-only filter disabled, using Marcello Hebeisa as Data Owner. Matteo Duca
is deputy and Fausto Marzo is control person. Both products begin as **drafts**; the
active-product landscape is not an installation check. The one-time marker preserves
subsequent edits, retirement and revoked assignments. Do not remove it to recreate
intentionally retired objects. If the module is missing, first roll out the Catalog API
image pinned in `daca-catalog-api.yaml` and wait for readiness. An API image rollback
does not undo migrations or fixture writes.

The published `0.3.5` image was checked locally in an isolated PostgreSQL 18.4 database
using the PoC's `daca_catalog` schema and a non-superuser database role: image startup
created both products, and a subsequent scoped seed completed without duplicates.

### Other fixtures and release verification

The same image seed additionally provisions `urn:daca:ch:verteidigung:building-use-demand`
(**Gebäudenutzungsbedarf der Verteidigung**) using a separate upgrade marker. Verteidigung
provides this product to armasuisse, complementing the armasuisse building inventory consumed
by Verteidigung. After deploying an image with both fixtures, verify one travelling point
in each direction on the same organization connection. The reverse fixture is added even if
the protected-building inventory was seeded by an earlier image; subsequent edits remain.

The Catalog API image runs migrations followed by `daca-catalog-seed` before starting the API;
the Deployment does not override that image command. The seed includes the additive
`poc-armasuisse-verteidigung-protected-buildings-v1` fixture on fresh and existing databases.
After rolling out an image built from this change, verify product
`urn:daca:ch:armasuisse:protected-buildings` (**Schützenswerte Gebäude – armasuisse**):
Giuseppe Starwars is Data Owner, Thomas Wikinger is deputy and Christian Man in Verteidigung
is the catalog consumer. The VBS landscape must show an armasuisse → Verteidigung connection,
with one offered product at armasuisse and one consumed product at Verteidigung for this example.
The one-time marker preserves subsequent edits/retirement; do not reset the database to add it.
No endpoint, published policy or real access event is created. The isolated API test exercises
the same `daca-catalog-seed` entrypoint twice before the CI image-publication stage.

Release **0.2.0** pins all three first-party Deployments to the immutable `0.2.0` images.
Wait for the GitHub image-publication workflow to succeed before applying those pins. The
Catalog API startup applies migrations through `0044_office_alds_mandates` before seeding and
serving traffic. These migrations preserve existing model versions, personal source-access
returns and audit history. Reuse the deployed ConfigMaps, Secrets, PostgreSQL instance and
Route; a version rollout does not require replacing them.

Verify `/catalog-api/health/ready`, the API OpenAPI version and the UI version overlay after
the rollout. Test the term/domain networks with an existing authorized persona. An image
rollback does not reverse the new schema or transfer any object responsibilities.

The publication workflow tests reversible migrations through `0041_semantic_graph_visibility`
before upgrading to the current head and checking the seed twice. It then verifies that the
`0042_object_governance` downgrade barrier rejects automatic role restoration transactionally;
the seeded head schema must still pass Alembic's consistency check afterwards.

```bash
oc get pods,services,routes -n daai-brs-d -l app.kubernetes.io/part-of=tib-daca-poc
oc logs deployment/daca-catalog-api -n daai-brs-d
oc logs deployment/daca-sample-data-product -n daai-brs-d
oc get route daca-catalog -n daai-brs-d
```

Rollback means pinning the previous immutable version tag in the three first-party Deployment
manifests and applying them again. Alembic migrations are forward-only during ordinary
deployment; database rollback requires a reviewed migration and backup plan.
