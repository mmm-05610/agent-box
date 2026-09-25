# MODEL ONLY: proves the ordering/cursor rule, not the product or any protocol.
class Stream:
    def __init__(self):
        self.log, self.subs = [], []
    def pump(self, ev):
        self.log.append(ev)
        for s in self.subs:
            if s.c <= len(self.log):
                s.got.append(ev)
    def subscribe(self, c):
        return (c, [e for i, e in enumerate(self.log, 1) if i >= c])
    def cursor_resolve(self):
        return len(self.log) + 1

s = Stream(); s.pump("h"); s.pump("e")
assert s.subscribe(s.cursor_resolve())[1] == []
assert len(s.subscribe(0)[1]) == 2
print("FE-CE-025: live edge wrong for a just-created resource; from_cursor=0 admits inputs")
