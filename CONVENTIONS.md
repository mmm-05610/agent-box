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

## 6. Registry list fields are for iteration, not positional selection

Fields like `config_files` and `extra_profile_files` are lists
because their semantics are "all of these things" — they exist to be
iterated over. When a piece of code needs **one specific file** from
that list, the registry must expose a dedicated named field. Never
use positional indices (`[0]`, `[1]`) to pick an item out of a list.

```python
# ❌ Wrong — assumes hooks live in the first config file
profile_dir / agent_config["config_files"][0]

# ✅ Correct — registry names the file explicitly
profile_dir / agent_config["hooks_config_file"]
```

Looping over the whole list is always fine:

```python
# ✅ Correct — apply every config file
for filename in agent_config["config_files"]:
    ...
```

## 7. Access SQLite rows by column name, not index

`sqlite3.Row` supports both `row[0]` and `row["name"]`. Always use
the column name — it survives schema changes and is self-documenting.

```python
# ✅ Correct
r["id"], r["profile"], r["launched_at"]

# ❌ Wrong
r[0], r[1], r[6]
```

## 8. Strategy registry — dispatch by semantic key, not brand name

Agent-type-specific behaviour is dispatched through a **strategy
registry**, not through `if/elif` chains keyed on agent type names.
The dispatch key must describe **what** the behaviour is, not **who**
uses it.

```python
# ❌ Wrong — dispatch key is a brand name
_OVERWRITE_WRITERS = {"claude": _apply_claude, "codex": _apply_codex}
_ADDITIVE_WRITERS  = {"hermes": _apply_hermes, "opencode": _apply_opencode}

# ✅ Correct — dispatch key describes the format / strategy
_STRATEGIES = {
    "json_merge":              _strategy_json_merge,
    "multi_file":              _strategy_multi_file,
    "yaml_custom_providers":   _strategy_yaml_custom_providers,
    "jsonc_provider":          _strategy_jsonc_provider,
}
```

The mapping from agent type → strategy lives exclusively in the
registry (`_AGENT_TYPES["provider_config"]["strategy"]`). Adding a
new agent type that reuses an existing strategy requires zero code
changes — one line of registry configuration.

This pattern generalises beyond agent types: any system with multiple
consumers that share behavioural categories (payment gateways, auth
providers, file formats, build targets) benefits from semantic
dispatch keys over brand-name dispatch keys.

## 9. Data in registry, logic in function

Agent-type-specific **data** (field names, key names, mapping tables)
must be declared in the registry. Strategy functions contain only
generic **logic** (iteration, conditionals, format conversion).

```python
# library.py — registry (data)
"metadata_fields": ["id", "name", "notes", "website_url", "icon", "icon_color", "category"],
"managed_yaml_keys": ["base_url", "api_key", "api_mode", "default", "models", ...],
"api_mode_mapping": {"chat_completions": "openai_compatible", ...},
"entry_yaml_spec": {
    "fields": [
        {"yaml_key": "base_url", "settings_key": "base_url"},
        {"yaml_key": "api_key",  "settings_key": "api_key", "env_fallback": True},
    ],
    "model_list": {"settings_key": "models", "id_key": "id", "name_key": "name", ...},
},

# apply.py — strategy function (logic)
for field in provider_cfg.get("metadata_fields") or []:
    val = provider.get(field)
    ...
```

When a function body contains a hardcoded field name like `"base_url"`
or `"api_key"`, ask: "is this an agent-type-specific fact or a
generic behaviour?" If the former, move it to the registry.

## 10. Single source of truth for constants

A value that appears in multiple files is a change waiting to break.
The single definition point carries the **semantic intent** (the name
tells you _why_ this value exists), not just the value.

This applies to:

- **Default values** (e.g. the default agent type)
- **Project identity** (e.g. the CLI display name used in prompts, error
  messages, and help text)
- **Any string literal** whose meaning spans multiple modules

