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

Existing path registry in `config.py`:

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
use it. Never inline path construction.
