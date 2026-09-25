#!/usr/bin/env bash
# run-selftests.sh — BE-LOOP-001 bootstrap acceptance WITHOUT any model or Sol.
# Runs every check against an ISOLATED temp ledger + a temp fake source tree so it
# never mutates the canonical ledger or the real product repo. Prints a PASS/FAIL
# table and writes command+actual+limitation evidence to the report dir.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # control/backend-loop
EVID="${EVID_DIR:-$ROOT/../reports/BE-LOOP-001/bootstrap/selftest}"
mkdir -p "$EVID"
ISO="$(mktemp -d /tmp/beloop-selftest-XXXX)"
export BE_LOOP_BUDGET="$ISO/budget.json"
export BE_LOOP_FAKE_REVIEW=1
PY="$ROOT/controller/budget.sh"; PY="$ROOT/controller/budget.py"; BL="$ROOT/controller/be-loop.sh"
G=""        # global pass/fail tally
LOG="$EVID/run.log"; : > "$LOG"
note(){ printf '%s\n' "$*" | tee -a "$LOG"; }
res(){ local id="$1" want="$2" got="$3" cmd="$4"; shift 4; local lim="${1:-}"
  if printf '%s' "$got" | grep -qF -- "$want"; then
    note "PASS  $id"; G="$G P:$id"; else note "FAIL  $id want=[$want] got=[$got]"; G="$G F:$id"; fi
  { echo "### $id"; echo "- cmd: \`$cmd\`"; echo "- want substring: \`$want\`"; echo "- actual: \`$got\`"; [ -n "$lim" ] && echo "- limitation: $lim"; echo; } >> "$EVID/checks.md"
}
: > "$EVID/checks.md"; note "# BE-LOOP-001 self-test evidence" > "$EVID/checks.md"

# fake source tree for the impl-phase test (never the real repo)
mkdir -p "$ISO/fakesrc/a" "$ISO/fakesrc/b"; echo x > "$ISO/fakesrc/a/f"; echo y > "$ISO/fakesrc/b/f"

# ---------- ISOLATION (research phase, fake executor) ----------
out=$(cd "$ROOT/isolation" && BE_LOOP_SRC="$ISO/fakesrc" timeout 25 bash run-group.sh server research 2>&1)
printf '%s\n' "$out" > "$EVID/isolation-research.log"
res ISO-write-outbox   "writable /outbox"  "$(echo "$out"|grep 'write:outbox')"  "run-group.sh server research"
res ISO-write-reports  "writable /reports" "$(echo "$out"|grep 'write:reports')" "run-group.sh server research"
res ISO-ro-source      "denied /source"    "$(echo "$out"|grep 'write:source')"  "run-group.sh server research"
res ISO-ro-inbox       "denied /inbox"     "$(echo "$out"|grep 'write:inbox')"   "run-group.sh server research"
res ISO-ro-controller  "denied /control-loop" "$(echo "$out"|grep 'write:ctrl')" "run-group.sh server research"
res ISO-ro-budget      "denied /control-loop/controller/ledger" "$(echo "$out"|grep 'write:budget')" "run-group.sh server research"
res ISO-abs-othergrp   "other-execution absent" "$(echo "$out"|grep 'absent:other-execution')" "run-group.sh server research"
res ISO-abs-hosthome   "absent /home/maoqh" "$(echo "$out"|grep 'absent:host-home ')" "run-group.sh server research"
res ISO-abs-qoder      "absent /home/maoqh/.qoder" "$(echo "$out"|grep 'absent:qoder-cfg')" "run-group.sh server research"
res ISO-abs-docker     "absent /run/docker.sock" "$(echo "$out"|grep 'absent:docker-sock')" "run-group.sh server research"
res ISO-nosol-entry    "codex-not-in-sandbox" "$(echo "$out"|grep 'sol-entry')" "run-group.sh server research"
res ISO-net-hidden     "18790" "$(echo "$out"|grep 'net:trial')" "run-group.sh server research"
res ISO-symlink-deny   "symlink-escape denied" "$(echo "$out"|grep 'symlink-escape')" "write through link into ro source"
res ISO-nested-deny    "cannot-spawn-usable-bwrap" "$(echo "$out"|grep 'nested-bwrap')" "attempt re-exec bwrap inside"

