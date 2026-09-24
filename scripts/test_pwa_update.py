from __future__ import annotations

import argparse
import contextlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import BrowserContext, Page, Playwright, expect, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_APP = Path("apps/catalog-ui")
DESIGN_SYSTEM = Path("packages/design-system")
VERSION_FILE = DESIGN_SYSTEM / "src/lib/version.ts"
RELEASE_HISTORY_FILE = DESIGN_SYSTEM / "src/lib/release-history.ts"
NGSW_CONFIG = CATALOG_APP / "ngsw-config.json"
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
VERSION_DECLARATION = re.compile(
    r"(?m)^export const DACA_VERSION = '(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)' as const;$"
)
RELEASE_HISTORY_DECLARATION = re.compile(
    r"(?m)^const CURRENT_RELEASE_VERSION: typeof DACA_VERSION = '(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)';$"
)
HASHED_ASSET = re.compile(
    r"(?:^|[-.])[A-Z0-9_-]{8,}\.(?:css|js|svg|png|ico|webp|avif)$", re.IGNORECASE
)


@dataclass(frozen=True)
class ProductionBuild:
    version: str
    root: Path


def previous_test_version(version: str) -> str:
    match = SEMVER.fullmatch(version)
    if match is None:
        raise ValueError(f"VERSION must be strict SemVer, got {version!r}.")
    major, minor, patch = (int(value) for value in match.groups())
    if patch > 0:
        return f"{major}.{minor}.{patch - 1}"
    if minor > 0:
        return f"{major}.{minor - 1}.0"
    if major > 0:
        return f"{major - 1}.0.0"
    raise ValueError("The PWA A/B smoke cannot derive a predecessor for version 0.0.0.")


def copy_source_snapshot(destination: Path) -> None:
    def ignore(_directory: str, names: list[str]) -> set[str]:
        return {name for name in names if name in {".angular", "dist", "node_modules"}}

    shutil.copytree(REPO_ROOT / CATALOG_APP, destination / CATALOG_APP, ignore=ignore)
    shutil.copytree(REPO_ROOT / DESIGN_SYSTEM, destination / DESIGN_SYSTEM, ignore=ignore)

    # TypeScript must resolve the copied design-system sources instead of the workspace
    # junction inside the repository's shared node_modules directory.
    tsconfig_path = destination / CATALOG_APP / "tsconfig.json"
    tsconfig = json.loads(tsconfig_path.read_text(encoding="utf-8"))
    compiler_options = tsconfig.setdefault("compilerOptions", {})
    compiler_options["paths"] = {
        "@bit-daca/design-system": ["../../packages/design-system/src/public-api.ts"]
    }
    tsconfig_path.write_text(f"{json.dumps(tsconfig, indent=2)}\n", encoding="utf-8")


def link_dependencies(snapshot: Path) -> None:
    source = REPO_ROOT / "node_modules"
    destination = snapshot / "node_modules"
    try:
        destination.symlink_to(source, target_is_directory=True)
    except OSError:
        if os.name != "nt":
            raise
        subprocess.run(
            ["cmd", "/d", "/c", "mklink", "/J", str(destination), str(source)],
            check=True,
            capture_output=True,
            text=True,
        )


def set_snapshot_version(snapshot: Path, version: str) -> None:
    version_path = snapshot / VERSION_FILE
    source = version_path.read_text(encoding="utf-8")
    replacement = f"export const DACA_VERSION = '{version}' as const;"
    updated, count = VERSION_DECLARATION.subn(replacement, source)
    if count != 1:
        raise AssertionError(
            f"Expected one DACA_VERSION declaration in {version_path}; found {count}."
        )
    version_path.write_text(updated, encoding="utf-8")

    release_history_path = snapshot / RELEASE_HISTORY_FILE
    release_history = release_history_path.read_text(encoding="utf-8")
    updated_history, count = RELEASE_HISTORY_DECLARATION.subn(
        f"const CURRENT_RELEASE_VERSION: typeof DACA_VERSION = '{version}';",
        release_history,
    )
    if count != 1:
        raise AssertionError(
            f"Expected one current release declaration in {release_history_path}; found {count}."
        )
    release_history_path.write_text(updated_history, encoding="utf-8")

    config_path = snapshot / NGSW_CONFIG
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["appData"] = {
        "schemaVersion": 1,
        "appId": "catalog-ui",
        "releaseVersion": version,
    }
    config_path.write_text(f"{json.dumps(config, indent=2)}\n", encoding="utf-8")