```python
# ❌ Wrong — "agent-box" scattered across the codebase
_GLOBAL_PROMPT = "agent-box> "              # shell.py
PROG = "agent-box"                          # cli/__init__.py
self._cmd.perror("agent-box: ...")          # core.py (×12)
print("agent-box: no editor found")         # edit.py

# ✅ Correct — one constant, all references point to it
# config.py
DISPLAY_NAME = "agent-box"

# everywhere else
_GLOBAL_PROMPT = f"{config.DISPLAY_NAME}> "
PROG = config.DISPLAY_NAME
self._cmd.perror(f"{config.DISPLAY_NAME}: ...")
```

The defining characteristic is: **if you renamed the project, how many
files would you edit?** The answer should be one.

## 11. Symmetric operations use symmetric dispatch

Apply and remove are two sides of the same operation. Their dispatch
structures must mirror each other:

```python
_STRATEGIES = {
    "yaml_custom_providers": _strategy_yaml_custom_providers,
    "jsonc_provider":        _strategy_jsonc_provider,
}

_REMOVE_HANDLERS = {
    "yaml_custom_providers": _remove_from_yaml_custom_providers,
    "jsonc_provider":        _remove_from_jsonc_provider,
}
```

If one side uses a dispatch table and the other uses `if/elif`,
adding a new strategy will inevitably miss one. Asymmetric dispatch
structures are a bug source — the asymmetry itself is the defect.

Strategies with `"overwrite"` mode don't need remove handlers (the
next apply naturally overwrites), but the deliberate absence should
be explicit, not accidental.

## 12. Format dispatch belongs in the infrastructure layer

"Read/write a config file and pick the parser by extension" is a
general capability, not business logic. It must not live in
individual resource modules.

```python
# ❌ Wrong — format dispatch duplicated in mcp/apply.py
def _read_config(target):
    fmt = target.suffix.lstrip(".")
    if fmt == "toml":  return read_toml(target)
    if fmt == "yaml":  return read_yaml(target)
    ...

# ✅ Correct — single implementation in core/io.py, everyone imports it
from ...core.io import read_config, write_config

existing = read_config(target)
write_config(target, data)
```

`core/io.py` is the single entry point for all file-format concerns.
Resource modules import only the generic `read_config` / `write_config`
(or the specific reader/writer they need), never reimplement format
dispatch.

## 13. Migrations are a sequence, not a conditional

Schema changes are applied as a numbered sequence of migration files.
The initial schema stays frozen; each change is a new `.sql` file.

```
migrations/
  001_init.sql              ← frozen — never edited after deployment
  002_rename_claude_md_ref.sql  ← one change = one file
```

- Fresh installs replay the full sequence (001 → 002 → ...).
- Existing installs replay only unapplied migrations.
- All paths converge to the same final state.
- No `IF EXISTS` guards, no "check if column exists before altering".

This applies regardless of project maturity. The habit of explicit
state transitions matters more than the presence of production data.

## 14. Git workflow — atomic commits + layered branches + merge approval

Based on the two-level Git Flow model (feature → integration → main),
adapted for single-developer multi-task work.

```
main                  ← only trunk, always releasable
  └── <integration>    ← one big theme (refactor/xxx, feat/xxx), off main
        └── <feature>  ← one independent task, off integration, merged back
```

**Atomic commits.** Each commit is one complete, independent logical unit —
one bug fix, one feature, one refactor. After every commit the code must
build, run, and be revertible. Never mix unrelated changes in one commit;
never commit broken half-work.

**Why**: `git bisect` must pinpoint the exact change that broke something;
`git revert` must roll back one logical unit without collateral damage.

**Branch levels.**

- `main` — updated only at release points; a fresh clone always works.
- integration — one big work theme, carries the finished work of all its
  small tasks.
- feature — one independent task, branched from the integration branch,
  merged back when complete.

**Merge approval boundary.** This defines what an AI agent may do without
asking:

| Operation                    | Allowed                     |
| ---------------------------- | --------------------------- |
| create feature branch        | agent, autonomous           |
| atomic commits               | agent, autonomous           |
| feature → integration merge  | agent, autonomous           |
| integration-internal testing | agent, autonomous           |
| **integration → main merge** | **human approval required** |

`main` is a hard line: any merge into it must stop, report the changes, and
wait for explicit human approval. Inside the integration branch, work is
autonomous. Based on [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
(Driessen) and the trunk-releasability principle.
