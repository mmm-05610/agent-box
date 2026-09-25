# MODEL ONLY: proves the ordering/cursor rule, not the product or any protocol.
class Sub:
    def __init__(self, c, replay):
        self.c, self.got = c, list(replay)
    def __repr__(self):
        return "Sub(c=%s, got=%r)" % (self.c, self.got)

class Stream:
    def __init__(self):
        self.log, self.subs = [], []
    def pump(self, ev):
        self.log.append(ev)
        seq = len(self.log)
        for s in self.subs:                       # live delivery to attached subscribers
            if s.c <= seq:
                s.got.append(ev)
        return seq
    def subscribe(self, c):
        s = Sub(c, [e for i, e in enumerate(self.log, 1) if i >= c])
        self.subs.append(s)
        return s
    def cursor_resolve(self):
        return len(self.log) + 1                  # next Seq the resource will assign

def s01(subscribe_first, use_live_edge):
    s = Stream()
    if subscribe_first:
        sub = s.subscribe(0)                      # S02/S04 order: subscribe, then pump
    s.pump("typed delta h")                       # S01 step 4: the two typed deltas
    s.pump("typed delta e")
    if subscribe_first:
        return sub
    return s.subscribe(s.cursor_resolve() if use_live_edge else 0)

as_written = s01(False, True)
with_zero = s01(False, False)
subscribe_first = s01(True, False)
print("S01 as written (pump, then cursor_resolve) ->", as_written)
print("S01 with from_cursor=0                     ->", with_zero)
print("S02/S04 order (subscribe, then pump)       ->", subscribe_first)
assert as_written.got == [], as_written
assert len(with_zero.got) == 2, with_zero
assert len(subscribe_first.got) == 2, subscribe_first
print("FE-CE-025: the live edge is the wrong choice for a resource this extension just created; the same code subscribes correctly when the subscription precedes the events")
