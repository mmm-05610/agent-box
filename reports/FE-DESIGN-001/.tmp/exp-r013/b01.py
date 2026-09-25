# MODEL ONLY: proves the storage-ownership/disposal model, not the product or any protocol.
class Stream:                       # the cursor stream IS the log
    def __init__(self):
        self.log = []               # retained (seq, payload)
    def pump(self, payload):
        seq = len(self.log) + 1
        self.log.append((seq, payload))
        return seq
    def subscribe(self, from_cursor, live):
        return [(s, p) for (s, p) in self.log if s >= from_cursor] + live
    def retire(self, reason):
        self.log = []               # the sole disposal point

def t_boring(dispose_on_close):
    job = Stream()
    for pct in range(1, 21):
        job.pump({"pct": pct})
    sub = job.subscribe(0, [])                      # first session: full head
    assert len(sub) == 20, len(sub)
    if dispose_on_close:
        job.log = []                                # the deleted clause: "envelope is dropped"
    for pct in range(21, 36):
        job.pump({"pct": pct})                      # no subscriber alive
    return job.subscribe(21, [])                    # the T-Boring return

old, new = t_boring(True), t_boring(False)
print("dispose-on-close   -> caught up %d envelopes" % len(old))
print("retain-to-retire   -> caught up %d envelopes" % len(new))
assert len(old) == 0 and len(new) == 15
print("FE-CE-024 confirmed: retire/teardown is the only disposal point")
