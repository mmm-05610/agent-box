"""Safe reader for legacy Agent-Box JSON profile exports/directories."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
from typing import Any
from .models import ImportCandidate, ImportPreview
from ..profiles.schema import PROFILE_FIELDS, _looks_secret, normalize_profile, redact_secret_fields

_IGNORED = {"auth.json", "history.json", "history", "sessions", "session", "cache", "runtime", "pid", "lock", "transcript"}

def _read(path: Path) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 128 * 1024:
        raise ValueError("IMPORT_SOURCE_UNSAFE")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("IMPORT_SOURCE_INVALID") from exc
    if not isinstance(value, dict):
        raise ValueError("IMPORT_SOURCE_INVALID")
    return value

def candidates(root: Path) -> tuple[ImportCandidate, ...]:
    root = root.expanduser().resolve()
    if not root.is_dir(): return ()
    paths = sorted({p for p in root.glob("*.json")} | {p for p in (root / "profiles").glob("*.json") if (root / "profiles").is_dir()})
    out = []
    for path in paths:
        try: value = _read(path)
        except ValueError: continue
        out.append(ImportCandidate("legacy-agent-box", path.stem, str(value.get("name") or path.stem), {"agent_type": value.get("agent_type", "codex")}, str(path)))
    return tuple(out)

def preview(candidate: ImportCandidate) -> ImportPreview:
    value = _read(Path(candidate.path)); raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    source_digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    source = dict(value.get("config") if isinstance(value.get("config"), dict) else value)
    for key in ("mcp", "skills", "native_plugins", "hooks", "instructions", "permissions"):
        if key in value and key not in source: source[key] = value[key]
    fields, ignored, rejected = [], [], []
    mapped: dict[str, Any] = {}
    for key, item in source.items():
        if key in _IGNORED or key.endswith("_cache"):
            ignored.append(key); continue
        if _looks_secret(str(key)) or key in {"auth", "credentials"}:
            rejected.append(key); continue
        if key in PROFILE_FIELDS:
            mapped[key], nested_rejected = redact_secret_fields(item, key); rejected.extend(nested_rejected); fields.append(key)
        else:
            ignored.append(key)
    refs = list(value.get("capability_refs") or [])
    for key, provider in (("mcp", "mcp"), ("skills", "skill"), ("native_plugins", "native-plugin")):
        for item in mapped.get(key, []) if isinstance(mapped.get(key), list) else []:
            if isinstance(item, str): refs.append({"provider": provider, "native_id": item, "digest": "unverified"})
    credential = value.get("credential_source_ref") if isinstance(value.get("credential_source_ref"), dict) else None
    if credential and set(credential) - {"provider", "native_locator", "revision", "digest"}:
        credential = {"provider": credential.get("provider"), "native_locator": credential.get("native_locator", "legacy-login")}
    profile = normalize_profile({"config": mapped})
    profile.update({"name": candidate.name, "harness_id": "codex", "capability_refs": refs, "credential_source_ref": credential, "import_provenance": {"source_type": "legacy-agent-box", "source_id": candidate.source_id, "source_digest": source_digest}})
    return ImportPreview("legacy-agent-box", candidate.source_id, candidate.name, source_digest, tuple(sorted(set(fields))), tuple(sorted(set(ignored))), tuple(sorted(set(rejected))), tuple(refs), credential, profile, ("Runtime, cache, history and auth contents are never imported.",))
