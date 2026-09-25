"""Twelve scenarios as data, driven through ONE shared model (core.py).

MODEL ONLY. Each scenario is the artifact's own step table translated into the same op
vocabulary; nothing here adds behaviour the artifact does not state. Where the model hits
a case the artifact is silent about, core.py raises Unspecified and the runner reports it
as a finding instead of guessing.

`as_written_*` entries are the scenarios exactly as `candidates/best.md` (digest fece1121…
/ 25c36f4c…) states them; `fixed_*` entries are the R013 revision. Running both is how the
round shows a defect is real and that the repair actually repairs it.
"""

OPS_DOC = """
op vocabulary (one model, no per-scenario specials)
  ("ns",        key, service)                 host.open_namespace
  ("announce",  key, local_id, kind, schema, caps)
  ("register",  key, local_id, action, result_fields)   handler: returns dict
  ("pump",      key, local_id, schema, payload)
  ("retire",    key, local_id, reason)
  ("teardown",  key, reason)
  ("link_lost", key)                          adapter observes the service link lost
  ("scope",     skey, key)                    ViewHost.open_scope
  ("sub",       skey, local_id, cursor)       cursor: 0 | "live" | "saved+1"
  ("close",     subkey)
  ("invoke",    skey, local_id, action, params)
  ("read",      skey, local_id, prior)        what the default view renders
  ("unmount",   skey)
"""

# --------------------------------------------------------------------------- scenarios

S01 = ("S01", [
    ("ns", "echo", "text-echo"),
    ("announce", "echo", "main", "text.stream", "text.delta", {"cancel": "not_supported"}),
    # as-written table has NO register row for the "send" action it invokes
    ("register", "echo", "main", "send", ["text"]),
    ("scope", "s", "echo"),
    ("invoke", "s", "main", "send", {"text": "hello"}),
    ("pump", "echo", "main", "text.delta", {"text": "h"}),
    ("pump", "echo", "main", "text.delta", {"text": "e"}),
    ("sub", "s", "main", 0),          # R013 repaired: from_cursor=0 (extension created it)
])

S02 = ("S02", [
    ("ns", "pi", "ordessa"),
    ("announce", "pi", "tools", "tool.event", "tool.event.v1", {"approve": "supported"}),
    ("register", "pi", "tools", "read", ["state"]),
    ("register", "pi", "tools", "send", ["text"]),
    ("register", "pi", "tools", "approve", ["ok"]),
    ("scope", "s", "pi"),
    ("sub", "s", "tools", "live"),        # subscribe BEFORE the events (correct order)
    ("invoke", "s", "tools", "send", {"text": "run"}),
    ("pump", "pi", "tools", "tool.event.v1", {"state": "running"}),
    ("pump", "pi", "tools", "tool.event.v1", {"state": "done"}),
])

S03 = ("S03", [
    ("ns", "A", "runner"),
    ("announce", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("register", "A", "job-7", "read", ["pct"]),
    ("scope", "s", "A"),
    ("sub", "s", "job-7", 0),             # first session: full history
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 1}),
    ("close", "s#0"),
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 2}),   # no subscriber alive
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 3}),
    ("sub2", "s", "job-7", "saved+1", 3),  # returns and catches up
])

S04 = ("S04", [
    ("ns", "A", "runner"),
    ("announce", "A", "acme", "acme.job", "acme.submit.v1", {"cancel": "not_supported"}),
    ("register", "A", "acme", "submit", ["job_resource"]),
    ("scope", "s", "A"),
    ("invoke", "s", "acme", "submit", {"input": "x"}),
    ("announce", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "not_supported"}),
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 0}),   # head, inside the invoke
    ("sub", "s", "job-7", 0),
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 50}),
    ("pump", "A", "job-7", "acme.job.v1", {"result": "ok"}),
    ("retire", "A", "job-7", "done"),
])

S05 = ("S05", [
    ("ns", "cfg", "cfg"),
    ("announce", "cfg", "app.conf", "config.tree", "config.tree.v1", {"read": "supported"}),
    ("register", "cfg", "app.conf", "read", ["port", "files", "diff_body"]),
    ("pump", "cfg", "app.conf", "config.tree.v1",
     {"port": 8080, "files": [{"path": "a.rs", "additions": 1, "deletions": 2}],
      "diff_body": "<b>"}),
    ("scope", "s", "cfg"),
    ("sub", "s", "app.conf", 0),
    ("invoke", "s", "app.conf", "read", {}),
])

