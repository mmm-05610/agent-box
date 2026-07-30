# Agent Box — Project Conventions

Rules for both humans and AI. When a standard is agreed upon during
code review, record it here. All code and AI-assisted changes must
follow these conventions.

---

## 1. All filesystem paths defined in `config.py`

No module may construct agent-box paths via `Path.home()` or string
concatenation. Every path that exists on disk must have a corresponding
function in `config.py`.

```python
# ✅ Correct
from . import config
db = config.library_db()

# ❌ Wrong
db = Path.home() / ".agent-box" / "agent-box.db"
```

Existing path registry:

| Function                         | Resolves to                                       |
| -------------------------------- | ------------------------------------------------- |
| `agent_box_home()`               | `~/.agent-box/`                                   |
| `library_db()`                   | `~/.agent-box/agent-box.db`                       |
| `acs_db()`                       | `~/.agent-box/config/cc-switch.db`                |
| `profiles_dir()`                 | `~/.agent-box/profiles/`                          |
| `profile_dir(name)`              | `~/.agent-box/profiles/<name>/`                   |
| `profile_agent_dir(name, type)`  | `~/.agent-box/profiles/<name>/dot-<type>/`        |
| `profile_skills_dir(name, type)` | `~/.agent-box/profiles/<name>/dot-<type>/skills/` |
| `skills_source_dir()`            | `~/.agent-box/config/skills/`                     |
| `package_dir()`                  | `src/agent_box/`                                  |

**When adding a new path:** add a function to `config.py` first, then
use it everywhere else. Never inline path construction.

## 2. Two configuration registries — know the boundary

|         | `config.py`                                      | `core/library.py`                                                 |
| ------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Scope   | **Filesystem paths** — where things live on disk | **Agent-type metadata** — declarative facts about each agent type |
| Example | `profile_dir("mycc")` → `/path/`                 | `get_agent_config("claude")["prompt_file"]` → `"CLAUDE.md"`       |
| Rule    | One path = one function                          | One fact = one field in `_AGENT_TYPES`                            |

`library.py` depends on `config.py` (`package_dir()` for template/preset
resolution). The reverse is not allowed.

There is no third configuration registry. `io.py`, `acs.py`, `launch.py`
are runtime behaviour, not configuration.

## 3. Repository pattern for database tables

Every table in `agent-box.db` gets a Repository class.

```python
class ProfileRepo:
    def find_by_name(name) -> dict  # raises ProfileError if missing
    def update(name, **fields) -> dict
    def insert(name, ...) -> None    # pure INSERT, no file I/O
    def list_all() -> list
    def delete(name, force=False) -> bool
```

- Repository methods only do SQL. No file I/O, no orchestration.
- Module-level functions point to a singleton `_repo` instance —
  backward-compatible API, new code calls the repo directly.
- DB connection via `core.db.get_conn()`. Import at top of file, no
  lazy imports.
- Missing records raise domain-specific errors (`ProfileError`), never
  return `None` or an empty dict.
- All queries use parameterized placeholders (`?`).

## 4. File I/O goes through `core/io.py`

| Category   | Function                    | Returns       | Use for                  |
| ---------- | --------------------------- | ------------- | ------------------------ |
| Read text  | `read_text(path)`           | `str \| None` | Reading prompt bodies    |
| Read JSON  | `read_json(path)`           | `dict`        | `settings.json`          |
| Read JSONC | `read_jsonc(path)`          | `dict`        | `opencode.jsonc`         |
| Read TOML  | `read_toml(path)`           | `dict`        | `config.toml`            |
| Read YAML  | `read_yaml(path)`           | `dict`        | `config.yaml`            |
| Write text | `write_text(path, text)`    | —             | `CLAUDE.md` (atomic)     |
| Write JSON | `write_json(path, data)`    | —             | `settings.json` (atomic) |
| Write TOML | `write_toml(path, data)`    | —             | `config.toml` (atomic)   |
| Write YAML | `write_yaml(path, data)`    | —             | `config.yaml` (atomic)   |
| Merge      | `deep_merge(base, overlay)` | `dict`        | Preset overlay           |

- **Every write is atomic** (temp file → fsync → rename).
- **Every read returns `{}` for a missing file** (except `read_text`,
  which returns `None`).

**Forbidden patterns:**

- `Path.write_text()` / `Path.read_text()` — use `write_text` / `read_text`
- `Path.home()` — use `config` functions (§1)
- `json.loads(path.read_text())` — use `read_json(path)`
- `json.dumps()` + `Path.write_text()` — use `write_json(path, data)`

## 5. Registry-driven — no agent-type hardcoding

Agent-type-specific facts live in `_AGENT_TYPES` in `core/library.py`.
Code must read from the registry, never branch on agent type.

**Forbidden:**

```python
if agent_type == "claude":
    filename = "CLAUDE.md"
elif agent_type == "codex":
    filename = "AGENTS.md"
```

**Required:**

```python
agent_config = library.get_agent_config(agent_type)
filename = agent_config["prompt_file"]
```

Existing registry fields (see `core/library.py` for the full dict):

| Field            | Type  | Example (claude)                                             |
| ---------------- | ----- | ------------------------------------------------------------ |
| `config_dir`     | str   | `"~/.claude"`                                                |
| `binary`         | str   | `"claude"`                                                   |
| `prompt_file`    | str   | `"CLAUDE.md"`                                                |
| `resume_args`    | tuple | `("--continue",)`                                            |
| `config_files`   | list  | `["settings.json"]`                                          |
| `preset_files`   | dict  | `{"CLAUDE.md": {"dest": "CLAUDE.md", "merge": "copy"}, ...}` |
| `mcp_config`     | dict  | `{"filename": "config.toml", "root_key": "mcp_servers"}`     |
| `features`       | tuple | `("permissions", "plugins")`                                 |
| `supports_hooks` | bool  | `true`                                                       |
