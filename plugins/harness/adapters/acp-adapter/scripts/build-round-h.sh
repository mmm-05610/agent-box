#!/usr/bin/env bash
# Reproducible build of the Round H bridge artifact.
#
# Produces a byte-identical copy of acp-adapter-round-h from this tree and
# refuses to exit 0 on any digest mismatch. See docs/BUILD-RECORD-ROUND-H.md
# for the flag rationale and the verification history.
set -euo pipefail

GO=${GO:-/home/maoqh/ordessa-builds/go1.24.13/bin/go}
OUT=${1:-acp-adapter-round-h}
SHA_EXPECTED=5fd6a37b127274eef5c2f27fe731a720e32e9bd64efd6df23e61fe739bbc61ea

cd "$(dirname "$0")/.."
CGO_ENABLED=0 "$GO" build -trimpath -buildvcs=false -ldflags "-buildid=" -o "$OUT" ./cmd/acp

GOT=$(sha256sum "$OUT" | cut -d' ' -f1)
echo "built  : $OUT"
echo "sha256 : $GOT"
if [ "$GOT" != "$SHA_EXPECTED" ]; then
  echo "REFUSE: digest mismatch vs pinned Round H artifact $SHA_EXPECTED" >&2
  exit 1
fi
echo "MATCH: pinned Round H artifact reproduced byte-for-byte"
