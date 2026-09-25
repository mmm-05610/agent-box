#!/usr/bin/env python3
"""BE-LOOP-001 independent Sol budget ledger + gated entry (backend loop only).

Design (D-0028 / BE-LOOP-001 §Review 预算, I constraint 6):
  * total 10 calls, fully separate from the frontend's 10.
  * 2 slots are RESERVED for E's two distinct milestones (design-final, impl-accept).
    They are earmarked, not flexible: no other group may consume them.
  * the other 8 slots are a FLEXIBLE pool allocated by central risk/value.
  * H cumulative cap = 3 (within the flexible pool).
  * Dedup by request-id: a repeated request-id returns the prior outcome and
    does NOT double-spend.
  * Pre-call atomic reservation (flock + os.replace); failure still counts;
    recovery / cross-day does not reset; no implicit retry.
  * Missing or corrupt ledger => REFUSE (exit 3). Never auto-recreate.
  * Model must be exactly the user-specified Sol id; mismatch => refuse (exit 4),
    never silently substitute.

Call-count ceiling only — NOT a token ceiling.
"""
import argparse, fcntl, json, os, sys, time
from datetime import date

# ---- ledger path (override with env for tests) ----
LEDGER = os.environ.get("BE_LOOP_BUDGET",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger", "budget.json"))
LOCKFILE = LEDGER + ".lock"

SOL_MODEL = os.environ.get("BE_LOOP_SOL_MODEL", "gpt-5.6-sol")
TODAY = date.today().isoformat()

def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")

def blank():
    return {
        "version": 1,
        "budget_id": "BE-LOOP-001-backend",
        "model": SOL_MODEL,
        "date_opened": TODAY,
        "total": 10,
        "used": 0,
        "group_cap": {"H": 3},
        "group_used": {"S": 0, "E": 0, "H": 0, "P": 0, "central": 0},
        "reservations": {
            "E-design-final": {"holder": "E", "milestone": "design-final", "state": "reserved"},
            "E-impl-accept":  {"holder": "E", "milestone": "impl-accept",  "state": "reserved"},
        },
        "requests": {},   # request_id -> {status, counted, group, result, used_after, ts}
        "history": [],
    }

class Refuse(Exception):
    def __init__(self, code, msg):
        super().__init__(msg); self.code = code; self.msg = msg

def _validate(d):
    req = ["version","total","used","group_used","reservations","requests"]
    for k in req:
        if k not in d: raise Refuse(3, f"ledger missing field '{k}'")
    if not isinstance(d["total"], int) or not isinstance(d["used"], int):
        raise Refuse(3, "ledger total/used must be int")
    if d["used"] < 0 or d["used"] > d["total"]:
        raise Refuse(3, f"ledger invariant broken used={d['used']} total={d['total']}")
    if d["model"] != SOL_MODEL:
        raise Refuse(4, f"ledger model '{d['model']}' != configured Sol '{SOL_MODEL}'")
    counted = sum(1 for r in d["requests"].values() if r.get("counted"))
    if counted != d["used"]:
        raise Refuse(3, f"ledger drift: counted requests {counted} != used {d['used']}")
    return d

def _load():
    if not os.path.exists(LEDGER):
        raise Refuse(3, f"ledger absent at {LEDGER}; central must initialise — refusing to auto-create")
    try:
        with open(LEDGER) as f: d = json.load(f)
    except Exception as e:
        raise Refuse(3, f"ledger unreadable/corrupt: {e}")
    return _validate(d)

def _atomic_write(d):
    tmp = LEDGER + ".tmp"
    with open(tmp, "w") as f:
        json.dump(d, f, indent=2, sort_keys=True); f.write("\n"); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, LEDGER)

def _available(d):
    reserved_unconsumed = sum(1 for r in d["reservations"].values() if r["state"] == "reserved")
    flexible_left = d["total"] - d["used"] - reserved_unconsumed
    return {"used": d["used"], "total": d["total"],
            "reserved_unconsumed": reserved_unconsumed,
            "flexible_left": max(0, flexible_left)}

def _decide(d, group, milestone):
    """Pure decision on a validated ledger dict. Returns (slot_kind, reservation_key|None)."""
    if group == "E" and milestone in ("design-final", "impl-accept"):
        key = f"E-{milestone}"
        r = d["reservations"].get(key)
        if r is None: raise Refuse(5, f"unknown E reservation {key}")
        if r["state"] == "used":
            # E asking again for the same milestone => not a second earmark; treat as flexible
            pass
        elif d["used"] < d["total"]:
            return ("reservation", key)
    # flexible pool
    av = _available(d)
    if av["flexible_left"] <= 0:
        raise Refuse(6, f"flexible pool exhausted (used={av['used']}/{av['total']}, "
                        f"{av['reserved_unconsumed']} still reserved for E)")
    if group in d["group_cap"] and d["group_used"].get(group, 0) >= d["group_cap"][group]:
        raise Refuse(7, f"group {group} at cap {d['group_cap'][group]} (H cumulative limit)")
    return ("flexible", None)

