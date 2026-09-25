# MODEL ONLY: a scope is not a subscription; delivery requires subscribe on the resource.
class Scope:
    def __init__(self, ns):
        self.ns, self.subs = ns, {}
    def subscribe(self, rid, c):
        self.subs[rid] = c
        return self.subs[rid]
class NS:
    def __init__(self): self.log = {}
    def pump(self, rid, ev):
        self.log.setdefault(rid, []).append(ev)
observed = {}
ns_D, s_D = NS(), Scope("ns_D")
s_D.subscribe("data-1", 0)          # S08 step 7: the subscription row
ns_D.pump("data-1", "ArtifactReady")
observed["s_D"] = [e for rid, evs in ns_D.log.items() if rid in s_D.subs for e in evs]
print("delivered:", observed)
assert observed["s_D"] == ["ArtifactReady"]
