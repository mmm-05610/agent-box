# BE-LOOP-001 self-test evidence
### ISO-write-outbox
- cmd: `run-group.sh server research`
- want substring: `writable /outbox`
- actual: `PROBE write:outbox writable /outbox`

### ISO-write-reports
- cmd: `run-group.sh server research`
- want substring: `writable /reports`
- actual: `PROBE write:reports writable /reports`

### ISO-ro-source
- cmd: `run-group.sh server research`
- want substring: `denied /source`
- actual: `PROBE write:source denied /source`

### ISO-ro-inbox
- cmd: `run-group.sh server research`
- want substring: `denied /inbox`
- actual: `PROBE write:inbox denied /inbox`

### ISO-ro-controller
- cmd: `run-group.sh server research`
- want substring: `denied /control-loop`
- actual: `PROBE write:ctrl denied /control-loop`

### ISO-ro-budget
- cmd: `run-group.sh server research`
- want substring: `denied /control-loop/controller/ledger`
- actual: `PROBE write:budget denied /control-loop/controller/ledger`

### ISO-abs-othergrp
- cmd: `run-group.sh server research`
- want substring: `other-execution absent`
- actual: `PROBE absent:other-execution absent /worktrees/backend-loop/execution`

### ISO-abs-hosthome
- cmd: `run-group.sh server research`
- want substring: `absent /home/maoqh`
- actual: `PROBE absent:host-home absent /home/maoqh`

### ISO-abs-qoder
- cmd: `run-group.sh server research`
- want substring: `absent /home/maoqh/.qoder`
- actual: `PROBE absent:qoder-cfg absent /home/maoqh/.qoder`

### ISO-abs-docker
- cmd: `run-group.sh server research`
- want substring: `absent /run/docker.sock`
- actual: `PROBE absent:docker-sock absent /run/docker.sock`

### ISO-nosol-entry
- cmd: `run-group.sh server research`
- want substring: `codex-not-in-sandbox`
- actual: `PROBE sol-entry missing codex-not-in-sandbox`

### ISO-net-hidden
- cmd: `run-group.sh server research`
- want substring: `18790`
- actual: `PROBE net:trial unreachable 18790`

### ISO-symlink-deny
- cmd: `write through link into ro source`
- want substring: `symlink-escape denied`
- actual: `PROBE symlink-escape denied /outbox/esc->/source`

### ISO-nested-deny
- cmd: `attempt re-exec bwrap inside`
- want substring: `cannot-spawn-usable-bwrap`
- actual: `PROBE nested-bwrap denied cannot-spawn-usable-bwrap`

### IMP-open-allowed
- cmd: `impl phase, only /source/a approved bind`
- want substring: `A-writable`
- actual: `A-writable`

### IMP-ro-sibling
- cmd: `sibling /source/b stays read-only`
- want substring: `B-denied`
- actual: `B-denied`

### BUD-total
- cmd: `init 10 total`
- want substring: `"total": 10`
- actual: `{
  "distinct_requests": 0,
  "flexible_left": 8,
  "group_used": {
    "E": 0,
    "H": 0,
    "P": 0,
    "S": 0,
    "central": 0
  },
  "model": "gpt-5.6-sol",
  "reservations": {
    "E-design-final": "reserved",
    "E-impl-accept": "reserved"
  },
  "reserved_unconsumed": 2,
  "total": 10,
  "used": 0
}`

### BUD-E-reserve-not-flex
- cmd: `two E earmark uses keep flexible=8`
- want substring: `"flexible_left": 8`
- actual: `"flexible_left": 8`

### BUD-H-cap4
- cmd: `H cumulative cap 3`
- want substring: `DENY code=7`
- actual: `DENY code=7 group H at cap 3 (H cumulative limit)`

### BUD-wrong-model
- cmd: `refuse non-Sol model, no substitute`
- want substring: `code=4`
- actual: `DENY code=4 caller model 'gpt-6-astra' != configured Sol 'gpt-5.6-sol'; refuse, do not substitute`

### BUD-fail-counts
- cmd: `failure still counted`
- want substring: `RECORDED`
- actual: `RECORDED request=f1 result=error counted=True used=6/10`

### BUD-dedup
- cmd: `same request-id no second spend`
- want substring: `DUPLICATE-PRESERVED`
- actual: `DUPLICATE-PRESERVED request=f1 counted=True status=error — no second call, no second spend`

### BUD-restart-persist
- cmd: `new process reads same ledger (no reset)`
- want substring: `"used": 6`
- actual: `"used": 6`

### BUD-flex-drained-used8
- cmd: `central used all 8 flexible; E earmarks untouched`
- want substring: `"used": 8`
- actual: `"used": 8`

### BUD-Eslots-held
- cmd: `2 E slots still protected at used=8`
- want substring: `"reserved_unconsumed": 2`
- actual: `"reserved_unconsumed": 2`

