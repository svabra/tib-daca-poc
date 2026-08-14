from __future__ import annotations

import json
import os
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from playwright.sync_api import Page, expect, sync_playwright

PRODUCT_TITLE = "Kantonale Gewerbesteuer: Soll/Ist und Jahreshochrechnung 2022–2026"
PRODUCT_SLUG = "kantonale-gewerbesteuer-soll-ist-2022-2026"


def headers(user_id: str) -> dict[str, str]:
    return {"X-DaCa-User": user_id}


def wait_json(
    url: str,
    predicate,
    *,
    timeout: float = 180,
    request_headers: dict[str, str] | None = None,
) -> Any:
    deadline = time.monotonic() + timeout
    last: Any = None
    while time.monotonic() < deadline:
        response = httpx.get(url, timeout=15, headers=request_headers)
        response.raise_for_status()
        last = response.json()
        if predicate(last):
            return last
        time.sleep(2)
    raise AssertionError(f"Condition was not met for {url}; last payload: {last}")


def milestone(page: Page, artifacts: Path, sequence: int, name: str) -> None:
    page.screenshot(
        path=artifacts / f"{sequence:02d}-{name}.png",
        full_page=True,
        animations="disabled",
    )


def select_demo_user(page: Page, user_id: str) -> None:
    selector = page.get_by_label("Demo-Benutzer wechseln")
    expect(selector).to_be_visible()
    selector.select_option(user_id)


def run_daaif_creation(page: Page, daaif_url: str, artifacts: Path) -> dict[str, Any]:
    page.goto(daaif_url)
    page.locator("[data-open-loader-workbench]").first.click()
    expect(page).to_have_url(f"{daaif_url}/loader-workbench")
    generator = page.locator(
        '[data-generator-card][data-generator-id="data_analysts_journey_loader"]'
    )
    expect(generator).to_be_visible(timeout=60_000)
    with page.expect_download() as download_info:
        generator.locator("[data-loader-downloadable-file]").click()
    csv_path = artifacts / "gewerbesteuer_aargau_2022_2026.csv"
    download_info.value.save_as(csv_path)
    assert csv_path.stat().st_size > 0

    with page.expect_response(
        lambda response: (
            response.url.endswith("/api/data-generation-jobs")
            and response.request.method == "POST"
        )
    ) as started_response:
        generator.locator('[data-start-data-generation="data_analysts_journey_loader"]').click()
    journey_job_id = started_response.value.json()["jobId"]
    jobs = wait_json(
        f"{daaif_url}/api/data-generation-jobs",
        lambda payload: any(
            job.get("jobId") == journey_job_id
            and job.get("status") == "completed"
            for job in payload.get("jobs", [])
        ),
        timeout=300,
    )
    journey_job = next(
        job for job in jobs["jobs"] if job.get("jobId") == journey_job_id
    )
    assert journey_job["generatedRows"] == 1500
    assert any("postgres" in str(target).lower() for target in journey_job["writtenTargets"])
    page.reload()
    milestone(page, artifacts, 1, "daaif-electronic-cantons")

    page.goto(f"{daaif_url}/ingestion-workbench")
    page.locator('[data-ingestion-tile="csv"]').click()
    page.locator("[data-csv-file-input]").set_input_files(csv_path)
    submit = page.locator("[data-csv-import-submit]")
    expect(submit).to_be_enabled(timeout=60_000)
    page.locator('[data-csv-target-option][value="s3"]').check()
    page.locator("[data-csv-s3-bucket]").fill("data-analysts-journey")
    page.locator("[data-csv-s3-prefix]").fill("manual/aargau/")
    page.locator('[data-csv-s3-storage-format][value="csv"]').check()
    expect(submit).to_be_enabled(timeout=60_000)
    submit.click()
    expect(page.get_by_text("CSV import finished")).to_be_visible(timeout=180_000)
    page.get_by_role("button", name="OK", exact=True).click()
    milestone(page, artifacts, 2, "daaif-aargau-csv")

    page.goto(f"{daaif_url}/notebooks/data-analysts-journey-cantonal-business-tax")
    cells = page.locator("[data-query-cell]")
    expect(cells).to_have_count(2)
    cells.nth(0).locator("[data-run-cell]").click()
    first_result = cells.nth(0).locator("[data-cell-result]:visible").first
    expect(first_result).to_be_visible(timeout=180_000)
    expect(first_result).to_contain_text("130", timeout=180_000)
    cells.nth(1).locator("[data-run-cell]").click()
    second_result = cells.nth(1).locator("[data-cell-result]:visible").first
    expect(second_result).to_be_visible(timeout=180_000)
    expect(second_result.locator("img")).to_be_visible(timeout=180_000)
    milestone(page, artifacts, 3, "daaif-130-records-and-chart")

    cells.nth(0).locator("[data-publish-journey-data-product]").click()
    dialog = page.locator("[data-data-product-dialog]")
    expect(dialog).to_be_visible()
    dialog.locator("[data-data-product-dialog-next]").click()
    expect(dialog.locator("[data-data-product-title-input]")).to_have_value(PRODUCT_TITLE)
    dialog.locator("[data-data-product-dialog-next]").click()
    expect(dialog.locator("[data-data-product-dialog-publish]")).to_be_visible(timeout=60_000)
    with page.expect_response(
        lambda response: (
            response.url.endswith("/api/data-products") and response.request.method == "POST"
        )
    ) as published_response:
        dialog.locator("[data-data-product-dialog-publish]").click()
    payload = published_response.value.json()
    assert payload["product"]["title"] == PRODUCT_TITLE
    assert payload["dacaPublication"]["state"] == "pending_review"
    expect(page.get_by_text("Data product published and sent to DaCa")).to_be_visible()
    milestone(page, artifacts, 4, "daaif-published-to-daca")
    return payload


