# Cross-system journeys

This directory owns destructive, transient journeys spanning DaCa and external source systems.
It is part of the DaCa repository and is not a nested Git repository.

## Data Analyst Golden Path

`data-analyst-golden-path` proves the DAAIF-to-DaCa customer journey in a real browser:

1. Joel Ruod generates 25 electronic canton sources in DAAIF and manually imports Aargau CSV.
2. The prepared notebook produces 130 canton/year aggregates, Parquet output and a chart.
3. DAAIF publishes the product through DaCa's real metadata publication endpoint.
4. Joel completes DCAT-AP-CH, ontology and KOBY Graphify evidence; the product reaches Gold.
5. Beat finds the metadata and requests personal REST access for 365 days.
6. Joel submits one immutable policy snapshot for two groups and Thomas Kriegli.
7. Thomas approves; OPA and PostgreSQL confirm the same revision; the product reaches Platinum.
8. Beat, Daniel and Thomas receive HTTP 200 while an unrelated identity receives HTTP 403.

All people, records and organizations are synthetic PoC fixtures. KOBY, I14Y and BAR create
local evidence only and make no external network calls.

## Prerequisites

- Docker Desktop with the Linux engine
- `uv`
- Chromium installed for Python Playwright
- the DAAIF repository checked out next to this repository as
  `tib-daail-evo1-poc-query-engine-alias-fix`, or supplied with `--daaif-repo`

Install the browser once:

```powershell
uv sync --package daca-journey-runner
uv run --package daca-journey-runner playwright install chromium
```

Run the isolated headless journey:

```powershell
npm run journey:data-analyst
```

Run with a visible browser:

```powershell
npm run journey:data-analyst:headed
```

Use `--keep-stack` only for local diagnosis. CI always removes containers, networks and volumes.
The runner chooses free host ports, records the unique Compose project name, and never attaches
to the normal DAAIF or DaCa runtime volumes.

## Artifacts

Each run writes to `output/playwright/data-analyst-journey/<run-id>/`:

- milestone screenshots;
- a complete Playwright video and `trace.zip`;
- `junit.xml`;
- `summary.md` and `summary.json` with product URN, policy revision and both Git SHAs;
- timestamped logs from every container.

These generated files are ignored by Git. GitHub retains manual workflow artifacts for 14 days.

## Official run

The resource-intensive workflow is manual only. After DAAIF and DaCa changes have merged, invoke
`Data Analyst Golden Path` on DaCa `main`. The runner's `--require-main` guard verifies that both
checked-out commits exactly match their respective `origin/main` refs.
