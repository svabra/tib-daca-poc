# Repository maintenance

## Supported entry points

- Catalog UI: `apps/catalog-ui/src/app/app.routes.ts`; the root route uses the welcome page.
- Administrative observation UI: `apps/control-plane-ui`.
- APIs: `services/catalog-api`, `services/control-plane-api` and `services/sample-data-product`.
- Browser regression gate: `scripts/edge_modeling_e2e.mjs`, exposed as
  `npm run test:ui-regression` and enforced by `.githooks/pre-commit`.
- Cross-system journeys: `journeys/` and the [MWST walkthrough](mwst-journey.md).

## Cleanup on 13 November 2026

Removed 43 obsolete files, approximately 13 MiB:

- The unrouted catalog overview prototype and the CSS used only by that component.
- The standalone modern HTML design deck and its five rendered concepts.
- Historical initial-screen captures, redundant intermediate highway comparisons, earlier
  mapping captures and unused role-view concept images. The current visual baselines and
  supplied mapping/highway references are indexed in [mockups](mockups/README.md).
- The old initials portrait, superseded by the synthetic WebP portrait. Seed-upgrade tests
  still verify that stored historical URLs are repaired.
- The four former edited Neuchâtel sunrise derivatives. The welcome theme already uses the
  authentic daytime photograph and retains its stable theme identifier.
- The two nested JavaScript lockfiles. Root `package-lock.json` is authoritative for all npm
  workspaces and both UI Docker builds. Versioning and its fixtures now use that same layout.

The root and per-service Python lockfiles are retained: standalone API Docker builds need the
service lockfiles. Database migrations, licensed/dynamically selected assets, active regression
tests and the configured control-plane runtime are retained. Git history holds deleted material.
Generated browser captures belong under ignored `output/`; keep only deliberate visual baselines
under `docs/mockups/`.

The clean-stack verification exposed CRLF line endings in the PostgreSQL initialization script
on Windows. `.gitattributes` now keeps shell scripts in LF form so a new database can initialize
the service roles before the APIs start.

The access-animation regression now seeks to the end of the cycle and advances across the
wrap boundary. It retains resume, restart and default-deny assertions without replaying
33 seconds of DOM animation, which exceeded the unit-test timeout during full-suite runs.

## Verification before committing

Run npm and uv from the repository root:

```powershell
npm ci
uv sync --all-packages --locked
npm run version:check
npm run lint
npm test
npm run build
npm run test:ui-regression
```

`npm test` includes web, Python, OPA and generated-documentation checks. For the full PostgreSQL
Catalog API suite, set `DACA_TEST_DATABASE_URL` to an isolated PostgreSQL database ending in
`_test`; without it those integration tests are skipped. Never use an ordinary catalog database:
the test fixture drops and recreates its tables for each case.

The UI gate requires a healthy catalog UI/API and PostgreSQL; it accepts `--base-url` and
`--screenshot-dir`. Run it against a temporary stack when ordinary servers are stopped, and
stop that stack after verification. The hook must pass before a commit is created.

## Cleanup verification

Verified on 13 November 2026:

- Root `npm ci`, lint, both production web builds, all Python distribution builds and version
  consistency checks passed using the shared npm lockfile.
- All 861 web tests and 18 OPA policy tests passed.
- All 690 distinct Python tests were exercised: 678 service/version/documentation cases passed
  in Linux against isolated PostgreSQL 18.4, and all 12 repository contracts passed in the real
  Git checkout. The latter require Git and CI files omitted from the temporary service image.
- Generated data-model and OpenAPI references are current.
- The complete UI regression passed against the separately built and seeded test stack.
- A fresh PostgreSQL container executed the LF initialization script without manual repair and
  created all seven service/consumer roles and all three application databases.

`npm ci` also reports 22 existing npm audit advisories (9 moderate, 10 high, 3 critical).
JavaScript dependency versions were not changed by this cleanup.

The dedicated UI workflow also prepares uv 0.11.29, Python 3.14 and the locked workspace
dependencies: its AdA browser flow invokes the real import-journey CLI through `uv run`.
