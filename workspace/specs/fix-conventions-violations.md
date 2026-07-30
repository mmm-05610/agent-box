# Fix all CONVENTIONS.md violations

Based on `workspace/specs/conventions-audit.md` audit report. Fix every
violation listed in the report, one file at a time.

## Execution rules

1. **Branch**: already on `refactor/fix-resources-audit`
2. **Atomic commits**: each file is a separate commit
3. **Test after every commit**: `python3 -m pytest tests/ -q --ignore=tests/test_wsl_io.py` — all 79 must pass

## Phase 1: providers/apply.py (🔴 26 violations — fix first)

### 1a. Fix bare I/O → core/io.py

Replace all `Path.read_text()` / `Path.write_text()` / `json.loads(path.read_text())` with `core.io` functions:

- `json.loads(settings_path.read_text(...))` → `read_json(settings_path)`
- `settings_path.write_text(json.dumps(data))` → `write_json(settings_path, data)`
- `jsonc_path.read_text(...)` → `read_jsonc(jsonc_path)`
- `config_path.write_text(text)` → `write_text(config_path, text)` (or `write_yaml` for yaml)
- `store_path.read_text(...)` + `json.loads(...)` → `read_json(store_path)`
- `store_path.write_text(json.dumps(...))` → `write_json(store_path, ...)`

### 1b. Fix lazy imports → top-level

- `from ...core.io import write_text` (line ~490) → add `write_text` to existing top-level import
- `from ...core import db` (line ~59) → add to top-level imports: `from ...core import db`

### 1c. Fix direct SQL outside Repository

Line ~61: `conn.execute("UPDATE profiles SET claude_md_ref = ? ...")` — this updates the `profiles` table. Move into `ProfileRepo` as a new method `set_prompt_ref(profile_name, ref)`, then call it from `_apply_claude`.

### 1d. Fix agent_type dispatch → registry-driven

Lines 74-92: `if agent_type == "claude": ... elif "codex": ... elif "hermes": ... elif "opencode": ...` — this pattern appears 3× in providers/apply.py (apply_provider, _apply_overwrite, _apply_additive). Replace hardcoded dispatch with per-agent writer callbacks stored in the registry.

Add to `core/library.py` for each agent type:
```python
"_apply_provider": _apply_claude,   (etc.)
```
These are private functions from `providers/apply.py` — import them in `library.py` per-entry, or use string names and dispatch via a lookup dict in `providers/apply.py`.

The cleanest approach: add a `_writer` callable to each type's entry in `_AGENT_TYPES`, OR build a dispatch dict in `providers/apply.py` using registry metadata:
```python
_WRITERS = {
    "overwrite": {"claude": _apply_claude, "codex": _apply_codex},
    "additive": {"hermes": _apply_hermes, "opencode": _apply_opencode},
}
```
Then `apply_provider` dispatches via:
```python
mode = agent_config["provider_apply_mode"]
writer = _WRITERS[mode][profile_agent_type]
writer(...)
```

### 1e. Fix hardcoded filenames → registry

- `"settings.json"` (line ~107) → `agent_config["config_files"][0]`
- `"config.toml"` (line ~138) → `agent_config["config_files"][0]`
- `"config.yaml"` (line ~212) → `agent_config["config_files"][0]`
- `"opencode.jsonc"` (line ~320) → `agent_config["config_files"][0]`
- `"auth.json"` (line ~141 and similar) → `agent_config["config_files"][1]`

## Phase 2: mcp/apply.py (🔴 12 violations)

### 2a. Fix bare I/O → core/io.py

- `json.loads(target.read_text(...))` → `read_json(target)`
- `target.read_text(...)` for YAML → `read_yaml(target)`
- `json.loads(target.read_text(...))` (repeated in _list_claude_mcp) → `read_json(target)`

### 2b. Fix agent_type dispatch → registry-driven