def complete_quality(
    page: Page, catalog_url: str, product_id: str, artifacts: Path
) -> dict[str, Any]:
    page.goto(f"{catalog_url}/products/{product_id}/quality?demoUser=joel.ruod")
    expect(page.get_by_role("heading", name="Von DAAIF zu Platinum")).to_be_visible()

    page.get_by_role("button", name="Technik REST und Schema").click()
    keys = page.locator(".quality-fields input[type=checkbox]")
    if not any(keys.nth(index).is_checked() for index in range(keys.count())):
        keys.first.check()

    page.get_by_role("button", name="Fachlichkeit Beschreibungen").click()
    if len(page.get_by_label("Beschreibung", exact=True).input_value().strip()) < 20:
        page.get_by_label("Beschreibung", exact=True).fill(
            "Aggregierte synthetische Soll-, Ist- und Prognosewerte der kantonalen Gewerbesteuer."
        )
    if not page.get_by_label("Fachgebiet", exact=True).input_value().strip():
        page.get_by_label("Fachgebiet", exact=True).fill("Kantonale Gewerbesteuer")
    if not page.get_by_label("Kontakt", exact=True).input_value().strip():
        page.get_by_label("Kontakt", exact=True).fill("joel.ruod@efv.admin.ch")
    if not page.get_by_label("Aktualisierung", exact=True).input_value().strip():
        page.get_by_label("Aktualisierung", exact=True).fill("monthly")
    discoverable = page.get_by_test_id("quality-discoverable")
    if not discoverable.is_checked():
        discoverable.check()
    descriptions = page.locator(".quality-field-descriptions input")
    for index in range(descriptions.count()):
        if not descriptions.nth(index).input_value().strip():
            descriptions.nth(index).fill(
                f"Fachlich bestätigte synthetische Kennzahl {index + 1} der kantonalen Gewerbesteuer."
            )

    page.get_by_role("button", name="DCAT Katalogprofil").click()
    dcat_checks = page.locator(".quality-dcat input[type=checkbox]")
    expect(dcat_checks).to_have_count(4)
    for index in range(dcat_checks.count()):
        if not dcat_checks.nth(index).is_checked():
            dcat_checks.nth(index).check()

    page.get_by_role("button", name="Ontologie Kanonische Begriffe").click()
    product_class = page.locator(".quality-workspace > label select")
    expect(product_class).to_be_visible()
    product_class.select_option(index=1)
    field_terms = page.locator(".quality-ontology-fields select")
    expect(field_terms.first).to_be_visible()
    for index in range(field_terms.count()):
        field_terms.nth(index).select_option(
            index=min(index + 1, field_terms.nth(index).locator("option").count() - 1)
        )

    page.get_by_role("button", name="Graphify Kontext prüfen").click()
    graph = page.locator(".quality-confirm input[type=checkbox]")
    if not graph.is_checked():
        graph.check()
    with page.expect_response(
        lambda response: (
            response.url.endswith(f"/data-products/{product_id}/quality")
            and response.request.method == "PUT"
        )
    ) as quality_response:
        page.get_by_test_id("quality-save").click()
    quality = quality_response.value.json()
    assert quality["medal"] == "gold", quality
    assert quality["score"] == 5
    milestone(page, artifacts, 5, "daca-quality-gold")
    return quality


