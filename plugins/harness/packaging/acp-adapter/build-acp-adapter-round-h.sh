#!/usr/bin/env bash
# Rebuild the Round-H Pi→ACP bridge from the source vendored in this monorepo.
#
# Source of record: plugins/harness/adapters/acp-adapter (module path
# `github.com/beyond5959/acp-adapter` kept from upstream; commit
# 41d9d94ef6b98547df575240c4366b1e5e8ba39b, branch work/round-h).
# Toolchain pin: Go 1.24.13 linux-amd64 (tarball sha256
#   1fc94b57134d51669c72173ad5d49fd62afb0f1db9bf3f798fd98ee423f8d730).
# Reference artifact: sha256 5fd6a37b127274eef5c2f27fe731a720e32e9bd64efd6df23e61fe739bbc61ea
#   (byte-for-byte reproducible from the same source + toolchain, verified 2026-09-25).
#
# Usage: build-acp-adapter-round-h.sh [output-path]
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC=$(cd "$HERE/../../adapters/acp-adapter" && pwd)
GOROOT=${GOROOT:-/home/maoqh/ordessa-builds/go1.24.13}
OUT=${1:-$HERE/acp-adapter}

GO_BIN=$GOROOT/bin/go
[ -x "$GO_BIN" ] || { echo "missing toolchain: $GO_BIN"; echo "set GOROOT to a Go 1.24.x home"; exit 1; }

export GOROOT
export CGO_ENABLED=0
export GOPROXY=off
export GOTOOLCHAIN=local
export GOCACHE=${GOCACHE:-${TMPDIR:-/tmp}/ordessa-acp-gocache}
export GOMODCACHE=${GOMODCACHE:-${TMPDIR:-/tmp}/ordessa-acp-gomodcache}
mkdir -p "$GOCACHE" "$GOMODCACHE"

"$GO_BIN" version
cd "$SRC"
"$GO_BIN" build -trimpath -buildvcs=false -ldflags "-buildid=" -o "$OUT" ./cmd/acp

echo "--- artifact ---"
sha256sum "$OUT"
ls -l "$OUT"
