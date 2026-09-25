#!/usr/bin/env python3
"""Controller self-test: fixture generator + fake worker.

The fake worker stands in for the real model CLI so the controller can be
exercised — stop, resume, budgets, invalid output, convergence — without
spending a single real model call. Fixtures are generated into the run
directory, never into design-loop/.
"""
import os, sys

PAD = ("the host records the ordinal and the owner so that a later reader can "
       "reconstruct which side produced which fact without consulting any "
       "service-specific name at all ")

def pad(n):
    return (PAD * n).strip()

OUT_S, OUT_E = "<<<FE-OUT-START>>>", "<<<FE-OUT-END>>>"
LED_S, LED_E = "<<<FE-LEDGER-START>>>", "<<<FE-LEDGER-END>>>"
VER_S, VER_E = "<<<FE-VERDICT-START>>>", "<<<FE-VERDICT-END>>>"
RPL_S, RPL_E = "<<<FE-REPLAY-START>>>", "<<<FE-REPLAY-END>>>"
SCN_S, SCN_E = "<<<FE-SCENARIO-START>>>", "<<<FE-SCENARIO-END>>>"
MEC_S, MEC_E = "<<<FE-MECH-START>>>", "<<<FE-MECH-END>>>"

def scenarios_rows(status="covered"):
    return "\n".join(f"S{i:02d}|{status}|core|projection and ordinal registry|round fixture §4"
                     for i in range(1, 13))

def fix_plan():
    return "\n".join([OUT_S,
      "CANDIDATES: A,B", "DIMENSION: D01-order-dedup", "QUESTION: can a projection be owned by two cores at once?",
      "", pad(14), OUT_E])

def fix_design():
    body = "\n".join([
      "## 1. Core bet", "## 2. Core concepts and operations", "## 3. Boundary rules",
      "## 4. Extension mechanism", "## 5. Scenario trajectories", "## 6. Deletion experiments",
      "## 7. Second-service onboarding cost", "## 8. Honest cost and non-goals",
      "", pad(60)])
    return "\n".join([OUT_S, body, OUT_E, OUT_S, body, OUT_E])

def fix_attack():
    return "\n".join([OUT_S,
      "DIMENSION: D01-order-dedup",
      "Sequence: submit s1; drop link; reconnect; server replays s1 and s2 out of order;",
      "host applies both; the projection shows a turn that never happened.",
      "Invariant broken: a turn appears at most once and only after acceptance.",
      "Minimal: drop one event and the sequence passes.",
      "Consequence: S09 user-visible truth is lost.", "", pad(40), OUT_E,
      LED_S,
      "FE-CE-001|R001|major|OPEN|turn appears at most once|replayed event duplicates a turn|attack §1|-",
      "FE-CE-002|R001|minor|OPEN|extension unsubscribe on unmount|subscription leaks after unmount|attack §2|-",
      LED_E])

def fix_verify():
    return "\n".join([OUT_S,
      "FE-CE-001 holds: candidate §4 has no dedup key on apply.",
      "FE-CE-002 does_not_hold: candidate §3 already disposes subscriptions on unmount.", "",
      pad(30), OUT_E,
      VER_S,
      "FE-CE-001|holds|candidate section 4 lists no apply-time dedup key|nothing further",
      "FE-CE-002|does_not_hold|candidate section 3 disposes on unmount|nothing further",
      VER_E])

def fix_integrate():
    return "\n".join([OUT_S,
      "CHANGE VS PREVIOUS: apply-time dedup key added to the projection registry.", "", pad(50), OUT_E,
      OUT_S,
      "# best candidate", "## 1. Core bet", pad(55), OUT_E,
      LED_S,
      "FE-CE-001|R001|major|CLOSED|turn appears at most once|apply-time dedup key|integration §1|-",
      LED_E,
      RPL_S,
      "FE-CE-001|pass|submit, drop, reconnect, replay s1 and s2|dedup key rejects the second apply",
      "FE-CE-002|pass|mount then unmount while a run is live|subscription disposed at unmount",
      RPL_E,
      SCN_S, scenarios_rows(), SCN_E,
      MEC_S,
      "projection registry|core|S09 shows a turn that never happened|integration §1",
      "ordinal allocator|core|S06 two services collide on order|integration §1",
      "session catalog|core|S03 cannot be observed after leaving the page|integration §2",
      MEC_E])

def fix_verify_converged():
    return "\n".join([OUT_S, "attack took up its dimension; nothing to judge", pad(30), OUT_E,
                      VER_S, "FE-CE-999|holds|no candidate text prevents this|nothing", VER_E])

# convergence-positive: everything already established, nothing new
def fix_attack_clean():
    return "\n".join([OUT_S, "DIMENSION: D06-adapter-burden", "COUNTEREXAMPLES: none",
                      "Tried: adapter must know a core internal — candidate §3 keeps it behind the absent-capability table.",
                      "", pad(40), OUT_E, LED_S, LED_E])