def locate_browser_output(output: Path) -> Path:
    candidates = (output / "browser", output)
    for candidate in candidates:
        if (candidate / "index.html").is_file() and (candidate / "ngsw.json").is_file():
            return candidate
    raise AssertionError(f"Angular build at {output} did not produce index.html and ngsw.json.")


def build_catalog(snapshot: Path, output: Path, version: str) -> ProductionBuild:
    copy_source_snapshot(snapshot)
    link_dependencies(snapshot)
    set_snapshot_version(snapshot, version)

    cli = REPO_ROOT / "node_modules/@angular/cli/bin/ng.js"
    environment = os.environ.copy()
    environment.update({"CI": "true", "NG_CLI_ANALYTICS": "false"})
    subprocess.run(
        [
            sys.executable if cli.suffix == ".py" else "node",
            str(cli),
            "build",
            "--configuration",
            "production",
            "--output-path",
            str(output),
        ],
        cwd=snapshot / CATALOG_APP,
        env=environment,
        check=True,
    )

    browser_root = locate_browser_output(output)
    manifest = json.loads((browser_root / "ngsw.json").read_text(encoding="utf-8"))
    expected_app_data = {
        "schemaVersion": 1,
        "appId": "catalog-ui",
        "releaseVersion": version,
    }
    if manifest.get("appData") != expected_app_data:
        raise AssertionError(
            f"Generated ngsw.json appData is {manifest.get('appData')!r}; "
            f"expected {expected_app_data!r}."
        )
    return ProductionBuild(version=version, root=browser_root)


class SwitchingStaticServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], initial: ProductionBuild):
        super().__init__(address, PwaRequestHandler)
        self._lock = threading.Lock()
        self._build = initial
        self._asset_delay_seconds = 0.0

    @property
    def build(self) -> tuple[ProductionBuild, float]:
        with self._lock:
            return self._build, self._asset_delay_seconds

    def switch(self, build: ProductionBuild, *, asset_delay_seconds: float = 0.0) -> None:
        with self._lock:
            self._build = build
            self._asset_delay_seconds = asset_delay_seconds


class PwaRequestHandler(BaseHTTPRequestHandler):
    server: SwitchingStaticServer

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def do_GET(self) -> None:
        request_path = unquote(urlsplit(self.path).path)
        if request_path.startswith("/api/") or request_path in {"/api", "/openapi.json"}:
            self._send_json(
                HTTPStatus.SERVICE_UNAVAILABLE, {"detail": "PWA smoke: API unavailable"}
            )
            return

        build, asset_delay_seconds = self.server.build
        relative = request_path.lstrip("/") or "index.html"
        candidate = (build.root / relative).resolve()
        try:
            candidate.relative_to(build.root.resolve())
        except ValueError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not candidate.is_file():
            candidate = build.root / "index.html"

        if asset_delay_seconds and HASHED_ASSET.search(candidate.name):
            # Keep VERSION_DETECTED and VERSION_READY observably separate even on a very fast
            # loopback filesystem. This avoids a timing-only failure without changing either
            # build or the service worker protocol under test.
            time.sleep(asset_delay_seconds)

        payload = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        if candidate.suffix == ".webmanifest":
            content_type = "application/manifest+json"

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Service-Worker-Allowed", "/")
        if candidate.name in {
            "index.html",
            "ngsw.json",
            "ngsw-worker.js",
            "safety-worker.js",
            "worker-basic.min.js",
        }:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        elif HASHED_ASSET.search(candidate.name):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, status: HTTPStatus, value: dict[str, str]) -> None:
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)


