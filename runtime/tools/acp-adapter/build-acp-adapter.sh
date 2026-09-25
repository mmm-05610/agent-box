#!/usr/bin/env bash
# Rebuild the pinned Pi→ACP bridge used by real-Pi desktop acceptance.
#
# Pin (approved, do not change): upstream tag v0.3.8 == commit
#   491151b16846682396aca8c31e9285e414e4f3b8
#   https://github.com/beyond5959/acp-adapter
# Toolchain pin: Go 1.24.13 (linux-amd64 tarball sha256
#   1fc94b57134d51669c72173ad5d49fd62afb0f1db9bf3f798fd98ee423f8d730,
#   verified against https://go.dev/dl/?mode=json&include=all).
#
# The artifact lives in this repository so launch commands never point at /tmp.
set -euo pipefail

SRC=${SRC:-/home/maoqh/ordessa-builds/acp-adapter}
GOROOT=${GOROOT:-/home/maoqh/ordessa-builds/go1.24.13}
PIN=491151b16846682396aca8c31e9285e414e4f3b8
OUT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
OUT=$OUT_DIR/acp-adapter

GO_BIN=$GOROOT/bin/go
[ -x "$GO_BIN" ] || { echo "missing toolchain: $GO_BIN"; exit 1; }

cd "$SRC"
[ -z "$(git status --porcelain)" ] || { echo "source tree is dirty"; exit 1; }
[ "$(git rev-parse HEAD^{commit})" = "$PIN" ] || {
  echo "source commit mismatch: $(git rev-parse HEAD) != $PIN"; exit 1;
}
[ "$(git rev-parse v0.3.8^{commit})" = "$PIN" ] || { echo "tag v0.3.8 does not peel to pin"; exit 1; }

export GOROOT
export GOFLAGS=-trimpath
export CGO_ENABLED=0
export GOPROXY=off
export GOTOOLCHAIN=local
export GOCACHE=${GOCACHE:-/home/maoqh/ordessa-builds/cache/acp-adapter-go}
export GOMODCACHE=${GOMODCACHE:-/home/maoqh/ordessa-builds/cache/acp-adapter-mod}
export GOPATH=${GOPATH:-/home/maoqh/ordessa-builds/cache/acp-adapter-gopath}
export TMPDIR=${TMPDIR:-/home/maoqh/ordessa-builds/cache/acp-adapter-tmp}
mkdir -p "$GOCACHE" "$GOMODCACHE" "$GOPATH" "$TMPDIR"

"$GO_BIN" version
"$GO_BIN" build -buildvcs=false -trimpath -ldflags "-buildid=" -o "$OUT" ./cmd/acp
"$GO_BIN" vet ./cmd/acp

echo "--- artifact ---"
sha256sum "$OUT"
ls -l "$OUT"
file "$OUT" 2>/dev/null || true
