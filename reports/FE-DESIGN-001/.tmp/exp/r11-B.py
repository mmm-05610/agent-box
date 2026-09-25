# MODEL ONLY: proves the four-variant rendering model, not the product or any protocol.
U, CAP, SCOPE = "OutcomeUnknown", "CapabilityAbsent", "ScopeDenied"

def render(outcome, prior, ts):
    if outcome not in (U, CAP, SCOPE):              # Result -> GenericWalk rows
        return ("current@%s" % ts, outcome)
    if outcome == U:
        if prior:
            return ("last-confirmed@%s NOT current" % prior[1], prior[0])
        return ("value not confirmed; read did not return", [])
    return ("not obtainable: %s" % outcome, [])

prior = (["port=8080"], "t0")
print("Result                    ", render(["port=8081"], prior, "t1"))
print("OutcomeUnknown (prior rows)", render(U, prior, "t1"))
print("OutcomeUnknown (no prior)  ", render(U, None, "t1"))
print("CapabilityAbsent           ", render(CAP, prior, "t1"))
assert render(U, prior, "t1")[0].startswith("last-confirmed"), "stale-as-current reopened"
assert render(U, prior, "t1") != render(["port=8080"], prior, "t1")
failed_row = ("current@t1", ["state=failed reason=exit-1"])
assert failed_row[1] != render(U, None, "t1")[1]   # failed (data) vs unknown (variant)
def action_state(outcome):                          # the action channel of FE-CE-023
    return "unconfirmed" if outcome in (U,) else "available"
assert action_state("Result{ok}") == "available" and action_state(U) == "unconfirmed"
print("four variants distinct; an unconfirmed outcome is never rendered as a current value or an available action")