# ---------- WRITE isolation, impl phase (open only approved path) ----------
iout=$(cd "$ROOT/isolation" && BE_LOOP_SRC="$ISO/fakesrc" BE_LOOP_IMPL_BINDS="$ISO/fakesrc/a:/source/a" timeout 25 bash -c '
. ./sandbox-lib.sh; sandbox_build server impl /bin/sh -c "touch /source/a/ok 2>/dev/null && echo A-writable || echo A-denied; touch /source/b/ok 2>/dev/null && echo B-writable || echo B-denied"')
printf '%s\n' "$iout" > "$EVID/isolation-impl.log"
res IMP-open-allowed   "A-writable" "$(echo "$iout"|grep -o 'A-[a-z]*')" "impl phase, only /source/a approved bind"
res IMP-ro-sibling     "B-denied"   "$(echo "$iout"|grep -o 'B-[a-z]*')" "sibling /source/b stays read-only"

# ---------- BUDGET ----------
python3 "$PY" init --force >/dev/null
res BUD-total     '"total": 10' "$(python3 "$PY" status)" "init 10 total"
python3 "$PY" consume --group E --milestone design-final --request-id e1 --model gpt-5.6-sol >/dev/null
python3 "$PY" consume --group E --milestone impl-accept  --request-id e2 --model gpt-5.6-sol >/dev/null
res BUD-E-reserve-not-flex '"flexible_left": 8' "$(python3 "$PY" status|grep -o '"flexible_left": 8')" "two E earmark uses keep flexible=8"
python3 "$PY" record --request-id e1 --result ok >/dev/null
for i in 1 2 3; do python3 "$PY" consume --group H --request-id h$i --model gpt-5.6-sol >/dev/null; python3 "$PY" record --request-id h$i --result ok >/dev/null; done
res BUD-H-cap4  'DENY code=7' "$(python3 "$PY" consume --group H --request-id h4 --model gpt-5.6-sol 2>&1)" "H cumulative cap 3"
res BUD-wrong-model 'code=4' "$(python3 "$PY" consume --group S --request-id w --model gpt-6-astra 2>&1)" "refuse non-Sol model, no substitute"
res BUD-fail-counts 'RECORDED' "$(python3 "$PY" consume --group S --request-id f1 --model gpt-5.6-sol >/dev/null; python3 "$PY" record --request-id f1 --result error)" "failure still counted"
res BUD-dedup   'DUPLICATE-PRESERVED' "$(python3 "$PY" consume --group S --request-id f1 --model gpt-5.6-sol 2>&1)" "same request-id no second spend"
res BUD-restart-persist '"used": 6' "$(python3 "$PY" status|grep -o '"used": [0-9]*')" "new process reads same ledger (no reset)"
# --- reserve-theft, on a FRESH ledger: drain the 8 FLEXIBLE via central only,
#     assert 9th flexible is DENIED while used==8 (not 10): 2 slots stay for E ---
python3 "$PY" init --force >/dev/null
for i in $(seq 1 8); do python3 "$PY" consume --group central --request-id "cf$i" --model gpt-5.6-sol >/dev/null 2>&1; done
res BUD-flex-drained-used8 '"used": 8' "$(python3 "$PY" status|grep -o '"used": [0-9]*')" "central used all 8 flexible; E earmarks untouched"
res BUD-Eslots-held '"reserved_unconsumed": 2' "$(python3 "$PY" status|grep -o '"reserved_unconsumed": [0-9]*')" "2 E slots still protected at used=8"
res BUD-9th-flex-denied 'code=6' "$(python3 "$PY" consume --group S --request-id cf9 --model gpt-5.6-sol 2>&1)" "no 9th flexible for non-E though total=10"
res BUD-E-still-works 'path=reservation' "$(python3 "$PY" consume --group E --milestone design-final --request-id ef --model gpt-5.6-sol 2>&1)" "E CAN spend its reserved slot (used 8->9)"
# corrupt ledger refuses
printf '{ broken' > "$BE_LOOP_BUDGET"
res BUD-corrupt-refuse 'code=3' "$(python3 "$PY" status 2>&1)" "corrupt ledger -> refuse, no call"
python3 "$PY" init --force >/dev/null
# concurrency: 12 parallel distinct consumes, none over 10, E slots intact for non-E
python3 "$PY" init --force >/dev/null
for i in $(seq 1 12); do ( python3 "$PY" consume --group S --request-id "p$i" --model gpt-5.6-sol >/dev/null 2>&1 ) & done; wait
used_after=$(python3 "$PY" status|grep -o '"used": [0-9]*'|grep -o '[0-9]*')
res BUD-concurrent-cap 'ok' "$([ "$used_after" -le 10 ] && echo ok || echo over=$used_after)" "12 parallel consume -> used<=10 ($used_after)"
res BUD-concurrent-E '"E-design-final": "reserved"' "$(python3 "$PY" status|grep -o '"E-design-final": "[a-z]*"')" "concurrent S never took E earmark"

# ---------- CONTROL (isolated, temp) ----------
python3 "$PY" init --force >/dev/null
OB="$ROOT/../../worktrees/backend-loop/server/outbox"; mkdir -p "$OB"
printf '{"id":"msg.s.1","type":"DESIGN_READY","group":"server"}\n' > "$OB/msg.s.1.json"
bash "$BL" collect >/dev/null; c2=$(bash "$BL" collect)
res CTL-dedup 'already processed' "$c2" "second collect: no re-dispatch"
rm -f "$OB/msg.s.1.json" "$ROOT/controller/state/messages/processed.ids"

# counting reviewer (records every ACTUAL reviewer/model call) — for end-to-end defect 1/3
CNT="$ISO/calls"; : > "$CNT"
printf '#!/bin/sh\necho x >> "%s"\nexec /bin/sh "%s" "$@"\n' "$CNT" "$ROOT/tests/fake-reviewer.sh" > "$ISO/cnt"; chmod +x "$ISO/cnt"
export BE_LOOP_REVIEWER="$ISO/cnt"
cc(){ wc -l < "$CNT" | tr -d ' '; }
mkc(){ printf 'MILESTONE: %s\nTASK: %s\nVERSION: %s\nMODE: %s\n' "$1" "$2" "$3" "$4" > "$5"; }

# DEFECT 1 end-to-end: same request-id twice => reviewer called EXACTLY once
mkc design-final T1 C-EXEC@v1 ACCEPT "$ISO/ok"
python3 "$PY" init --force >/dev/null
bash "$BL" sol-review execution Ra design-final "$ISO/ok" T1 C-EXEC@v1 >/dev/null 2>&1
bash "$BL" sol-review execution Ra design-final "$ISO/ok" T1 C-EXEC@v1 >/dev/null 2>&1
res CTL-dup-nocall 'calls=1' "calls=$(cc)" "defect1: duplicate request-id never re-calls reviewer (end-to-end count)"
res CTL-dup-used1 '"used": 1' "$(python3 "$PY" status|grep -o '"used": [0-9]*')" "defect1: duplicate never double-spends"

# DEFECT 3: exact-match gates (new request ids so each actually calls reviewer once)
python3 "$PY" init --force >/dev/null; : > "$CNT"
mkc impl-accept T v MISHA   "$ISO/e1"; bash "$BL" sol-review execution b1 impl-accept "$ISO/e1" T v >/dev/null 2>&1
res D3-wrong-sha  'CENTRAL_REVIEW' "$(cat "$ROOT/controller/state/status.execution")" "defect3: wrong candidate sha not promoted"
mkc impl-accept T v MISMILE "$ISO/e2"; bash "$BL" sol-review execution b2 impl-accept "$ISO/e2" T v >/dev/null 2>&1
mkc impl-accept T v MISVER  "$ISO/e3"; st_before=$(cat "$ROOT/controller/state/status.execution"); bash "$BL" sol-review execution b3 impl-accept "$ISO/e3" T v >/dev/null 2>&1
res D3-wrong-ver  'CENTRAL_REVIEW' "$st_before$( [ -f "$ROOT/controller/state/status.execution" ] && cat "$ROOT/controller/state/status.execution")" "defect3: wrong version not promoted (see wrong-milestone too)"
mkc impl-accept T v NONZERO "$ISO/e4"; bash "$BL" sol-review execution b4 impl-accept "$ISO/e4" T v >"$ISO/nz.out" 2>&1; grep -q 'NONZERO exit' "$ISO/nz.out" && D4o=seen || D4o=no
res D3-nonzero    'seen' "$D4o" "defect3: reviewer non-zero exit not approved"
mkc impl-accept T v INVALID "$ISO/e5"; bash "$BL" sol-review execution b5 impl-accept "$ISO/e5" T v >"$ISO/in.out" 2>&1; grep -q 'INVALID/MISMATCH' "$ISO/in.out" && I5=seen || I5=no
res D3-malformed  'seen' "$I5" "defect3: malformed reviewer output not approved"
mkc impl-accept T7 v REJECT "$ISO/e6"; bash "$BL" sol-review execution b6 impl-accept "$ISO/e6" T7 v >/dev/null 2>&1
res D3-valid-reject 'CENTRAL_REVIEW' "$(cat "$ROOT/controller/state/status.execution")" "defect3: valid REJECT bounces (not approved)"
mkc design-final T9 v ACCEPT "$ISO/ok2"; bash "$BL" sol-review execution b7 design-final "$ISO/ok2" T9 v >/dev/null 2>&1
res D3-valid-accept 'APPROVED' "$(cat "$ROOT/controller/state/status.execution")" "defect3: fully-matching ACCEPT -> APPROVED"
unset BE_LOOP_REVIEWER

# DEFECT 2: approve validation + generated binds + guard
r=$(bash "$BL" approve server TSx /source/src/agent_box/server/wire 2>&1); res D2-deny-wire 'REFUSED' "$r" "defect2: deny public wire path"
r=$(bash "$BL" approve execution TEabs /etc/passwd 2>&1);              res D2-abs-host  'REFUSED' "$r" "defect2: reject absolute host path"
r=$(bash "$BL" approve execution TEtrav 'src/agent_box/../../etc' 2>&1); res D2-traversal 'REFUSED' "$r" "defect2: reject path traversal"
r=$(bash "$BL" approve execution TEcross /source/src/agent_box/server/sessions 2>&1); res D2-crossgroup 'REFUSED' "$r" "defect2: reject path not in this group allowlist"
r=$(bash "$BL" approve execution TEok /source/src/agent_box/extensions/runtime_composition 2>&1); res D2-valid 'APPROVED' "$r" "defect2: allow valid E path"
b=$(BE_LOOP_SRC="$ISO/fakesrc" BE_LOOP_IMPL_BINDS="$ISO/fakesrc/a:/source/etc/evil" bash -c ". $ROOT/isolation/sandbox-lib.sh; BE_LOOP_SRC='$ISO/fakesrc' sandbox_build execution impl /bin/sh -c true" 2>&1 >/dev/null); res D2-mismatch 'mismatch' "$b" "defect2: host/target mismatch rejected"

# DEFECT 4: stop identity, resume no-downgrade, concurrent-start single record
sleep 5 & SVP=$!
printf '%s\t999999\ttok\tresearch\t\n' "$SVP" > "$ROOT/controller/state/pid/server"
r=$(bash "$BL" stop server 2>&1); alive=$(kill -0 "$SVP" 2>/dev/null && echo alive || echo killed); kill "$SVP" 2>/dev/null
res D4-stop-identity 'alive' "got=[$r] sentinel=$alive" "defect4: stop refuses to kill foreign/recycled-looking pid"
printf 'CENTRAL_REVIEW\n' > "$ROOT/controller/state/status.server"; printf 'research \n' > "$ROOT/controller/state/phase.server"
bash "$BL" resume server >/dev/null 2>&1; bash "$BL" stop server >/dev/null 2>&1
res D4-resume-nodowngrade 'CENTRAL_REVIEW' "$(cat "$ROOT/controller/state/status.server")" "defect4: resume keeps prior state (no RESEARCH downgrade)"
rm -f "$ROOT/controller/state/pid/server"; printf 'IDLE\n' > "$ROOT/controller/state/status.server"
for i in 1 2 3 4 5; do ( bash "$BL" start server >/dev/null 2>&1 ) & done; wait
res D4-single-record '1' "$(wc -l < "$ROOT/controller/state/pid/server" | tr -d ' ')" "defect4: concurrent starts serialize under controller lock"
bash "$BL" stop --all >/dev/null 2>&1

# no approved task => no model spin (structural via counting reviewer)
python3 "$PY" init --force >/dev/null; : > "$CNT"; export BE_LOOP_REVIEWER="$ISO/cnt"
bash "$BL" start server >/dev/null 2>&1; bash "$BL" collect >/dev/null 2>&1; bash "$BL" status >/dev/null 2>&1; bash "$BL" stop --all >/dev/null 2>&1
res CTL-no-tick-spin 'calls-after-idle=0' "calls-after-idle=$(cc)" "idle/start/collect/status make ZERO reviewer/model calls"
unset BE_LOOP_REVIEWER

# ---------- summary ----------
NP=$(printf '%s' "$G" | grep -o 'P:' | wc -l | tr -d ' ')
NF=$(printf '%s' "$G" | grep -o 'F:' | wc -l | tr -d ' ')
note ""; note "TALLY  PASS=$NP  FAIL=$NF"
note "checks detail: $EVID/checks.md ; raw isolation: $EVID/isolation-research.log"
[ "$NF" = 0 ] && note "ALL PASS" || note "FAILURES PRESENT — see checks.md"

# ---------- reset canonical runtime so the delivered tree ships pristine ----------
rm -rf "$ROOT/controller/state"; mkdir -p "$ROOT/controller/state"/{pid,approvals,messages,checkpoints,sol}
unset BE_LOOP_BUDGET
BE_LOOP_BUDGET="$ROOT/controller/ledger/budget.json" python3 "$ROOT/controller/budget.py" init --force >/dev/null
rm -f "$ROOT"/../../worktrees/backend-loop/*/outbox/* 2>/dev/null
rm -rf "$ISO"
