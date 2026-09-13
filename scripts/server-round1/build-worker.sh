#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: build-worker.sh OUTPUT_DIR" >&2
  exit 2
fi

output_dir=$1
if [[ -e "$output_dir" ]]; then
  echo "output directory must not exist: $output_dir" >&2
  exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/../.." && pwd)
crate="$repo_root/workers/agent-box-worker/Cargo.toml"
if [[ -n "${AGENT_BOX_WORKER_CARGO_HOME:-}" ]]; then
  export CARGO_HOME=$AGENT_BOX_WORKER_CARGO_HOME
fi

cargo build --locked --release --manifest-path "$crate"
mkdir -p "$output_dir"
printf '%s\n' 'agentbox-worker-bundle-r1' > "$output_dir/.agentbox-worker-bundle"
install -m 0755 "$repo_root/workers/agent-box-worker/target/release/agent-box-worker" \
  "$output_dir/agent-box-worker"
digest=$(sha256sum "$output_dir/agent-box-worker" | awk '{print $1}')
version_json=$($output_dir/agent-box-worker --version-json)
worker_version=$(printf '%s' "$version_json" | sed -n 's/.*"workerVersion":"\([^"]*\)".*/\1/p')
wire_version=$(printf '%s' "$version_json" | sed -n 's/.*"wireVersion":\([0-9]*\).*/\1/p')
if [[ -z "$worker_version" || "$wire_version" != "1" ]]; then
  echo "worker version manifest is invalid" >&2
  exit 1
fi
printf '{"schemaVersion":1,"workerVersion":"%s","wireVersion":1,"sha256":"sha256:%s"}\n' \
  "$worker_version" "$digest" > "$output_dir/manifest.json"
printf '{"result":"SERVER_WSL_R1_WORKER_BUILT","workerVersion":"%s","wireVersion":1,"sha256":"sha256:%s","binary":"%s","manifest":"%s"}\n' \
  "$worker_version" "$digest" "$output_dir/agent-box-worker" "$output_dir/manifest.json"
