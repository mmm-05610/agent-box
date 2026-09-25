# MODEL ONLY: proves the branches are separate, not the product.
class NS:
    def __init__(self): self.log, self.torn = [1, 2], False
    def teardown(self): self.torn, self.log = True, []
def catchup_after(loss_is_permanent):
    ns = NS()
    if loss_is_permanent:
        ns.teardown()                       # item 8b: permanent
        return None                         # view must re-pair, replay from 0
    return [e for e in ns.log if e > 1]     # item 8: transient, saved_last_seen+1
print("transient:", catchup_after(False), "permanent:", catchup_after(True))
assert catchup_after(False) == [2] and catchup_after(True) is None
print("FE-CE-029: same-ns catch-up reachable only when teardown did not run")