def submit_beat_request(
    page: Page, catalog_url: str, product_id: str, artifacts: Path
) -> tuple[dict[str, Any], date, date]:
    select_demo_user(page, "beat.stalder")
    with page.expect_response(
        lambda response: (
            "/api/v1/data-products?" in response.url
            and response.request.method == "GET"
            and response.status == 200
        )
    ) as products_response:
        page.goto(f"{catalog_url}/?demoUser=beat.stalder")
    product_items = products_response.value.json().get("items", [])
    assert any(item.get("id") == product_id for item in product_items)
    page.wait_for_timeout(500)
    search = page.get_by_label("Suchbegriff")
    search.fill("Gewerbesteuer")
    expect(page.get_by_text(PRODUCT_TITLE)).to_be_visible(timeout=30_000)
    milestone(page, artifacts, 6, "daca-beat-finds-product")

    start = datetime.now(UTC).date()
    end = start + timedelta(days=365)
    page.goto(f"{catalog_url}/products/{product_id}/access-request")
    expect(page.get_by_text("Beat Stalder", exact=True)).to_be_visible()
    page.get_by_label("Verwendungszweck *").fill(
        "Kantonale Finanzanalyse und Plausibilisierung der aggregierten Gewerbesteuerdaten."
    )
    page.get_by_label("Rechtsgrundlage / Auftrag *").select_option("Amtshilfe zwischen Behörden")
    page.get_by_label("Bereitstellung *").select_option("http")
    page.get_by_label("Datenvariante *").select_option("original")
    page.get_by_label("Gültig ab *").fill(start.isoformat())
    page.get_by_label("Gültig bis *").fill(end.isoformat())
    page.locator(".access-request-consent input").check()
    with page.expect_response(
        lambda response: (
            response.url.endswith(f"/data-products/{product_id}/access-requests")
            and response.request.method == "POST"
        )
    ) as request_response:
        page.get_by_role("button", name="Zugriffsanfrage einreichen").click()
    request = request_response.value.json()
    assert request["status"] == "submitted"
    expect(page.get_by_text("Ihre Zugriffsanfrage ist eingegangen")).to_be_visible()
    milestone(page, artifacts, 7, "daca-access-request-submitted")
    return request, start, end


def submit_and_approve_governance(
    page: Page,
    catalog_url: str,
    product_id: str,
    access_request: dict[str, Any],
    artifacts: Path,
) -> dict[str, Any]:
    select_demo_user(page, "joel.ruod")
    page.goto(f"{catalog_url}/tasks?demoUser=joel.ruod")
    task = page.get_by_role("heading", name="Beat Stalder", exact=True).locator(
        "xpath=ancestor::article"
    )
    expect(task).to_be_visible()
    task.get_by_role("link", name="In Zugriffseinstellung übernehmen").click()
    expect(page.get_by_test_id("journey-linked-access-request")).to_contain_text(
        access_request["requestNumber"]
    )
    with page.expect_response(
        lambda response: (
            response.url.endswith(f"/data-products/{product_id}/governance-submissions")
            and response.request.method == "POST"
        )
    ) as submission_response:
        page.get_by_test_id("journey-submit-governance").click()
    submission = submission_response.value.json()
    assert submission["status"] == "pending_approval"
    assert submission["reviewSnapshot"]["accessRequestFulfillments"][0]["fulfillmentSubject"] == {
        "type": "group",
        "id": "kanton-st-gallen",
    }
    assert submission["archiveEvidence"]["retentionYears"] == 20
    milestone(page, artifacts, 8, "daca-governance-submitted")

    select_demo_user(page, "thomas.kriegli")
    page.goto(
        f"{catalog_url}/governance-submissions/{submission['id']}?demoUser=thomas.kriegli"
    )
    expect(page.get_by_test_id("governance-request-fulfillment")).to_contain_text(
        access_request["requestNumber"]
    )
    with page.expect_response(
        lambda response: (
            response.url.endswith(f"/governance-submissions/{submission['id']}/decision")
            and response.request.method == "POST"
        )
    ):
        page.get_by_test_id("governance-approve").click()
    expect(
        page.get_by_text(
            "Publiziert. PostgreSQL und OPA haben exakt diese Policy-Revision bestätigt."
        )
    ).to_be_visible(timeout=60_000)
    milestone(page, artifacts, 9, "daca-four-eyes-approved")
    return submission


