#!/usr/bin/env sh
# fake-executor.sh — runs INSIDE a group's bwrap sandbox as a stand-in for
# qodercli. It performs the exact actions a real executor might and prints a
# machine-readable result per probe. It makes NO model call and touches NO Sol.
# The self-test harness compares each line to the expected allow/deny outcome.
#
# output lines:  PROBE <name> <writable|denied|absent|present|reachable|unreachable|found|missing> <detail>
set -u
group="${1:-unknown}"; phase="${2:-research}"
echo "EXEC group=$group phase=$phase pid=$$ uid=$(id -u) home=$HOME"

probe_write() { # name path
  n="$1"; p="$2"
  if ( : > "$p/f.__probe__" ) 2>/dev/null; then
    rm -f "$p/f.__probe__" 2>/dev/null
    echo "PROBE write:$n writable $p"
  else
    echo "PROBE write:$n denied $p"
  fi
}
probe_read_ok() { # name path
  n="$1"; p="$2"
  if ls "$p" >/dev/null 2>&1; then echo "PROBE read:$n present $p"; else echo "PROBE read:$n absent $p"; fi
}
probe_absent() { # name path
  n="$1"; p="$2"
  if [ -e "$p" ] || [ -L "$p" ]; then echo "PROBE absent:$n present(LEAK) $p"; else echo "PROBE absent:$n absent $p"; fi
}

echo "== WRITE probes =="
probe_write outbox   /outbox                 # must be writable
probe_write reports  /reports                # must be writable
probe_write tests    /tests                  # must be writable
probe_write work     /work                   # must be writable
probe_write source   /source                 # product source: read-only in research (deny)
probe_write inbox    /inbox                  # central-provided: read-only (deny)
probe_write ctrl     /control-loop           # controller/cards/manifest: read-only (deny)
probe_write budget   /control-loop/controller/ledger   # budget file: read-only (deny)
probe_write etc      /etc
probe_write root     /root
probe_write run      /run

echo "== READ (source view must be readable) =="
probe_read_ok source-top /source/src
probe_read_ok own-outbox /outbox

echo "== ISOLATION: things that must be absent =="
probe_absent host-home   /home/maoqh
probe_absent host-home2  "$HOME/../maoqh"
probe_absent qoder-cfg   /home/maoqh/.qoder
probe_absent codex-cfg   /home/agent/.codex
probe_absent docker-sock /run/docker.sock
probe_absent other-server   /worktrees/backend-loop/server
probe_absent other-execution /worktrees/backend-loop/execution
probe_absent other-harness   /worktrees/backend-loop/harness
probe_absent other-platform  /worktrees/backend-loop/platform
probe_absent integration-tree /home/maoqh/projects/ordessa/worktrees/integration-linux
probe_absent qa-scratch /tmp/qa-line
probe_absent reviewer-sandbox /tmp/audit-fe-2
# own home must exist and be private
probe_read_ok private-home /home/agent

echo "== Sol/codex must be unreachable from the executor =="
if command -v codex >/dev/null 2>&1; then echo "PROBE sol-entry found(LEAK) codex-on-path"; else echo "PROBE sol-entry missing codex-not-in-sandbox"; fi
probe_absent codex-bin /usr/local/bin/codex
probe_absent codex-bin2 /usr/bin/codex

echo "== network: host loopback services must be unreachable =="
if ( exec 3<>/dev/tcp/127.0.0.1/18790 ) 2>/dev/null; then echo "PROBE net:trial reachable(LEAK) 18790"; else echo "PROBE net:trial unreachable 18790"; fi
if ( exec 4<>/dev/tcp/127.0.0.1/9222 )  2>/dev/null; then echo "PROBE net:cdp reachable(LEAK) 9222";  else echo "PROBE net:cdp unreachable 9222";  fi

echo "== symlink escape attempt: link into read-only source, write through it =="
if ln -sfn /source /outbox/esc 2>/dev/null; then
  if ( : > /outbox/esc/__symprobe__ ) 2>/dev/null; then rm -f /outbox/esc/__symprobe__; echo "PROBE symlink-escape writable(LEAK) via/outbox/esc"; else echo "PROBE symlink-escape denied /outbox/esc->/source"; fi
  rm -f /outbox/esc
fi
echo "== subprocess escape attempt: re-exec bwrap from inside? =="
if command -v bwrap >/dev/null 2>&1; then
  if bwrap --ro-bind / / -- /bin/sh -c 'echo nested-bwrap-ran' 2>/dev/null | grep -q nested-bwrap-ran; then
    echo "PROBE nested-bwrap present(LEAK) inner-could-restart-bwrap"
  else
    echo "PROBE nested-bwrap denied cannot-spawn-usable-bwrap"
  fi
else
  echo "PROBE nested-bwrap absent bwrap-not-in-sandbox"
fi

# group writes its outbox so the controller can see it ran
echo "ran phase=$phase at $(date -Iseconds 2>/dev/null || echo ts)" > /outbox/executor-touch.$group 2>/dev/null || true
echo "EXEC done"