Lines 64-72: `if profile_agent_type == "claude": ... elif "codex": ...` — same pattern appears 3× (apply_mcp_server, list_profile_mcp_servers, remove_mcp_from_profile). Build a dispatch dict:

```python
_WRITERS = {
    "claude":   _apply_claude,
    "codex":    _apply_codex,
    "hermes":   _apply_hermes,
    "opencode": _apply_opencode,
}
```
Then dispatch via `writer = _WRITERS.get(profile_agent_type); writer(...)`.

### 2c. Fix hardcoded filename → registry

- `"dot-claude.json"` (lines 89, 288, 378) — Claude's MCP file is at profile root, handled specially. Add a comment explaining why this is NOT in registry: "dot-claude.json lives at profile root (bind-mounted to ~/.claude.json), not in dot-claude/ — this is a bwrap concern, not an agent-type config file".

## Phase 3: profile.py (🔴 6 violations)

### 3a. Move file operations out of ProfileRepo

- `show()` — `data_dir.is_dir()` check: move the `data_dir` existence check to the module-level `show()` wrapper. The repo's `show_repo()` returns raw data; the wrapper adds filesystem info.
- `delete()` — `root.exists()` and `shutil.rmtree(root)`: same approach. `ProfileRepo.delete()` does SQL only. The module-level wrapper handles directory removal.

Refactor:
```python
class ProfileRepo:
    def show_data(name): ...  # SQL + dict building, no filesystem
    def delete_row(name): ...  # DELETE only, no rmtree

# Module-level
show = repo.show_data → wrapped to add filesystem fields
delete = repo.delete_row → wrapped to rmtree after SQL delete
```

### 3b. Fix non-atomic writes

- `extra_path.write_text("{}\n", ...)` (line ~204) → `write_text(extra_path, "{}\n")` — but write_text is already imported
- `(target / prompt_file).write_text(prompt_body)` (line ~335) → `write_text(target / prompt_file, prompt_body)`

## Phase 4: prompts/apply.py (🔴 2 violations)

### 4a. Fix hardcoded agent_type
`if agent_type != "claude":` → check registry field. Currently only Claude supports prompt apply. Add a `supports_prompt_apply` boolean to the registry, or check if the type has a `prompt_file`.

### 4b. Fix direct SQL
`conn.execute("UPDATE profiles SET claude_md_ref = ? ...")` → call `_repo.set_prompt_ref(profile_name, md_id)` (new Repository method added in Phase 1c).

## Phase 5: hooks.py (🔴 2 violations)

### 5a. Fix bare I/O
`json.loads(path.read_text(...))` → `read_json(path)` (path is `settings_path`)

### 5b. Fix hardcoded paths
`if meta["agent_type"] != "claude":` + hardcoded `"settings.json"` — already partially fixed (uses `get_agent_config["supports_hooks"]`). But the file path `config.profile_agent_dir(...) / "settings.json"` — use `agent_config["config_files"][0]` instead.

## Phase 6: config.py (🟡 2 violations — minor)

### 6a. Fix agent_type == "claude" special-casing
Two occurrences of `if agent_type == "claude":` suffix logic:
- `profile_agent_dir` — "dot-claude" vs f"dot-{agent_type}"
- `profile_skills_dir` — same pattern

The "dot-claude" suffix is a historical naming quirk. Move it into the registry as a `profile_dir_suffix` field:
```python
"claude": {"profile_dir_suffix": "dot-claude", ...},
"codex": {"profile_dir_suffix": "dot-codex", ...},
```
Then `config.py` reads from registry: `suffix = agent_config["profile_dir_suffix"]`.

## Overall verification

After ALL phases:
1. `python3 -m pytest tests/ -q --ignore=tests/test_wsl_io.py` — 79 passed
2. `python3 -c "from agent_box.cli import _build_parser"` — no errors
3. Re-run `workspace/specs/conventions-audit.md` — should report 🟢 clean for all files
