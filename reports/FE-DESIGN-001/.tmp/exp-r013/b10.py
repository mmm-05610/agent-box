# MODEL ONLY: proves the spawn-announce rule, not the product.
class NS:
    def __init__(self): self.r = {}
    def announce(self, lid): self.r[lid] = []
    def invoke_submit(self):
        self.announce("job-7")              # announce inside the handler
        self.r["job-7"].append("head")      # head pumped inside the handler
        return {"job_resource": "job-7"}    # Result names an already-announced resource
    def subscribe(self, lid, c):
        return self.r.get(lid, "ExplicitAbsent")[c:]
ns = NS(); out = ns.invoke_submit()
print("spawned head delivered:", ns.subscribe(out["job_resource"], 0))
assert ns.subscribe(out["job_resource"], 0) == ["head"]
print("FE-CE-031: from_cursor=0 works because the resource was announced before the Result returned")