def fix_verify_clean():
    return "\n".join([OUT_S, "no counterexamples to judge; attack took up its dimension", pad(30), OUT_E,
                      VER_S, "FE-CE-001|holds|candidate §4 still has no dedup key|nothing", VER_E])

def fix_integrate_converged():
    return "\n".join([OUT_S, "CHANGE VS PREVIOUS: none material", pad(50), OUT_E,
      OUT_S, "# best candidate", pad(55), OUT_E,
      LED_S, LED_E, RPL_S,
      "FE-CE-001|pass|replay of duplicate apply|dedup key stops it",
      "FE-CE-002|pass|replay of unmount leak|dispose path present", RPL_E,
      SCN_S, scenarios_rows(), SCN_E,
      MEC_S,
      "projection registry|core|S09 loses truth without it|integration §1",
      "ordinal allocator|core|S06 collides without it|integration §1",
      "session catalog|core|S03 unobservable without it|integration §2", MEC_E])

# id-remap: propose a high id that must be allocated canonically, then close it
# by the *same proposed* id in a later phase of the same round.
def fix_attack_remap():
    return "\n".join([OUT_S,
      "DIMENSION: D03-identity-scope",
      "Sequence: two services both emit task id 7; host keys its cache on the raw id;",
      "S06 user reads service B's progress under service A's entry.",
      "Invariant: identity is scoped by provider.", "", pad(40), OUT_E,
      LED_S,
      "FE-CE-900|R002|major|OPEN|identity scoped by provider|raw id collision across services|attack §1|-",
      LED_E])

def fix_integrate_remap():
    return "\n".join([OUT_S, "CHANGE VS PREVIOUS: identity scoped by provider on every cache key", pad(50), OUT_E,
      OUT_S, "# best candidate", pad(55), OUT_E,
      LED_S,
      "FE-CE-900|R002|major|CLOSED|identity scoped by provider|scoped key|integration §1|-",
      LED_E,
      RPL_S, "FE-CE-900|pass|two services, same raw id|scoped key separates them", RPL_E,
      SCN_S, scenarios_rows(), SCN_E,
      MEC_S,
      "provider-scoped identity|core|S06 leaks across services|integration §1", MEC_E])

FIXTURES = {
    "planner": fix_plan, "designer": fix_design, "attacker": fix_attack,
    "verifier": fix_verify, "integrator": fix_integrate,
    "attacker_clean": fix_attack_clean, "verifier_converged": fix_verify_converged,
    "attacker_clean_dup": fix_attack_clean, "verifier_clean": fix_verify_clean,
    "attacker_converged": fix_attack_clean, "verifier_converged": fix_verify_converged,
    "integrator_converged": fix_integrate_converged,
    "attacker_remap": fix_attack_remap, "integrator_remap": fix_integrate_remap,
}

def gen(outdir):
    os.makedirs(outdir, exist_ok=True)
    for k, f in FIXTURES.items():
        with open(os.path.join(outdir, k + ".txt"), "w") as fh:
            fh.write(f())
    print("wrote fixtures to", outdir)

def detect_role(prompt):
    import re
    m = re.search(r"Role:\s*\*?\*?([a-z_]+)\*?\*?", prompt)
    return m.group(1) if m else "planner"

def policy(role):
    """FAKE_POLICY='planner=ok,designer=ok,attacker=garbage' or 'slow=12'."""
    spec = os.environ.get("FAKE_POLICY", "")
    default = os.environ.get("FAKE_DEFAULT", "ok")
    table, slow = {}, None
    for part in spec.split(","):
        if not part.strip():
            continue
        k, _, v = part.partition("=")
        k, v = k.strip(), v.strip()
        if k == "slow":
            slow = float(v)
        elif k == "*":
            default = v
        else:
            table[k] = v
    return table.get(role, default), slow

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "gen":
        return gen(sys.argv[2])
    outdir = os.environ["FAKE_FIXTURES"]
    prompt = sys.stdin.read()
    role = detect_role(prompt)
    mode, slow = policy(role)
    if mode.startswith("slow"):
        import time
        time.sleep(float(mode[4:]) if len(mode) > 4 else (slow or 20.0))
        mode = "ok"
    elif slow is not None and mode == "ok":
        import time
        time.sleep(slow)
    if mode == "fail":
        sys.stderr.write("fake worker: refused\n"); sys.exit(1)
    if mode == "empty":
        sys.exit(0)
    if mode == "garbage":
        sys.stdout.write("Nice design. Consider adding a cache layer and better naming.\n"); sys.exit(0)
    if mode == "truncated":
        sys.stdout.write(open(os.path.join(outdir, role + ".txt")).read().split("<<<FE-OUT-END>>>")[0])
        sys.exit(0)
    name = role if mode == "ok" else f"{role}_{mode}"
    path = os.path.join(outdir, name + ".txt")
    if not os.path.exists(path):
        path = os.path.join(outdir, role + ".txt")
    sys.stdout.write(open(path).read())

if __name__ == "__main__":
    main()
