# MODEL ONLY: proves the incarnation rule, not the product or any protocol.
class Namespace:
    def __init__(self, burn_local_ids):
        self.resources, self.burned, self.burn = {}, set(), burn_local_ids
    def announce(self, lid):
        if self.burn and lid in self.burned:
            raise RuntimeError("LocalIdBurned")
        self.resources[lid] = []
    def pump(self, lid, ev):
        self.resources[lid].append(ev)
        return len(self.resources[lid])
    def subscribe(self, lid, c):
        if lid not in self.resources:
            return ("ExplicitAbsent", [])
        return ("ok", [e for i, e in enumerate(self.resources[lid], 1) if i >= c])
    def retire(self, lid):
        del self.resources[lid]
        if self.burn:
            self.burned.add(lid)

for burn in (False, True):
    ns = Namespace(burn)
    ns.announce("job-7")
    for i in range(1, 21):
        ns.pump("job-7", {"pct": i})
    ns.retire("job-7")
    if burn:
        try:
            ns.announce("job-7")
        except RuntimeError as e:
            print("burn=True re-announce ->", e)
        ns.announce("job-7#2")
        print("burn=True old id ->", ns.subscribe("job-7", 21))
    else:
        ns.announce("job-7")
        for i in range(1, 6):
            ns.pump("job-7", {"pct": i})
        print("burn=False stale cursor ->", ns.subscribe("job-7", 21))
print("FE-CE-027: burn makes a stale cursor return ExplicitAbsent instead of skipping")
