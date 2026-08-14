from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def compose_command(compose: Path, project: str, *args: str) -> list[str]:
    return ["docker", "compose", "-f", str(compose), "-p", project, *args]


def compose_resources(resource: str, project: str) -> list[str]:
    output = subprocess.check_output(
        [
            "docker",
            resource,
            "ls",
            "--filter",
            f"label=com.docker.compose.project={project}",
            "--format",
            "{{.ID}}" if resource != "volume" else "{{.Name}}",
        ],
        text=True,
    )
    return [item for item in output.splitlines() if item.strip()]


def wait_for(url: str, timeout: float = 300) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            response = httpx.get(url, timeout=5, follow_redirects=True)
            if response.status_code < 500:
                return
        except Exception as error:  # noqa: BLE001 - readiness reports the final cause
            last_error = error
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for {url}: {last_error}")


def require_main(repo: Path, label: str) -> None:
    branch = git(repo, "branch", "--show-current")
    head = git(repo, "rev-parse", "HEAD")
    try:
        origin_main = git(repo, "rev-parse", "origin/main")
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"{label} has no origin/main ref") from error
    if branch not in {"", "main"} or head != origin_main:
        raise RuntimeError(
            f"{label} must match origin/main; branch={branch!r}, head={head}, origin/main={origin_main}"
        )
    if git(repo, "status", "--porcelain"):
        raise RuntimeError(f"{label} main worktree must be clean for an official journey")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a transient DAAIF to DaCa journey")
    parser.add_argument("journey", choices=["data-analyst-golden-path"])
    parser.add_argument("--daaif-repo", type=Path)
    parser.add_argument("--artifacts", type=Path)
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--keep-stack", action="store_true")
    parser.add_argument("--require-main", action="store_true")
    parser.add_argument("--skip-build", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    daca_repo = Path(__file__).resolve().parents[4]
    daaif_repo = (
        args.daaif_repo or daca_repo.parent / "tib-daail-evo1-poc-query-engine-alias-fix"
    ).resolve()
    if not (daaif_repo / "bdw" / "Dockerfile").exists():
        raise SystemExit(f"DAAIF repository not found at {daaif_repo}")
    if args.require_main:
        require_main(daca_repo, "DaCa")
        require_main(daaif_repo, "DAAIF")

    run_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    artifacts = (
        args.artifacts or daca_repo / "output" / "playwright" / "data-analyst-journey" / run_id
    ).resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    project = f"daca-journey-{uuid.uuid4().hex[:8]}"
    compose = daca_repo / "journeys" / "compose.yaml"
    daca_port, daaif_port = free_port(), free_port()
    env = {
        **os.environ,
        "DACA_REPO": daca_repo.as_posix(),
        "DAAIF_REPO": daaif_repo.as_posix(),
        "DACA_UI_PORT": str(daca_port),
        "DAAIF_UI_PORT": str(daaif_port),
        "DACA_BASE_URL": f"http://127.0.0.1:{daca_port}",
        "DAAIF_BASE_URL": f"http://127.0.0.1:{daaif_port}",
        "DACA_GIT_SHA": git(daca_repo, "rev-parse", "HEAD"),
        "DAAIF_GIT_SHA": git(daaif_repo, "rev-parse", "HEAD"),
        "JOURNEY_ARTIFACTS": str(artifacts),
        "JOURNEY_HEADED": "1" if args.headed else "0",
    }
    (artifacts / "run.json").write_text(
        json.dumps(
            {
                "runId": run_id,
                "composeProject": project,
                "dacaSha": env["DACA_GIT_SHA"],
                "daaifSha": env["DAAIF_GIT_SHA"],
                "dacaUrl": env["DACA_BASE_URL"],
                "daaifUrl": env["DAAIF_BASE_URL"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    up = ["up", "-d", "--wait", "--wait-timeout", "360"]
    if not args.skip_build:
        up.insert(1, "--build")
    exit_code = 1
    try:
        subprocess.run(compose_command(compose, project, *up), check=True, env=env)
        wait_for(f"{env['DAAIF_BASE_URL']}/")
        wait_for(f"{env['DACA_BASE_URL']}/")
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                str(daca_repo / "journeys" / "data-analyst-golden-path" / "test_golden_path.py"),
                "-q",
                "-s",
                f"--junitxml={artifacts / 'junit.xml'}",
            ],
            cwd=daca_repo,
            env=env,
            check=False,
        )
        exit_code = completed.returncode
    finally:
        with (artifacts / "compose.log").open("w", encoding="utf-8") as output:
            subprocess.run(
                compose_command(compose, project, "logs", "--no-color", "--timestamps"),
                env=env,
                stdout=output,
                stderr=subprocess.STDOUT,
                check=False,
            )
        if args.keep_stack and not os.environ.get("CI"):
            print(f"Debug stack kept: {project}")
        else:
            subprocess.run(
                compose_command(compose, project, "down", "-v", "--remove-orphans"),
                env=env,
                check=False,
            )
            remaining = {
                "containers": compose_resources("container", project),
                "volumes": compose_resources("volume", project),
                "networks": compose_resources("network", project),
            }
            if any(remaining.values()):
                raise RuntimeError(f"Transient Docker resources remain after cleanup: {remaining}")
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