### BUD-9th-flex-denied
- cmd: `no 9th flexible for non-E though total=10`
- want substring: `code=6`
- actual: `DENY code=6 flexible pool exhausted (used=8/10, 2 still reserved for E)`

### BUD-E-still-works
- cmd: `E CAN spend its reserved slot (used 8->9)`
- want substring: `path=reservation`
- actual: `STATUS=GRANTED RESERVED request=ef path=reservation group=E used=9/10 h_used=0 — CALL reviewer now`

### BUD-corrupt-refuse
- cmd: `corrupt ledger -> refuse, no call`
- want substring: `code=3`
- actual: `DENY code=3 ledger unreadable/corrupt: Expecting property name enclosed in double quotes: line 1 column 3 (char 2)`

### BUD-concurrent-cap
- cmd: `12 parallel consume -> used<=10 (8)`
- want substring: `ok`
- actual: `ok`

### BUD-concurrent-E
- cmd: `concurrent S never took E earmark`
- want substring: `"E-design-final": "reserved"`
- actual: `"E-design-final": "reserved"`

### CTL-dedup
- cmd: `second collect: no re-dispatch`
- want substring: `already processed`
- actual: `[collect] server msg.s.1 already processed (ACK only, no re-dispatch)`

### CTL-dup-nocall
- cmd: `defect1: duplicate request-id never re-calls reviewer (end-to-end count)`
- want substring: `calls=1`
- actual: `calls=1`

### CTL-dup-used1
- cmd: `defect1: duplicate never double-spends`
- want substring: `"used": 1`
- actual: `"used": 1`

### D3-wrong-sha
- cmd: `defect3: wrong candidate sha not promoted`
- want substring: `CENTRAL_REVIEW`
- actual: `CENTRAL_REVIEW`

### D3-wrong-ver
- cmd: `defect3: wrong version not promoted (see wrong-milestone too)`
- want substring: `CENTRAL_REVIEW`
- actual: `CENTRAL_REVIEWCENTRAL_REVIEW`

### D3-nonzero
- cmd: `defect3: reviewer non-zero exit not approved`
- want substring: `seen`
- actual: `seen`

### D3-malformed
- cmd: `defect3: malformed reviewer output not approved`
- want substring: `seen`
- actual: `seen`

### D3-valid-reject
- cmd: `defect3: valid REJECT bounces (not approved)`
- want substring: `CENTRAL_REVIEW`
- actual: `CENTRAL_REVIEW`

### D3-valid-accept
- cmd: `defect3: fully-matching ACCEPT -> APPROVED`
- want substring: `APPROVED`
- actual: `APPROVED`

### D2-deny-wire
- cmd: `defect2: deny public wire path`
- want substring: `REFUSED`
- actual: `REJECT not-in-allowlist src/agent_box/server/wire (group server)
[approve] REFUSED: one or more paths outside allowlist for server`

### D2-abs-host
- cmd: `defect2: reject absolute host path`
- want substring: `REFUSED`
- actual: `REJECT absolute-path /etc/passwd
[approve] REFUSED: one or more paths outside allowlist for execution`

### D2-traversal
- cmd: `defect2: reject path traversal`
- want substring: `REFUSED`
- actual: `REJECT traversal src/agent_box/../../etc
[approve] REFUSED: one or more paths outside allowlist for execution`

### D2-crossgroup
- cmd: `defect2: reject path not in this group allowlist`
- want substring: `REFUSED`
- actual: `REJECT not-in-allowlist src/agent_box/server/sessions (group execution)
[approve] REFUSED: one or more paths outside allowlist for execution`

### D2-valid
- cmd: `defect2: allow valid E path`
- want substring: `APPROVED`
- actual: `[state] execution -> APPROVED
[approve] execution task=TEok -> APPROVED; impl paths recorded (validated). executor cannot edit this (read-only bind)`

### D2-mismatch
- cmd: `defect2: host/target mismatch rejected`
- want substring: `mismatch`
- actual: `[impl] REJECT host/target mismatch /tmp/beloop-selftest-eeUA/fakesrc/a -> /source/etc/evil`

### D4-stop-identity
- cmd: `defect4: stop refuses to kill foreign/recycled-looking pid`
- want substring: `alive`
- actual: `got=[[stop] server pid=772988 STALE/FOREIGN (identity mismatch, likely recycled) — NOT killing] sentinel=alive`

### D4-resume-nodowngrade
- cmd: `defect4: resume keeps prior state (no RESEARCH downgrade)`
- want substring: `CENTRAL_REVIEW`
- actual: `CENTRAL_REVIEW`

### D4-single-record
- cmd: `defect4: concurrent starts serialize under controller lock`
- want substring: `1`
- actual: `1`

### CTL-no-tick-spin
- cmd: `idle/start/collect/status make ZERO reviewer/model calls`
- want substring: `calls-after-idle=0`
- actual: `calls-after-idle=0`