def assert_enforcement_and_evidence(
    daaif_url: str,
    catalog_url: str,
    product_id: str,
    submission: dict[str, Any],
) -> dict[str, Any]:
    final_submission = wait_json(
        f"{catalog_url}/api/v1/governance-submissions/{submission['id']}",
        lambda payload: payload.get("status") == "approved",
        timeout=60,
        request_headers=headers("thomas.kriegli"),
    )
    product = httpx.get(
        f"{catalog_url}/api/v1/data-products/{product_id}",
        headers=headers("joel.ruod"),
    ).json()
    quality = httpx.get(
        f"{catalog_url}/api/v1/data-products/{product_id}/quality",
        headers=headers("joel.ruod"),
    ).json()["quality"]
    assert quality["medal"] == "platinum"
    assert quality["score"] == 6

    request = httpx.get(
        f"{catalog_url}/api/v1/access-requests/mine", headers=headers("beat.stalder")
    ).json()[0]
    assert request["status"] == "granted_original"
    assert request["fulfillmentSubjectType"] == "group"
    assert request["fulfillmentSubjectId"] == "kanton-st-gallen"
    assert request["decisionPolicyRevisionId"] == final_submission["policyRevisionId"]

    policy = httpx.get(
        f"{catalog_url}/api/v1/data-products/{product_id}/policies/latest",
        headers=headers("joel.ruod"),
    ).json()
    assert policy["revision"] == submission["policyRevision"]
    assert {item["target"] for item in policy["deployments"] if item["state"] == "deployed"} == {
        "opa",
        "postgresql",
    }
    assert all(
        grant["metadataChannels"] == {"kobyMcp": True, "i14y": True}
        for grant in policy["definition"]["grants"]
    )

    deliveries = httpx.get(
        f"{catalog_url}/api/v1/data-products/{product_id}/metadata-deliveries",
        headers=headers("joel.ruod"),
    ).json()
    assert len(deliveries) == 1
    assert deliveries[0]["status"] == "simulated_delivered"
    assert final_submission["archiveEvidence"] == submission["archiveEvidence"]
    assert final_submission["archiveEvidence"]["networkCallCreated"] is False

    endpoint = f"{daaif_url}/api/public/data-products/{PRODUCT_SLUG}"
    for identity in ("beat.stalder", "daniel.aebischer", "thomas.kriegli"):
        response = httpx.get(endpoint, headers=headers(identity), timeout=30)
        assert response.status_code == 200, (identity, response.text)
        payload = response.json()
        assert payload["product"]["title"] == PRODUCT_TITLE
        assert payload.get("total", 130) == 130
    denied = httpx.get(endpoint, headers=headers("claudia.frei"), timeout=30)
    assert denied.status_code == 403

    return {
        "productId": product_id,
        "productUrn": product["urn"],
        "policyRevision": policy["revision"],
        "accessRequest": request["requestNumber"],
        "quality": quality,
        "i14yDeliveries": len(deliveries),
        "enforcement": {
            "beat.stalder": 200,
            "daniel.aebischer": 200,
            "thomas.kriegli": 200,
            "claudia.frei": 403,
        },
    }


def test_data_analyst_golden_path() -> None:
    daaif_url = os.environ["DAAIF_BASE_URL"]
    catalog_url = os.environ["DACA_BASE_URL"]
    artifacts = Path(os.environ["JOURNEY_ARTIFACTS"])
    summary: dict[str, Any] = {
        "dacaSha": os.environ["DACA_GIT_SHA"],
        "daaifSha": os.environ["DAAIF_GIT_SHA"],
        "status": "failed",
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=os.environ.get("JOURNEY_HEADED") != "1")
        context = browser.new_context(
            viewport={"width": 1600, "height": 1000},
            record_video_dir=artifacts / "video",
            record_video_size={"width": 1600, "height": 1000},
            locale="de-CH",
            timezone_id="Europe/Zurich",
        )
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = context.new_page()
        try:
            publication = run_daaif_creation(page, daaif_url, artifacts)
            product_id = publication["dacaPublication"]["productId"]
            complete_quality(page, catalog_url, product_id, artifacts)
            access_request, _, _ = submit_beat_request(page, catalog_url, product_id, artifacts)
            submission = submit_and_approve_governance(
                page, catalog_url, product_id, access_request, artifacts
            )
            summary.update(
                assert_enforcement_and_evidence(daaif_url, catalog_url, product_id, submission)
            )
            summary["status"] = "passed"
        finally:
            context.tracing.stop(path=artifacts / "trace.zip")
            context.close()
            browser.close()
            (artifacts / "summary.json").write_text(
                json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            (artifacts / "summary.md").write_text(
                "# Data Analyst Golden Path\n\n"
                f"- Status: **{summary['status']}**\n"
                f"- DaCa commit: `{summary['dacaSha']}`\n"
                f"- DAAIF commit: `{summary['daaifSha']}`\n"
                f"- Product URN: `{summary.get('productUrn', 'not reached')}`\n"
                f"- Policy revision: `{summary.get('policyRevision', 'not reached')}`\n",
                encoding="utf-8",
            )
