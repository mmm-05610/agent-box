## Verification of R006 Attack (D01-order-dedup)

### Verdicts

**FE-CE-012 — holds.** The candidate states at R6.2: "`seq` host-assigned monotonic per resource." At R6.5-S09 step 2: "host dedups/reorders by `(ns,resource,seq)`." Since the host assigns a strictly increasing seq to every envelope it receives for a given resource, no two envelopes for the same resource can share a (ns,resource,seq) triple. The dedup predicate is structurally false for all inputs. The candidate text that fails to prevent this: R6.5-S09 step 2 claims a host dedup capability that R6.2's seq-assignment rule makes impossible. No other mechanism (content hash, protocol-level idempotency key) is specified in the Envelope or pump interface for the host to identify logical duplicates.

**FE-CE-013 — holds.** R6.3 item 6 states: "on reconnect, deduplicate/reorder by `(ns_id, resource_local_id, seq)` before presenting to the stream." R6.2 states: "`seq` host-assigned monotonic per resource." The pump interface (R6.3 item 3, R6.7 item 4) is described as "seq-ordered event pump — adapter-side loop; host assigns seq" with no documented return value. The candidate defines exactly one "seq" (host-assigned envelope.seq) and does not introduce an adapter-side sequence concept. The boundary rule instructs the adapter to use a field it has no specified access to at pump time. The text that fails to prevent this: R6.7 item 7 says "adapter implements (ns,local_id,seq) key dedup" without providing the adapter the seq value.

**FE-CE-014 — holds.** R6.5-S09 step 2: "host dedups/**reorders** by `(ns,resource,seq)`." Since the host assigns seq in pump-arrival order (R6.2: "host-assigned monotonic"), sorting received envelopes by their host-assigned seq returns them in arrival order — a no-op. The Envelope contains `ts` but no mechanism reads it for ordering. The candidate provides no reorder buffer, no remote-stable sequence number, and no adapter-assigned ordering key visible to the host. The text that fails to prevent this: R6.3 item 3 says "seq-ordered pump" meaning the adapter pumps in arrival order; the host cannot detect or correct logical out-of-order because it defines order as arrival.

**FE-CE-007 — holds (unchanged, N/A against A).** B-alternative defect. A has no edges mechanism. Status unchanged: OPEN against B, N/A against A.

### Checks

FABRICATION_CHECK: none. All quoted text (R6.2 "seq host-assigned monotonic per resource", R6.5-S09 "host dedups/reorders by (ns,resource,seq)", R6.3 items 3 and 6, R6.7 items) appears verbatim or near-verbatim in the R006 candidate. The attacker's characterization of the pump interface as having no documented return value is accurate — no text in R6.2, R6.3, or R6.7 specifies a pump return.

CONTRADICTION_CHECK: R6.5-S09 step 2 claims "host dedups/reorders by (ns,resource,seq)" and R6.5-S09 closing line says "Owner: core provides structural guarantees (dedup, no-auto-resubmit)." This contradicts R6.2's "`seq` host-assigned monotonic per resource." A host-assigned monotonic counter cannot serve as a dedup key for itself, and sorting by self-assigned arrival-order seq cannot reorder. The candidate's S09 trajectory attributes a dedup/reorder capability to the core that its own data model structurally prevents.

MISSED_CHECK: none. The three counterexamples exhaustively cover the D01 dimension against this candidate: (a) host dedup is vacuous, (b) adapter dedup key is inaccessible, (c) host reorder is identity. No additional ordering or dedup mechanism exists in the candidate text to attack.

### Experiment

EXPERIMENT:
```python
"""Model: host dedup by (ns,resource,seq) with seq=host-assigned monotonic.
Proves: the dedup predicate never fires for replayed content.
Only proves the model, not the design."""

class Host:
    def __init__(self):
        self._next_seq = {}  # resource_id -> next seq
        self._seen = set()   # (ns,local_id,seq) tuples delivered

    def assign_seq(self, resource_id):
        s = self._next_seq.get(resource_id, 0)
        self._next_seq[resource_id] = s + 1
        return s

    def deliver(self, resource_id, seq):
        key = (resource_id[0], resource_id[1], seq)
        if key in self._seen:
            return False  # dedup fired
        self._seen.add(key)
        return True  # delivered

def pump_event(host, resource_id, content):
    seq = host.assign_seq(resource_id)
    return (seq, host.deliver(resource_id, seq), content)

def run():
    h = Host()
    res = ("ns_A", "log")
    # Normal: adapter pumps A, B
    s1, delivered1, c1 = pump_event(h, res, "event-A")
    s2, delivered2, c2 = pump_event(h, res, "event-B")
    assert s1 == 0 and s2 == 1
    assert delivered1 and delivered2

    # Reconnect: adapter replays A, B
    s3, delivered3, c3 = pump_event(h, res, "event-A")
    s4, delivered4, c4 = pump_event(h, res, "event-B")
    assert s3 == 2 and s4 == 3  # new seq, never seen before
    print(f"Replayed A: seq={s3} delivered={delivered3} (dedup fired: {not delivered3})")
    print(f"Replayed B: seq={s4} delivered={delivered4} (dedup fired: {not delivered4})")
    assert delivered3, "DEDUP FAILED TO FIRE: replayed A delivered as new"
    assert delivered4, "DEDUP FAILED TO FIRE: replayed B delivered as new"
    print("MODEL VERDICT: host dedup by (ns,resource,seq) never fires.")
    print("Monotonic host-assigned seq guarantees no key collision.")
    return True

run()
```

### Ledger disposition

FE-CE-012: holds → stays OPEN (major, against A R006 bytes). Requires: a dedup mechanism with a real collision domain (e.g., adapter-stable idempotency key in the Envelope, or content-hash).
FE-CE-013: holds → stays OPEN (major, against A R006 bytes). Requires: pump interface must either return assigned seq to adapter, or rule 6 must name an adapter-visible key.
FE-CE-014: holds → stays OPEN (major, against A R006 bytes). Requires: either a remote-stable sequence in the Envelope that the host uses for reorder, or explicit withdrawal of the "reorders" claim and S09 downgrade to adapter-only ordering.
FE-CE-007: unchanged OPEN against B, N/A against A.

S09 coverage status: the "dedup" and "reorder" attributions to core in R6.5-S09 are structurally inert per FE-CE-012/014. The core's actual S09 contributions are: (a) never-auto-resubmit invariant, (b) cursor.resolve resume point, (c) seq-ordered stream (prevents host-side reordering of what it receives). The "dedups/reorders" claim must be corrected or withdrawn; S09 owner should be restated as adaptation-primary with core providing structural ordering guarantees only.
