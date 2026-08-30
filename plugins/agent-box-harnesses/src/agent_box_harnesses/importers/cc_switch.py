"""Read-only cc-switch/ACS JSON export adapter.

The adapter intentionally accepts an export object, not the mutable ACS
database. A future database adapter can produce the same candidate shape.
"""
from __future__ import annotations
import hashlib, json
from pathlib import Path
from typing import Any
from .models import ImportCandidate, ImportPreview
from .legacy_agent_box import _read, _IGNORED
from ..profiles.schema import PROFILE_FIELDS, _looks_secret, normalize_profile, redact_secret_fields

def candidates(root: Path) -> tuple[ImportCandidate, ...]:
    root = root.expanduser().resolve()
    if root.is_file(): paths = [root]
    elif root.is_dir(): paths = sorted(root.glob("*.json"))
    else: return ()
    out = []
    for path in paths:
        try: value = _read(path)
        except ValueError: continue
        if any(k in value for k in ("providers", "mcp_servers", "skills", "profiles")) or value.get("source") == "cc-switch":
            profiles = value.get("profiles") if isinstance(value.get("profiles"), list) else [value]
            for index, item in enumerate(profiles):
                if isinstance(item, dict): out.append(ImportCandidate("cc-switch", str(item.get("id") or path.stem + "-" + str(index)), str(item.get("name") or item.get("id") or path.stem), {"export": path.stem}, str(path)))
    return tuple(out)

def preview(candidate: ImportCandidate) -> ImportPreview:
    value = _read(Path(candidate.path)); item = value
    if isinstance(value.get("profiles"), list): item = next((x for x in value["profiles"] if isinstance(x, dict) and str(x.get("id") or x.get("name")) == candidate.source_id), value["profiles"][0])
    raw = json.dumps(item, sort_keys=True, separators=(",", ":")).encode(); digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    mapped, fields, ignored, rejected = {}, [], [], []
    settings = item.get("settings") or item.get("settings_config") or item.get("config") or {}
    if isinstance(settings, str):
        try: settings = json.loads(settings)
        except json.JSONDecodeError: settings = {}
    for key, child in settings.items() if isinstance(settings, dict) else []:
        if key in _IGNORED or key.endswith("_cache"): ignored.append(key)
        elif _looks_secret(str(key)): rejected.append(key)
        elif key in PROFILE_FIELDS: mapped[key], nested_rejected = redact_secret_fields(child, key); rejected.extend(nested_rejected); fields.append(key)
        else: ignored.append(key)
    endpoint = item.get("endpoint") or item.get("base_url") or item.get("website_url")
    if endpoint and "provider_endpoint" not in mapped: mapped["provider_endpoint"] = endpoint; fields.append("provider_endpoint")
    refs = tuple({"provider": "mcp", "native_id": str(x.get("id") or x.get("name")), "digest": "unverified"} for x in item.get("mcp_servers", []) if isinstance(x, dict))
    locator = {"provider": "cc-switch", "native_locator": str(item.get("credential_locator") or "cc-switch/login")}
    profile = normalize_profile({"config": mapped})
    profile.update({"name": candidate.name, "harness_id": "codex", "capability_refs": list(refs), "credential_source_ref": locator, "import_provenance": {"source_type": "cc-switch", "source_id": candidate.source_id, "source_digest": digest}})
    return ImportPreview("cc-switch", candidate.source_id, candidate.name, digest, tuple(sorted(set(fields))), tuple(sorted(set(ignored))), tuple(sorted(set(rejected))), refs, locator, profile, ("Provider/API-key values are rejected; only endpoint metadata and a locator are imported.",))
