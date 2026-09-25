#!/usr/bin/env bash
# BE-LOOP-001 shared bwrap assembly for per-group isolation.
# Constraint 1: each group runs its OWN process inside its OWN bwrap — a separate
#   OS process, NOT a Qoder native subagent (independent context != file perms).
# Constraint 3: READ isolation AND WRITE isolation are enforced and tested; network
#   must not leak host services / other groups / credentials / host exec channels.
#   Any auth or network permission gap is REPORTED, never bypassed.
# Model: a MINIMAL tmpfs root. Only the OS runtime (/usr,/etc) and the explicitly
#   provided working set exist. Host home, ~/.qoder, ~/.codex, .agentbox-* data
#   roots, /run service+docker sockets and /mnt/c legs simply DO NOT EXIST inside.
# This library is bound read-only into every sandbox; only central constructs it.

BE_LOOP_ROOT="${BE_LOOP_ROOT:-/home/maoqh/projects/ordessa}"
BE_LOOP_SRC="${BE_LOOP_SRC:-$BE_LOOP_ROOT/worktrees/integration-linux/backend}"  # dev-0 read-only source
BE_LOOP_GROUPS="${BE_LOOP_GROUPS:-$BE_LOOP_ROOT/worktrees/backend-loop}"
BE_LOOP_CTRL="${BE_LOOP_CTRL:-$BE_LOOP_ROOT/control/backend-loop}"

# sandbox_build <group> <phase:research|impl> <inner-argv...>
sandbox_build() {
  local group="$1" phase="$2"; shift 2
  local gw="$BE_LOOP_GROUPS/$group"
  local args=(
    bwrap
    --unshare-all                       # net+pid+ipc+uts+cgroup+user: host loopback svc & pids gone
    --die-with-parent --new-session
    --clearenv
    --setenv HOME /home/agent --setenv TMPDIR /tmp --setenv LANG C.UTF-8
    --setenv PATH /usr/bin:/bin
    --setenv BE_LOOP_GROUP "$group"
    --tmpfs /                           # writable empty root so mountpoints can be created
    --proc /proc --dev /dev
    --ro-bind /usr /usr --ro-bind /etc /etc
    --symlink usr/bin /bin --symlink usr/sbin /sbin --symlink usr/lib /lib --symlink usr/lib64 /lib64
    --dev-bind /dev/null /etc/shadow --dev-bind /dev/null /etc/gshadow --dev-bind /dev/null /etc/sudoers
    --tmpfs /tmp
    # ---- explicit working set (allowlist) ----
    --ro-bind "$BE_LOOP_SRC"  /source       # full product source, READ-ONLY
    --ro-bind "$BE_LOOP_CTRL" /control-loop # controller/cards/manifest/APPROVED: READ-ONLY to executors
    --ro-bind "$gw/inbox"     /inbox        # central->group, read-only
    --bind     "$gw/outbox"   /outbox       # group's own writable outbox
    --bind     "$gw/reports"  /reports      # group's own writable reports
    --bind     "$gw/tests"    /tests        # group's own writable tests
    --bind     "$gw/work"     /work         # scratch
    --bind     "$gw/home"     /home/agent   # private HOME (fresh; no host creds)
  )

  # ---- implementation phase: open ONLY approved, allowlist-validated paths ----
  # BE_LOOP_IMPL_BINDS is produced by isolation/impl-binds.sh gen_binds (from the
  # APPROVED record), NOT trusted raw. Re-validate each pair here (defect 2).
  if [ "$phase" = "impl" ]; then
    . "$BE_LOOP_CTRL/isolation/impl-binds.sh"
    while IFS= read -r pair; do
      [ -z "$pair" ] && continue
      local hostp="${pair%%:*}"; local sbx="${pair#*:}"
      # host path must be inside the read-only source root; sandbox target must be /source/<rel>
      case "$hostp" in "$BE_LOOP_SRC"/*) :;; *) echo "[impl] REJECT host-path-out-of-source $hostp" >&2; continue;; esac
      case "$sbx"   in /source/*) :;; *) echo "[impl] REJECT bad-target $sbx" >&2; continue;; esac
      # correspondence: the sandbox target must mirror the host path's relative location,
      # so a raw pair cannot redirect a source file onto an unrelated /source subpath.
      local rel="${hostp#$BE_LOOP_SRC/}"
      [ "/source/$rel" = "$sbx" ] || { echo "[impl] REJECT host/target mismatch $hostp -> $sbx" >&2; continue; }
      [ -e "$hostp" ] || { echo "[impl] skip missing $hostp" >&2; continue; }
      args+=( --bind "$hostp" "$sbx" )
    done < <(printf '%s\n' "${BE_LOOP_IMPL_BINDS:-}")
  fi

  # REAL model access needs a brokered egress + minimal auth channel (absent here);
  # run-group.sh refuses REAL, so we keep --unshare-net (strongest) for the FAKE run.
  args+=( -- )

  if [ "${BE_LOOP_DRYRUN:-0}" = "1" ]; then
    printf '%q ' "${args[@]}"; printf '%q ' "$@"; echo; return 0
  fi
  exec "${args[@]}" "$@"
}
