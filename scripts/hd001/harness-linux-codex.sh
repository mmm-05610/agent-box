#!/usr/bin/env bash
# B-HARNESS-CODEX-001 (HD-001-C-019): Linux loopback Harness Codex closed-loop assembly.
#
# What this proves (R1 of the batch): the Codex family's own CLI produces a
# deployment.json, the Server loads it with the four documented flags, and the
# existing faces seed a codex Profile + Session with ZERO real model calls
# (no turn is ever sent from this script).
#
# The deployment is produced by agent_box_harnesses.codex.production's own CLI
# (the --artifact-token surface fixed by this batch's G3 amendment); the
# server flags mirror the gate's reviewed loader: --sidecar-deployment
# REQUIRES --plugin-root (agent_box/server/__main__.py), plugin sources are
# read from plugins/agent-box-harnesses, and the artifact rides a --mount
# token binding (codex-runtime), never a host path in the document.
#
# usage: harness-linux-codex.sh --run-dir DIR [--port N] [--artifact PATH]
#        [--keep-running]
# env:   HD001_PYTHON  interpreter with the server dependencies
#        (default order: $HD001_PYTHON, $VIRTUAL_ENV, uv cpython-3.12, python3)
# CHARTER: port/PID/data-root are registered in $RUN/server-registration.json.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN="" PORT="" ARTIFACT="" KEEP=0
FORBIDDEN_PORTS=(18790 18810)

die() { echo "HARNESS_LINUX_CODEX_FAILED: $*" >&2; exit 3; }
usage() { echo "usage: harness-linux-codex.sh --run-dir DIR [--port N] [--artifact PATH] [--keep-running]" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --run-dir) RUN="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --artifact) ARTIFACT="${2:?}"; shift 2 ;;
    --keep-running) KEEP=1; shift ;;
    *) usage ;;
  esac
done
[ -n "$RUN" ] || usage
RUN="$(mkdir -p "$RUN" && cd "$RUN" && pwd)"
# data/ is created by the Server itself: its owner guard refuses a pre-existing
# directory that carries no AgentBox marker.
mkdir -p "$RUN/artifacts" "$RUN/workspace"

PY="${HD001_PYTHON:-}"
if [ -z "$PY" ]; then
  for candidate in "${VIRTUAL_ENV:-/nonexistent}/bin/python" \
      "$HOME/.local/share/uv/python/cpython-3.12.14-linux-x86_64-gnu/bin/python3.12" \
      python3; do
    command -v "$candidate" >/dev/null 2>&1 && { PY="$candidate"; break; }
  done
fi
[ -n "$PY" ] || die "no interpreter found (set HD001_PYTHON)"
export AGENT_BOX_SANDBOX_MODULE="${AGENT_BOX_SANDBOX_MODULE:-agent_box_sandbox_bwrap}"
export PYTHONPATH="$REPO/src:$(ls -d "$REPO"/plugins/*/src | paste -sd:)"\
"${PYTHONPATH:+:$PYTHONPATH}"
# The server dependencies may live only in a sibling venv's site-packages
# (this machine's repository PYTHONPATH preset); import-probe and append.
"$PY" -c 'import uvicorn' 2>/dev/null || for site_packages in \
    "$REPO"/../../*/.venv/lib/python*/site-packages \
    /home/maoqh/projects/agent-box/.venv/lib/python*/site-packages; do
  [ -d "$site_packages" ] || continue
  PYTHONPATH="$PYTHONPATH:$site_packages"
  "$PY" -c 'import uvicorn' 2>/dev/null && break
done
export PYTHONPATH

# The loopback port: explicit or kernel-assigned; never a reserved control port.
if [ -z "$PORT" ]; then
  PORT="$("$PY" -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
fi
for blocked in "${FORBIDDEN_PORTS[@]}"; do
  [ "$PORT" != "$blocked" ] || die "port $blocked is reserved"
done

# 1. The runtime artifact: reuse --artifact or build offline from the locked
#    vendor closure (the same builder the production chain gate runs).
if [ -z "$ARTIFACT" ]; then
  node "$REPO/scripts/server-round1/build-codex-runtime-artifact.mjs" \
      --output "$RUN/artifacts/codex-runtime" --json >/dev/null
  ARTIFACT="$RUN/artifacts/codex-runtime"
fi
[ -d "$ARTIFACT" ] || die "artifact $ARTIFACT is not a directory"
DIGEST="$("$PY" -c 'import pathlib, sys; from agent_box_sandbox_bwrap import runtime_artifact_tree_summary; print(runtime_artifact_tree_summary(pathlib.Path(sys.argv[1]))["digest"])' "$ARTIFACT")"