@contextlib.contextmanager
def serve(build: ProductionBuild) -> Iterator[tuple[SwitchingStaticServer, str]]:
    server = SwitchingStaticServer(("127.0.0.1", 0), build)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server, f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


EVIDENCE_RECORDER = """
(() => {
  try {
    if (location.origin === 'null') return;
    const count = Number(sessionStorage.getItem('dacaPwaSmokeLoads') || '0') + 1;
    sessionStorage.setItem('dacaPwaSmokeLoads', String(count));
    const capture = () => {
      const overlay = document.querySelector('[data-testid="app-update-overlay"]');
      if (!overlay) return;
      const text = (overlay.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) return;
      const history = JSON.parse(sessionStorage.getItem('dacaPwaSmokeEvidence') || '[]');
      if (!history.includes(text)) history.push(text);
      sessionStorage.setItem('dacaPwaSmokeEvidence', JSON.stringify(history));
    };
    addEventListener('DOMContentLoaded', () => {
      capture();
      new MutationObserver(capture).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }, { once: true });
  } catch (_) {}
})();
"""


def new_context(playwright: Playwright) -> BrowserContext:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(service_workers="allow")
    context.route(
        "**/api/v1/session",
        lambda route: route.fulfill(status=200, json={"userId": "joel.ruod"}),
    )
    context.add_init_script(EVIDENCE_RECORDER)
    return context


def wait_for_controlled_app(page: Page, origin: str, version: str) -> None:
    page.goto(origin, wait_until="domcontentloaded")
    expect(page.locator('.daca-version-overlay-value')).to_have_text(f"V{version}", timeout=30_000)
    page.evaluate("async () => { await navigator.serviceWorker.ready; }")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=30_000)
    expect(page.locator('.daca-version-overlay-value')).to_have_text(f"V{version}", timeout=30_000)


def reset_evidence(page: Page) -> None:
    page.evaluate(
        """() => {
          sessionStorage.setItem('dacaPwaSmokeLoads', '0');
          sessionStorage.removeItem('dacaPwaSmokeEvidence');
        }"""
    )


def evidence(page: Page) -> str:
    return page.evaluate(
        "() => JSON.parse(sessionStorage.getItem('dacaPwaSmokeEvidence') || '[]').join(' | ')"
    )


def assert_update_evidence(page: Page, old: str, new: str) -> None:
    captured = evidence(page)
    if "Updating Version..." not in captured:
        raise AssertionError(
            f"The blocking update overlay was not observed. Captured: {captured!r}"
        )
    expected_transition = f"DaCa Catalog · V{old} → V{new}"
    if expected_transition not in captured:
        raise AssertionError(
            f"The update overlay did not identify {expected_transition!r}. Captured: {captured!r}"
        )


def assert_load_count(page: Page, expected_count: int) -> None:
    actual = page.evaluate("() => Number(sessionStorage.getItem('dacaPwaSmokeLoads') || '0')")
    if actual != expected_count:
        raise AssertionError(f"Expected {expected_count} document load(s), observed {actual}.")