def cmd_status(a):
    d = _load()
    av = _available(d)
    out = {"model": d["model"], **av, "group_used": d["group_used"],
           "reservations": {k: v["state"] for k, v in d["reservations"].items()},
           "distinct_requests": len(d["requests"])}
    print(json.dumps(out, indent=2, sort_keys=True))
    return 0

def cmd_check(a):
    d = _load()
    try:
        if a.request_id in d["requests"]:
            r = d["requests"][a.request_id]
            print(f"DUPLICATE group={r['group']} counted={r['counted']} status={r['status']} used_after={r['used_after']}")
            return 0
        kind, key = _decide(d, a.group, a.milestone)
        print(f"GRANT path={kind}{' reservation=' + key if key else ''} available={_available(d)}")
        return 0
    except Refuse as e:
        print(f"DENY code={e.code} {e.msg}"); return e.code

def cmd_consume(a):
    """Central entry only. Atomic: reservation + recording in one lock hold."""
    if a.model != SOL_MODEL:
        print(f"DENY code=4 caller model '{a.model}' != configured Sol '{SOL_MODEL}'; refuse, do not substitute")
        return 4
    with open(LOCKFILE, "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try:
            d = _load()
            if a.request_id in d["requests"]:
                r = d["requests"][a.request_id]
                # exit 10 = ALREADY-EXISTING request: caller MUST NOT call the reviewer again.
                print(f"DUPLICATE-PRESERVED request={a.request_id} counted={r['counted']} status={r['status']} — no second call, no second spend")
                return 10
            kind, key = _decide(d, a.group, a.milestone)   # may Refuse
            # pre-call atomic reservation (counts before the real codex call)
            d["used"] += 1
            d["group_used"][a.group] = d["group_used"].get(a.group, 0) + 1
            if kind == "reservation":
                d["reservations"][key]["state"] = "used"
                d["reservations"][key]["request_id"] = a.request_id
                d["reservations"][key]["used_ts"] = _now()
            entry = {"status": "pending", "counted": True, "group": a.group,
                     "milestone": a.milestone, "path": kind,
                     "used_after": d["used"], "ts": _now()}
            d["requests"][a.request_id] = entry
            _atomic_write(d)
        except Refuse as e:
            print(f"DENY code={e.code} {e.msg}"); return e.code
        finally:
            fcntl.flock(lk, fcntl.LOCK_UN)
    print(f"STATUS=GRANTED RESERVED request={a.request_id} path={kind} group={a.group} "
          f"used={d['used']}/{d['total']} h_used={d['group_used'].get('H',0)} — CALL reviewer now")
    return 0

def cmd_record(a):
    """Record the outcome of an already-reserved call. result != ok still keeps counted=True."""
    with open(LOCKFILE, "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try:
            d = _load()
            if a.request_id not in d["requests"]:
                raise Refuse(8, f"unknown request {a.request_id}; nothing reserved to record")
            e = d["requests"][a.request_id]
            e["status"] = a.result
            d["history"].append({"request_id": a.request_id, "group": e["group"],
                                 "path": e["path"], "result": a.result,
                                 "counted": True, "used_after": e["used_after"], "ts": _now()})
            _atomic_write(d)
        except Refuse as ex:
            print(f"ERROR code={ex.code} {ex.msg}"); return ex.code
        finally:
            fcntl.flock(lk, fcntl.LOCK_UN)
    print(f"RECORDED request={a.request_id} result={a.result} counted=True used={d['used']}/{d['total']}")
    return 0

def cmd_init(a):
    if os.path.exists(LEDGER) and not a.force:
        print(f"ledger already present at {LEDGER}; use --force only in an isolated test dir"); return 9
    if not a.force:
        print("refusing to init the canonical ledger; central initialises it once. pass --force in a test path"); return 9
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    _atomic_write(blank())
    print(f"initialised {LEDGER}")
    return 0

def main():
    p = argparse.ArgumentParser(description="BE-LOOP-001 Sol budget ledger")
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("status"); sp.add_argument("--json", action="store_true"); sp.set_defaults(fn=cmd_status)
    for name in ("check", "consume"):
        s = sub.add_parser(name)
        s.add_argument("--group", required=True, choices=["S","E","H","P","central"])
        s.add_argument("--milestone", default="")
        s.add_argument("--request-id", required=True, dest="request_id")
        if name == "consume":
            s.add_argument("--model", required=True)
        s.set_defaults(fn=cmd_check if name == "check" else cmd_consume)
    r = sub.add_parser("record"); r.add_argument("--request-id", required=True, dest="request_id")
    r.add_argument("--result", required=True, choices=["ok","rejected","error","timeout"]); r.set_defaults(fn=cmd_record)
    i = sub.add_parser("init"); i.add_argument("--force", action="store_true"); i.set_defaults(fn=cmd_init)
    a = p.parse_args()
    try:
        sys.exit(a.fn(a))
    except Refuse as e:
        print(f"DENY code={e.code} {e.msg}"); sys.exit(e.code)

if __name__ == "__main__":
    main()
