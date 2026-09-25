# MODEL ONLY: proves the termination-signal model, not the product.
class Subscription:
    def __init__(self): self.ended = None
class Resource:
    def __init__(self): self.log, self.subs, self.retired = [], [], False
    def subscribe(self, s): self.subs.append(s)
    def pump(self, ev): self.log.append(ev)
    def retire(self, reason):
        self.retired = True
        for s in self.subs:
            s.ended = reason            # onEnd
    def invoke(self):
        return ("ExplicitAbsent",) if self.retired else ("Result", self.log)
r, s = Resource(), Subscription()
r.subscribe(s); r.pump("ev1"); r.retire("bound memory")
print("subscriber ended:", s.ended, "invoke:", r.invoke())
assert s.ended == "bound memory" and r.invoke() == ("ExplicitAbsent",)