def test_startup_update(
    playwright: Playwright,
    server: SwitchingStaticServer,
    origin: str,
    old: ProductionBuild,
    new: ProductionBuild,
) -> None:
    server.switch(old)
    context = new_context(playwright)
    try:
        page = context.new_page()
        wait_for_controlled_app(page, origin, old.version)
        reset_evidence(page)

        # Navigating away creates a fresh application startup while preserving this tab's
        # sessionStorage. The existing service worker still serves version A after the server
        # atomically switches to version B on the same origin.
        page.goto("about:blank")
        server.switch(new, asset_delay_seconds=0.08)
        page.goto(origin, wait_until="domcontentloaded")

        confirmation = page.locator('[data-testid="app-update-confirmation"]')
        expect(confirmation).to_be_visible(timeout=45_000)
        expect(confirmation).to_contain_text(f"V{old.version} → V{new.version}")
        assert_load_count(page, 1)
        confirmation.get_by_role(
            "button", name=re.compile(r"Update später durchführen|Update later", re.IGNORECASE)
        ).click()
        expect(confirmation).not_to_be_visible()
        assert_load_count(page, 1)

        page.locator('[data-testid="app-update-reload"]').click()
        expect(confirmation).to_be_visible()
        confirmation.get_by_role(
            "button", name=re.compile(r"Update durchführen|Apply update", re.IGNORECASE)
        ).click()

        expect(page.locator('.daca-version-overlay-value')).to_have_text(f"V{new.version}", timeout=45_000)
        page.wait_for_timeout(500)
        assert_update_evidence(page, old.version, new.version)
        assert_load_count(page, 2)
        print(f"PASS startup update: V{old.version} -> V{new.version}, deferred then confirmed reload")
    finally:
        context.browser.close()


def test_mid_session_update(
    playwright: Playwright,
    server: SwitchingStaticServer,
    origin: str,
    old: ProductionBuild,
    new: ProductionBuild,
) -> None:
    server.switch(old)
    context = new_context(playwright)
    try:
        page = context.new_page()
        wait_for_controlled_app(page, origin, old.version)
        reset_evidence(page)

        page.keyboard.press("Tab")
        server.switch(new, asset_delay_seconds=0.08)
        page.evaluate("() => window.dispatchEvent(new Event('online'))")

        reload_button = page.locator('[data-testid="app-update-reload"]')
        expect(reload_button).to_be_visible(timeout=45_000)
        assert_load_count(page, 0)

        confirmation = page.locator('[data-testid="app-update-confirmation"]')
        expect(confirmation).to_be_visible()
        expect(confirmation).to_contain_text(f"V{old.version} → V{new.version}")
        confirmation.get_by_role(
            "button", name=re.compile(r"Update durchführen|Apply update", re.IGNORECASE)
        ).click()

        expect(page.locator('.daca-version-overlay-value')).to_have_text(f"V{new.version}", timeout=45_000)
        page.wait_for_timeout(500)
        assert_update_evidence(page, old.version, new.version)
        assert_load_count(page, 1)
        print(
            f"PASS session update: confirmation, V{old.version} -> V{new.version}, exactly one reload"
        )
    finally:
        context.browser.close()


def parse_args() -> argparse.Namespace:
    target = (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip()
    parser = argparse.ArgumentParser(
        description=(
            "Build and serve two catalog PWA releases on one origin, then verify Angular's "
            "confirmed startup and session update flows in Chromium."
        )
    )
    parser.add_argument("--to-version", default=target)
    parser.add_argument("--from-version", default=previous_test_version(target))
    parser.add_argument(
        "--keep-builds",
        type=Path,
        help="Optional directory in which to retain both temporary production builds.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if SEMVER.fullmatch(args.from_version) is None or SEMVER.fullmatch(args.to_version) is None:
        raise ValueError("--from-version and --to-version must use strict X.Y.Z SemVer.")
    if args.from_version == args.to_version:
        raise ValueError("The two PWA smoke versions must differ.")

    with tempfile.TemporaryDirectory(prefix="daca-pwa-update-") as temporary:
        temporary_root = Path(temporary)
        old = build_catalog(
            temporary_root / "source-a",
            temporary_root / "build-a",
            args.from_version,
        )
        new = build_catalog(
            temporary_root / "source-b",
            temporary_root / "build-b",
            args.to_version,
        )

        if args.keep_builds:
            args.keep_builds.mkdir(parents=True, exist_ok=True)
            shutil.copytree(old.root, args.keep_builds / args.from_version, dirs_exist_ok=True)
            shutil.copytree(new.root, args.keep_builds / args.to_version, dirs_exist_ok=True)

        with serve(old) as (server, origin), sync_playwright() as playwright:
            test_startup_update(playwright, server, origin, old, new)
            test_mid_session_update(playwright, server, origin, old, new)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
