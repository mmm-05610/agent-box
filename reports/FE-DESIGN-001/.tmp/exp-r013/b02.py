# MODEL ONLY: proves the variant-rendering model, not the product or any protocol.
U, CAP, SCOPE, ABS = "OutcomeUnknown", "CapabilityAbsent", "ScopeDenied", "ExplicitAbsent"

def render(outcome, prior, ts):
    if outcome not in (U, CAP, SCOPE, ABS):         # Result -> GenericWalk rows
        return ("current@%s" % ts, outcome)
    if outcome == U:
        if prior:
            return ("last-confirmed@%s NOT current" % prior[1], prior[0])
        return ("value not confirmed; read did not return", [])
    if outcome == ABS:
        return ("this resource no longer exists", [])
    return ("not obtainable: %s" % outcome, [])

prior = (["port=8080"], "t0")
assert render(U, prior, "t1")[0].startswith("last-confirmed")
assert render(ABS, prior, "t1")[0] == "this resource no longer exists"
assert render(ABS, prior, "t1") != render(["port=8080"], prior, "t1")
print("five variants distinct; unconfirmed/absent never rendered as current")
