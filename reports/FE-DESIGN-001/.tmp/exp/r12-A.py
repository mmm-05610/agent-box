# MODEL ONLY: proves the incarnation rule, not the product or any protocol.
class Namespace:
    def __init__(self, burn_local_ids):
        self.resources, self.burned, self.burn = {}, set(), burn_local_ids
    def announce(self, lid):
        if self.burn and lid in self.burned:
            raise RuntimeError("LocalIdBurned")
        self.resources[lid] = []                      # a fresh log
    def pump(self, lid, ev):
        self.resources[lid].append(ev)
        return len(self.resources[lid])               # host-assigned seq
    def cursor_resolve(self, lid):
        return None if lid not in self.resources else len(self.resources[lid]) + 1
    def subscribe(self, lid, c):
        if lid not in self.resources:
            return ("ExplicitAbsent", [])             # retired or never announced
        log = self.resources[lid]
        return ("ok", [e for i, e in enumerate(log, 1) if i >= c])
    def retire(self, lid):
        del self.resources[lid]
        if self.burn:
            self.burned.add(lid)                      # one incarnation per local_id

for burn in (False, True):
    ns = Namespace(burn)
    ns.announce("job-7")
    for i in range(1, 21):
        ns.pump("job-7", {"pct": i})
    saved = 20                                        # the view persisted saved_last_seen
    ns.retire("job-7")
    if burn:
        try:
            ns.announce("job-7")                      # the R11.3 memory lever, same id
        except RuntimeError as e:
            print("burn=True   re-announce same id -> %s" % e)
        ns.announce("job-7#2")                        # the successor must take a new id
        for i in range(1, 6):
            ns.pump("job-7#2", {"pct": i})
        print("burn=True   returning to the OLD id ->", ns.subscribe("job-7", saved + 1))
        print("burn=True   successor is a different resource ->", ns.subscribe("job-7#2", 0))
    else:
        ns.announce("job-7")
        for i in range(1, 6):
            ns.pump("job-7", {"pct": i})
        st, got = ns.subscribe("job-7", saved + 1)    # the only guard is the namespace id
        print("burn=False  same id re-announced -> catch-up renders %r and looks complete,"
              " hiding seq 1..5" % (got,))
        assert got == [], got
print("FE-CE-027: without the burn rule a re-announced local_id makes a stale cursor skip silently; with it the view is told ExplicitAbsent instead")
