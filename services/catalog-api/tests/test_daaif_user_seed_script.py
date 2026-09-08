from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[3] / "scripts" / "seed_daaif_christian_spider.py"


def load_seed_module():
    spec = importlib.util.spec_from_file_location("seed_daaif_christian_spider", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def make_daaif_fixture(root: Path, module) -> None:
    for patch in module.PATCHES:
        path = root / patch.relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"prefix\n{patch.marker}suffix\n", encoding="utf-8")


def test_seed_helper_checks_applies_and_is_idempotent(tmp_path, capsys):
    module = load_seed_module()
    make_daaif_fixture(tmp_path, module)

    assert module.run(tmp_path, apply=False) == 1
    assert "needs update" in capsys.readouterr().out

    assert module.run(tmp_path, apply=True) == 0
    for patch in module.PATCHES:
        path = tmp_path / patch.relative_path
        assert module.USER_ID in path.read_text(encoding="utf-8")
        assert path.with_suffix(path.suffix + ".daca-seed.bak").exists()

    assert module.run(tmp_path, apply=False) == 0
    assert "already configured" in capsys.readouterr().out


def test_seed_helper_refuses_unknown_file_shape(tmp_path):
    module = load_seed_module()
    make_daaif_fixture(tmp_path, module)
    first = tmp_path / module.PATCHES[0].relative_path
    first.write_text("unexpected", encoding="utf-8")

    try:
        module.planned_changes(tmp_path)
    except ValueError as exc:
        assert "Expected exactly one marker" in str(exc)
    else:
        raise AssertionError("unknown DAAIF file shape must be rejected")
