from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--token")
    args = parser.parse_args()
    token = args.token or os.environ.get("AGENT_BOX_LAUNCH_TOKEN", "")
    if not token:
        raise SystemExit("launch token is required")
    path = Path(token)
    payload = json.loads(path.read_text(encoding="utf-8"))
    argv = payload.get("argv")
    if not isinstance(argv, list) or not argv or any(not isinstance(item, str) or "\0" in item for item in argv):
        raise SystemExit("invalid launch token")
    os.execv(argv[0], argv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
