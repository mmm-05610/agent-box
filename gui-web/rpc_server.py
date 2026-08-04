"""RPC server — expose agent_box as a library over stdin/stdout JSON.

The Windows GUI runs ``wsl.exe python3 <this>`` and sends a single JSON
request ``{"method", "args", "kwargs"}`` on stdin; this module dispatches to
``LinuxDataAccess`` (direct agent_box import) and prints
``{"ok": true, "data"}`` or ``{"ok": false, "error"}`` on stdout.

This is the decoupling layer between the GUI and the CLI: the GUI depends
on the agent_box *library*, never on the ``agent-box`` CLI binary.  Mirrors
what ``data_linux.py`` does in-process, transported over the wsl.exe pipe.

Runs inside WSL via plain ``python3`` (no pip / venv / CLI install); the
agent_box library is bundled next to this file in the packaged runtime.
"""

import json
import sys

from data_linux import LinuxDataAccess


def main() -> None:
    data = LinuxDataAccess()
    raw = sys.stdin.read()
    if not raw.strip():
        return
    try:
        req = json.loads(raw)
        method = req["method"]
        fn = getattr(data, method)
        result = fn(*req.get("args", []), **req.get("kwargs", {}))
    except Exception as e:  # surface the error to the GUI caller
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        return
    print(json.dumps({"ok": True, "data": result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