S06 = ("S06", [
    ("ns", "R", "runner"),
    ("ns", "D", "data"),
    ("announce", "R", "job-1", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("announce", "D", "job-1", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("register", "R", "job-1", "cancel", ["ok"]),
    ("register", "D", "job-1", "cancel", ["ok"]),
    ("scope", "sD", "D"),
    ("sub_cross", "sD", "R", "job-1", 0),      # must be ScopeDenied
    ("invoke_cross", "sD", "R", "job-1", "cancel", {}),
    ("list", "sD", "acme.job"),
])

S07 = ("S07", [
    ("ns", "A", "plots"),
    ("announce", "A", "plot-1", "acme.plot", "acme.plot.v1",
     {"export": "supported", "share": "not_supported"}),
    ("register", "A", "plot-1", "read", ["branch"]),
    ("pump", "A", "plot-1", "acme.plot.v1", {"branch": "main"}),
    ("scope", "s", "A"),
    ("list", "s", "acme.plot"),
    ("sub", "s", "plot-1", 0),
    ("invoke", "s", "plot-1", "read", {}),
    ("render_opaque", "acme.plot.v1"),          # no view claims it
])

S08 = ("S08", [
    ("ns", "R", "runner"),
    ("announce", "R", "runner-1", "acme.runner", "acme.runner.v1", {"execute": "supported"}),
    ("register", "R", "runner-1", "execute", ["job_resource"]),
    ("ns", "D", "data"),
    ("announce", "D", "data-1", "acme.data", "acme.data.v1", {"read": "supported"}),
    ("register", "D", "data-1", "read", ["artifact"]),
    ("scope", "sR", "R"),
    ("scope", "sD", "D"),
    ("sub", "sR", "runner-1", "live"),
    ("invoke", "sR", "runner-1", "execute", {"job": "j"}),
    ("announce", "R", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("pump", "R", "job-7", "acme.job.v1", {"pct": 0}),
    ("sub", "sR", "job-7", 0),
    # NOTE as-written: no subscription on any ns_D resource (the reviewer's S08 break)
    ("pump", "D", "data-1", "acme.data.v1", {"artifact": "a"}),
    ("expect_received", "sD", "data-1", 1),
])

S08_FIXED = ("S08", [
    ("ns", "R", "runner"),
    ("announce", "R", "runner-1", "acme.runner", "acme.runner.v1", {"execute": "supported"}),
    ("register", "R", "runner-1", "execute", ["job_resource"]),
    ("ns", "D", "data"),
    ("announce", "D", "data-1", "acme.data", "acme.data.v1", {"read": "supported"}),
    ("register", "D", "data-1", "read", ["artifact"]),
    ("scope", "sR", "R"),
    ("scope", "sD", "D"),
    ("sub", "sR", "runner-1", "live"),
    ("sub", "sD", "data-1", "live"),          # R013 repair: the view watches the data resource
    ("invoke", "sR", "runner-1", "execute", {"job": "j"}),
    ("announce", "R", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("pump", "R", "job-7", "acme.job.v1", {"pct": 0}),
    ("sub", "sR", "job-7", 0),
    ("pump", "D", "data-1", "acme.data.v1", {"artifact": "a"}),
    ("expect_received", "sD", "data-1", 1),
    ("teardown", "R", "superseded"),
    ("expect_gone", "sR", "runner-1"),
])

S09 = ("S09", [
    ("ns", "A", "runner"),
    ("announce", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("register", "A", "job-7", "execute", ["ok"]),
    ("scope", "s", "A"),
    ("sub", "s", "job-7", "live"),
    ("invoke", "s", "job-7", "execute", {}),     # link drops mid-command -> OutcomeUnknown
    ("link_lost", "A"),                          # adapter observes the loss (§R11.4 rule 8)
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 1}),   # "reconnect pumps" as written
    ("sub2", "s", "job-7", "saved+1", 0),        # same-ns catch-up branch as written
])

S09_FIXED = ("S09", [
    # branch (a) adapter did NOT observe a loss: the namespace is alive, a view-side
    #            re-subscribe catches up. This is what saved_last_seen+1 is for.
    ("ns", "A", "runner"),
    ("announce", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("register", "A", "job-7", "execute", ["ok"]),
    ("scope", "s", "A"),
    ("sub", "s", "job-7", "live"),
    ("close", "s#0"),
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 1}),
    ("sub2", "s", "job-7", "saved+1", 1),
    # branch (b) adapter DID observe the loss -> rule 8 teardown -> the namespace is gone,
    #            the view is told ExplicitAbsent and must re-pair. No silent catch-up.
    ("ns", "B", "runner"),
    ("announce", "B", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("scope", "sB", "B"),
    ("sub", "sB", "job-7", "live"),
    ("link_lost", "B"),
    ("expect_gone", "sB", "job-7"),
])

S10 = ("S10", [
    ("ns", "A", "runner"),
    ("announce", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
    ("register", "A", "job-7", "read", ["pct"]),
    ("scope", "s", "A"),
    ("sub", "s", "job-7", 0),
    ("pump", "A", "job-7", "acme.job.v1", {"pct": 10}),
    ("unmount", "s"),                     # unmount closes every subscription through the scope
    ("scope", "s2", "A"),
    ("sub", "s2", "job-7", 0),            # a new view replays what the resource kept
])

S11 = ("S11", [
    ("ns", "A", "jobs"),
    ("announce", "A", "job-1", "acme.job", "acme.job.v1",
     {"cancel": "not_supported", "history": "not_supported", "resume": "unknown"}),
    ("register", "A", "job-1", "read", ["pct"]),
    ("scope", "s", "A"),
    ("sub", "s", "job-1", 0),
    ("invoke", "s", "job-1", "cancel", {}),
    ("caps", "job-1"),                    # render the CapMap
])

S12 = ("S12", [
    ("ns", "R", "runner"),
    ("ns", "D", "data"),
    ("announce", "R", "runner-1", "acme.runner", "acme.runner.v1", {"execute": "supported"}),
    ("announce", "D", "data-1", "acme.data", "acme.data.v1", {"read": "supported"}),
    ("scope", "sR", "R"),
    ("scope", "sD", "D"),
    ("teardown", "R", "service removed"),
    ("list", "sD", "acme.data"),          # unaffected
    ("expect_absent", "open_scope", "R"),
])