# 2. install-set production: the family CLI emits the deployment document.
"$PY" -m agent_box_harnesses.codex.production \
  --artifact-token codex-runtime --tree-digest "$DIGEST" \
  --out "$RUN/deployment.json" >/dev/null
grep -q '"id": "codex"' "$RUN/deployment.json" || die "deployment seat missing"

# 3. Server assembly with the four documented flags (no --worker flag exists).
SERVER_PID=""
stop_server() {
  [ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null || true
}
trap '[ "$KEEP" = 1 ] || stop_server' EXIT
"$PY" -m agent_box.server \
  --data-root "$RUN/data" --port "$PORT" \
  --sidecar-deployment "$RUN/deployment.json" \
  --plugin-root "$REPO/plugins/agent-box-harnesses" \
  --mount "codex-runtime=$ARTIFACT" \
  > "$RUN/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 120); do
  curl -fsS "http://127.0.0.1:$PORT/live" >/dev/null 2>&1 && break
  kill -0 "$SERVER_PID" 2>/dev/null || { tail -5 "$RUN/server.log" >&2; die "server exited early"; }
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$PORT/live" >/dev/null || die "server never answered /live"

# 4. CHARTER registration of port/PID/data-root.
"$PY" - "$RUN" "$PORT" "$SERVER_PID" "$DIGEST" "$ARTIFACT" <<'PYEOF'
import datetime, json, pathlib, sys
run, port, pid, digest, artifact = sys.argv[1:6]
pathlib.Path(run, "server-registration.json").write_text(json.dumps({
    "port": int(port), "pid": int(pid), "dataRoot": str(pathlib.Path(run, "data")),
    "deployment": str(pathlib.Path(run, "deployment.json")),
    "pluginRoot": "plugins/agent-box-harnesses", "mountToken": "codex-runtime",
    "artifact": artifact, "treeDigest": digest,
    "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}, indent=1, sort_keys=True) + "\n", encoding="utf-8")
PYEOF

# 5. Seeding + load verification over the product's own faces, zero model
#    calls: wire profiles.create / workspaces.open, REST session create
#    (wire exposes only sessions.createAndSend, which would dispatch a turn).
"$PY" - "$RUN" "$PORT" <<'PYEOF'
import json, pathlib, sys, urllib.request

run, port = sys.argv[1], int(sys.argv[2])
base = f"http://127.0.0.1:{port}"
token = pathlib.Path(run, "data", "secrets", "http-token").read_text(encoding="utf-8").strip()
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def post(path, body, key=None):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if key:
        headers["Idempotency-Key"] = key
    request = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers=headers)
    with opener.open(request, timeout=30) as response:
        return json.loads(response.read().decode())

def wire(method, params):
    body = post(f"/wire/v1/{method}", {"jsonrpc": "2.0", "id": f"hd001-{method}",
                                       "method": method, "params": params})
    if body.get("error") is not None:
        raise SystemExit(f"{method} refused: {json.dumps(body['error'])[:200]}")
    return body["result"]

profile = wire("profiles.create", {"requestId": "hd001-codex-profile",
                                   "displayName": "HD-001 Codex loopback",
                                   "harness": "codex"})["profile"]
workspace = wire("workspaces.open", {"requestId": "hd001-codex-workspace",
                                     "environment": {"kind": "local", "host": None, "user": None},
                                     "path": str(pathlib.Path(run, "workspace"))})["workspace"]
session = post("/api/v1/sessions", {"workspace_id": workspace["id"],
                                    "profile_id": profile["id"]}, "hd001-codex-session")

# R1 load verification: the seeded profile lists back with harness codex and the
# session reads back bound to both — all through the Server's own faces.
listed = [p for p in wire("profiles.list", {"includeArchived": False})["items"]
          if p["id"] == profile["id"]]
assert len(listed) == 1 and listed[0]["harness"] == "codex", "profile did not list back"
read_back = json.loads(opener.open(urllib.request.Request(
    f"{base}/api/v1/sessions/{session['session_id']}",
    headers={"Authorization": f"Bearer {token}"}), timeout=30).read())
assert read_back.get("profile_id") == profile["id"] \
    and read_back.get("workspace_id") == workspace["id"]

report = {"result": "HARNESS_LINUX_CODEX_R1_OK", "profileId": profile["id"],
          "workspaceId": workspace["id"], "sessionId": session["session_id"],
          "modelCallsMade": 0, "turnSent": False}
pathlib.Path(run, "harness-linux-codex.report.json").write_text(
    json.dumps(report, indent=1, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(report, sort_keys=True))
PYEOF

echo "HARNESS_LINUX_CODEX=R1_OK port=$PORT run-dir=$RUN keep-running=$KEEP"
if [ "$KEEP" = 1 ]; then
  trap - EXIT
  wait "$SERVER_PID"
fi
