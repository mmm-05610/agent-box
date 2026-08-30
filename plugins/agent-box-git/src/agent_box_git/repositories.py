"""Small plugin-owned repository library; no Core Project entity."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
from typing import Any

class RepositoryLibrary:
    def __init__(self, path: Path):
        self.path = path.resolve(); self.path.parent.mkdir(parents=True, exist_ok=True)
    def list(self, legacy: dict[str, Any] | None = None) -> tuple[dict[str, Any], ...]:
        values = json.loads(self.path.read_text()) if self.path.is_file() else []
        if not isinstance(values, list): values = []
        if not values and legacy and legacy.get("repo"):
            repo = Path(legacy["repo"]).expanduser().resolve()
            values = [{"id": self.identity(repo), "name": repo.name or str(repo), "path": str(repo), "managed_root": legacy.get("managed_root"), "enabled": True}]
        return tuple(dict(value) for value in values if isinstance(value, dict) and value.get("enabled", True))
    @staticmethod
    def identity(path: Path) -> str:
        return "repo-" + hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:16]
    def validate(self, value: dict[str, Any]) -> dict[str, Any]:
        path = Path(str(value.get("path", ""))).expanduser().resolve()
        if not (path / ".git").exists(): raise ValueError("NOT_A_GIT_REPOSITORY")
        return {"id": str(value.get("id") or self.identity(path)), "name": str(value.get("name") or path.name), "path": str(path), "managed_root": str(value.get("managed_root") or path.parent / ".agent-box-worktrees"), "enabled": bool(value.get("enabled", True)), "status": "valid", "git_root": str(path)}
    def add(self, value: dict[str, Any]) -> dict[str, Any]:
        item = self.validate(value); values = [x for x in self.list() if x.get("id") != item["id"]]; values.append(item); self.path.write_text(json.dumps(values, sort_keys=True, indent=2) + "\n"); return item
