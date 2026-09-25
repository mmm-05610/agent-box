# R001 verifier — dimension D12-authority-boundary

Ledger at round start held exactly two OPEN rows (FE-CE-001 major, FE-CE-002 minor), both against Candidate A; nothing was DISPUTED. The attacker filed no D12 counterexample against Candidate B and recorded its two settle-scenarios as attempts. I replay only those two rows and render a verdict on each; scenario ownership is not mine and no S0x row appears below.

## 1. Fabrication check
No fabricated quote. Every candidate string the attacker used is verbatim in cand-A.md: §A.4 generic view "kind, capability set, declared actions and a last-envelope summary"; §A.2 "seq is monotonic per resource, assigned by the host on ingest"; §A.1 "per-resource event ordering"; §A.8 the removal of a turn/role envelope field. One claim is a mischaracterisation rather than a fabrication: the attacker states A's "content exists **only** as envelopes on `stream.subscribe`." §A.2 also defines `action.invoke(resource_id, action_type:string, params:RegisteredType) → Result{registered type}`, a typed current-value return whose result type is registered per kind. Treating the action Result as not-a-content-path is an argument move, not invented text, so I record it under the FE-CE-001 verdict, not under fabrication.

## 2. FE-CE-001 — does_not_hold
The counterexample's spine is that the core *forces* passive data into a conversation-shaped log because a value primitive is absent. Under A as written that forcing does not hold. (a) The current-value gap is filled by `action.invoke → Result{registered type}` (§A.2); a `git.diff` adapter can register a `read` action whose Result is the current snapshot, which returns a value without any seq replay and is not a message log. (b) The attacker's equation "seq-ordered cursor-resumable message log == assistant-message/conversation stream shape" is contradicted by A's own text: §A.5-S04 states the envelope is `{resource_id,seq,ts,kind,payload}` only — no role, no turn — and §A.8 records that a host turn/role field was deliberately removed precisely because its presence is the D12 disqualifier. An ordered typed-event stream carrying no conversational semantics is generic, not the conversation shape the brief forbids. (c) The stale-diff step relies on choosing a replay-from-origin rendering; §A.2 offers `cursor.resolve` and §A.5-S03 uses `from_cursor=resolved`, so pulling the latest value (or a `read` action) is available at the core. What is still missing for this to hold: a required scenario in which the action Result path is unusable *and* the seq stream is the only representation, which A's S05 trajectory (`directory.list` + a `read`-shaped CapSet) does not supply.

## 3. FE-CE-002 — holds
The minor counterexample survives. §A.2 defines `CapSet` as a *closed* tagged union whose members are `cancel`, `history`, `resume` — literally the recovery features of an interactive agent run — fixed by the host core. That is a session-recovery vocabulary encoded in a host type, against §A.1's claim that "agent", "session", "chat" are adapter resource-kinds "never host types." The closedness is not stylistic: §A.5-S05 announces `config.tree`/`git.diff` with `CapSet{read}`, a member §A.2's union does not admit, so the core vocabulary cannot even describe a passive read. §A.4 then has the *core-builtin* fallback view surface "kind, capability set, declared actions and a last-envelope summary," so an unviewed config item is presented with an invokable-run capability strip. The run/agent reading is materialised by core code, which is the D12 test. The non-destructive fix the attacker proposes (open `capability_name → {supported|not_supported|unknown}` map, adapter-chosen names) keeps S07 non-blank, so the agent-strip is a smuggle and not a requirement. Severity minor stands: the resource is still browsable.

## 4. Missed-check (D12 only)
None beyond the two filed. I examined A's other core surfaces for a hidden service/model/harness/conversation assumption and found none: `SubscriberScope{descriptor, subscriptionHandle, typedInvoker}` (§A.4) is resource-scoped, not an omnipotent context; the host refusing to deliver an unregistered `kind` payload (§A.2) is the opposite of `execute(any)`; host-assigned `seq` (§A.2/§A.5-S09) is event-plane authority, not a conversation object. On B I agree with the attacker: B's core declares no session/run/turn type, and `builtin-default-view-provider` (§B.4) is an *admitted* materialisation for the always-present component, named openly, not smuggled as neutral plumbing. No new FE-CE row is warranted this dimension.

## 5. Self-contradiction check
Candidate A contradicts itself twice, both consistent with FE-CE-002: it claims (§A.1) the host has no content authority and no session shape, yet §A.2's closed `CapSet` bakes in a session-recovery taxonomy, and §A.5-S05 uses `CapSet{read}`, a capability §A.2 does not define — the fixed union is too narrow even for A's own passive-resource trajectory. A clean pass on the D12 literal test would need `CapSet` opened to adapter-named capabilities.

## 6. Experiment
The FE-CE-001 dispute is "is a current value reachable in A's core, or only via replay?" This model encodes only that question. It shows that, given A's two documented ops, the stale-superseded snapshot the attacker describes is a rendering choice (replay-from-origin), not a core mandate. It proves the model only — not A, not the protocol, not any product.

EXPERIMENT:
```python3
# A's documented ops for one resource, modelled minimally.
# Question: does A FORCE stale-on-return, or is a current value reachable?

class Model:
    def __init__(self):
        self.stream = {}          # rid -> list of (seq, diff) envelopes  (A.2 stream)
        self.current = {}         # rid -> value returned by read action   (A.2 action.invoke->Result)
        self.cursor = {}          # rid -> last delivered seq             (A.2 cursor.resolve)
        self.next_seq = {}

    def ingest_diff(self, rid, diff):          # adapter emits envelope (A.2 seq on ingest)
        s = self.next_seq.get(rid, 0) + 1
        self.next_seq[rid] = s
        self.stream.setdefault(rid, []).append((s, diff))
        self.current[rid] = diff               # the read-action Result reflects latest

    def resolve(self, rid):                    # A.2 cursor.resolve
        return self.cursor.get(rid, 0)

    def replay_from(self, rid, from_seq):       # A.5-S03 step4 re-subscribe from_cursor
        return [d for (s, d) in self.stream.get(rid, []) if s > from_seq]

    def action_read(self, rid):                # A.2 action.invoke(rid,"read")->Result
        return self.current[rid]

m = Model()
# Working tree changes twice; each change is a superseding snapshot.
m.ingest_diff("git.diff", "OLD-diff")
page_open = m.replay_from("git.diff", 0)          # while viewing: sees current tail
m.ingest_diff("git.diff", "NEW-diff")             # tree changes, page gone
# Page returns. Two legal A strategies:
replay_all   = m.replay_from("git.diff", 0)        # stale-as-live possible here
fresh_read   = m.action_read("git.diff")           # current value, no replay
tail_from_cur= m.replay_from("git.diff", m.resolve("git.diff") if m.cursor.get("git.diff") else 1)

assert replay_all == ["OLD-diff", "NEW-diff"]       # if you replay from origin you see the superseded one
assert fresh_read == "NEW-diff"                     # core value path returns the current diff
print("stale-present-in-replay-from-origin:", "OLD-diff" in replay_all)
print("current-via-action-read:", fresh_read)
print("CONCLUSION (model only): a current-value path exists in A's ops;")
print("stale-on-return is a rendering choice, not a core-forced conversation shape.")
```

## 7. Dimension record
D12-authority-boundary taken up against both candidates. Result NOT clean: one new `holds` row (FE-CE-002, minor) plus one `does_not_hold` (FE-CE-001) on A; B held. Out-of-dimension notes the attacker deferred (A §A.5-S09 host-assigned `(namespace_id, action_seq)` adapter must know → D06/D01; B "offering module must stay resident" → D02/D06) are recorded and left for their rounds; I do not file them here.
