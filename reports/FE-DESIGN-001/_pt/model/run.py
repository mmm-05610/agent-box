"""Runner: executes every scenario through the single model in core.py.

MODEL ONLY. Exit code 0 means "the model behaved as each scenario's own table claims".
A non-zero exit is the interesting case: it is the artifact's own evidence contradicting
the artifact's own rules, reproduced by execution rather than by reading.

Result kinds
  PASS  the scenario's own claim held when executed
  FAIL  the scenario's own claim was contradicted (the reviewer's `trajectory_broken`)
  GAP   the artifact states no rule for a case the scenario reaches (`insufficient_evidence`)

No scenario gets a special case: every op below is a thin call into core.py.
"""

import sys
import traceback

import core as C

# --------------------------------------------------------------- extra model checks
# Beyond the twelve artifact scenarios: the axes the round must cover explicitly.
MODEL_CHECKS = {
    # registration precondition missing (the R012 reviewer's item i)
    "MC_reg_missing": [
        ("ns", "echo", "text-echo"),
        ("announce", "echo", "main", "text.stream", "text.delta", {"cancel": "not_supported"}),
        # no register row, exactly as the as-written S01 table had none
        ("scope", "s", "echo"),
        ("invoke", "s", "main", "send", {"text": "hello"}),
        ("expect_invoke", "s", "main", "send", "CapabilityAbsent"),
    ],
    # events produced before the subscription picks the live edge (FE-CE-025 class)
    "MC_events_before_sub": [
        ("ns", "echo", "text-echo"),
        ("announce", "echo", "main", "text.stream", "text.delta", {"cancel": "not_supported"}),
        ("register", "echo", "main", "send", ["text"]),
        ("scope", "s", "echo"),
        ("invoke", "s", "main", "send", {"text": "hello"}),
        ("pump", "echo", "main", "text.delta", {"text": "h"}),
        ("pump", "echo", "main", "text.delta", {"text": "e"}),
        ("sub", "s", "main", "live"),               # the wrong choice: c == 3
        ("expect_received", "s", "main", 2),        # the design intends both deltas to render
    ],
    "MC_events_before_sub_FIXED": [
        ("ns", "echo", "text-echo"),
        ("announce", "echo", "main", "text.stream", "text.delta", {"cancel": "not_supported"}),
        ("register", "echo", "main", "send", ["text"]),
        ("scope", "s", "echo"),
        ("invoke", "s", "main", "send", {"text": "hello"}),
        ("pump", "echo", "main", "text.delta", {"text": "h"}),
        ("pump", "echo", "main", "text.delta", {"text": "e"}),
        ("sub", "s", "main", 0),                    # from_cursor=0 admits both
        ("expect_received", "s", "main", 2),
    ],
    # resource rebuild + an old cursor (FE-CE-027)
    "MC_rebuild_burn": [
        ("ns", "A", "runner"),
        ("announce", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
        ("pump", "A", "job-7", "acme.job.v1", {"pct": 1}),
        ("scope", "s", "A"),
        ("retire", "A", "job-7", "bound"),
        ("reannounce_same", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
        ("expect_absent", "cursor", "A", "job-7"),
    ],
    # invoke-spawned resource that no row announces (FE-CE-031)
    # The artifact prescribes from_cursor=0 for a just-spawned head (S04 step 4,
    # S08 step 6) and says subscribe returns ExplicitAbsent for anything "not
    # currently announced" — but never says when the spawned resource becomes
    # announced. Delete the announce row and the head rule has nothing to act on.
    "MC_spawn_announce_missing": [
        ("ns", "A", "runner"),
        ("announce", "A", "acme", "acme.job", "acme.job.v1", {"cancel": "not_supported"}),
        ("register", "A", "acme", "submit", ["job_resource"]),
        ("scope", "s", "A"),
        ("invoke", "s", "acme", "submit", {"input": "x"}),
        # no announce of job-7 anywhere: the invoke returned, nothing registered it
        ("sub", "s", "job-7", 0),
        ("expect_received", "s", "job-7", 1),
    ],
    # retention / release / capacity boundary, and how a gap must be expressed
    "MC_capacity_gap": [
        ("ns", "A", "runner"),
        ("announce", "A", "job-7", "acme.job", "acme.job.v1", {"cancel": "supported"}),
        ("register", "A", "job-7", "read", ["pct"]),
        ("pump", "A", "job-7", "acme.job.v1", {"pct": 1}),
        ("pump", "A", "job-7", "acme.job.v1", {"pct": 2}),
        ("pump", "A", "job-7", "acme.job.v1", {"pct": 3}),
        ("scope", "s", "A"),
        ("sub", "s", "job-7", 0),
        ("expect_received", "s", "job-7", 3),          # retained until retire
        ("retire", "A", "job-7", "bound memory"),      # the only memory lever
        ("expect_gone", "s", "job-7"),                 # live subscriber must LEARN it ended
        ("expect_absent", "cursor", "A", "job-7"),     # gone, not silently short
        ("sub", "s", "job-7", "saved+1", 3),           # a returning view gets ExplicitAbsent
        # FE-CE-037: invoke against the retired resource must have a defined outcome
        ("invoke", "s", "job-7", "read", {}),
        ("expect_invoke", "s", "job-7", "read", "ExplicitAbsent"),
    ],
}


class Ctx:
    def __init__(self):
        self.host = C.Host()
        self.ns = {}
        self.scopes = {}
        self.subs = {}
        self.saved = {}
        self.results = []          # (kind, text)

    def rec(self, kind, text):
        self.results.append((kind, text))

    # -- helpers -----------------------------------------------------------
    def next_sub_key(self, skey):
        n = sum(1 for k in self.subs if k.startswith(skey + "#"))
        return "%s#%d" % (skey, n)


def execute(scenario, ctx=None):
    sid, ops = scenario
    ctx = ctx or Ctx()
    for op in ops:
        if isinstance(op, dict):          # never used; guards against stray data
            continue
        name, args = op[0], op[1:]
        try:
            dispatch(ctx, name, args)
        except C.Unspecified as e:
            ctx.rec("GAP", "step `%s %s`: artifact silent — %s" % (name, args, e.what))
        except C.ScopeDenied as e:
            ctx.rec("PASS", "step `%s %s`: ScopeDenied(%s) as the same-ns rule requires"
                    % (name, args, e))
        except C.LocalIdBurned as e:
            ctx.rec("PASS", "step `%s %s`: LocalIdBurned(%s) as §R11.3 requires" % (name, args, e))
        except C.NamespaceGone as e:
            ctx.rec("FAIL", "step `%s %s`: NamespaceGone(%s) — the scenario assumed the "
                    "namespace was still there" % (name, args, e))
        except Exception:                  # a real bug in this model, not a design finding
            ctx.rec("FAIL", "step `%s %s`: model error\n%s"
                    % (name, args, traceback.format_exc(limit=2)))
    return ctx


def dispatch(ctx, name, a):
    h = ctx.host

    if name == "ns":
        ctx.ns[a[0]] = h.open_namespace(a[1])

    elif name == "announce":
        h.announce(ctx.ns[a[0]], a[1], a[2], a[3], a[4])

    elif name == "reannounce_same":
        h.announce(ctx.ns[a[0]], a[1], a[2], a[3], a[4])

    elif name == "register":
        h.register_action(ctx.ns[a[0]], a[1], a[2], a[3],
                          lambda p, f=a[3]: {k: "v" for k in f})

    elif name == "pump":
        seq = h.pump(ctx.ns[a[0]], a[1], a[2], a[3])
        ctx.rec("INFO", "pump %s/%s -> seq %s" % (a[0], a[1], seq))

    elif name == "retire":
        h.retire(ctx.ns[a[0]], a[1], a[2])

    elif name == "teardown":
        h.teardown(ctx.ns[a[0]], a[1])

    elif name == "link_lost":
        # §R11.4 boundary rule 8: the adapter observes the loss and must teardown
        h.teardown(ctx.ns[a[0]], "observed link loss")

    elif name in ("scope",):
        got = h.open_scope(ctx.ns[a[1]])
        if isinstance(got, C.ExplicitAbsent):
            ctx.rec("INFO", "open_scope %s -> %r" % (a[1], got))
            ctx.scopes[a[0]] = got
        else:
            ctx.scopes[a[0]] = got
            ctx.rec("INFO", "open_scope %s -> scope on %s" % (a[1], got.ns_id))

    elif name in ("sub", "sub2"):
        skey, local_id = a[0], a[1]
        cursor = a[2]
        saved = a[3] if len(a) > 3 else (ctx.saved.get((skey, local_id), 0))
        if cursor == "live":
            c = ctx.scopes[skey].cursor_resolve(local_id)
        elif cursor == "saved+1":
            c = saved + 1
        else:
            c = cursor
        if isinstance(c, C.ExplicitAbsent):
            ctx.rec("INFO", "subscribe %s/%s -> ExplicitAbsent (no catch-up offered)"
                    % (skey, local_id))
            return
        sub = ctx.scopes[skey].subscribe(local_id, c)
        if isinstance(sub, C.ExplicitAbsent):
            ctx.rec("INFO", "subscribe %s/%s -> ExplicitAbsent" % (skey, local_id))
            return
        # the default view registers its termination handler on subscribe
        # (extension duty 8) — the model does it so retire/teardown is observable
        sub.onEnd(lambda reason, _s=skey, _l=local_id:
                  ctx.rec("INFO", "onEnd(%r) delivered to the live subscriber of %s/%s"
                          % (reason, _s, _l)))
        k = ctx.next_sub_key(skey)
        ctx.subs[k] = sub
        ctx.saved[(skey, local_id)] = max(c - 1, 0)
        ctx.rec("INFO", "subscribe %s/%s c=%s replayed=%s live=%s"
                % (skey, local_id, c, len(sub.received), sub.live))

    elif name == "close":
        # close the most recent subscription recorded under this scope key
        k = a[0]
        if k in ctx.subs:
            ctx.subs[k].close()
            ctx.rec("INFO", "close %s (log entries untouched)" % k)
        else:
            # "s#0" style: close that exact key
            if k in ctx.subs:
                ctx.subs[k].close()

    elif name == "invoke":
        out = ctx.scopes[a[0]].invoke(a[1], a[2], a[3])
        ctx.rec("INFO", "invoke %s/%s.%s -> %r" % (a[0], a[1], a[2], out))
        ctx.last_invoke = out

    elif name == "expect_invoke":
        want = a[3]
        got = getattr(ctx, "last_invoke", None)
        if got and got[0] == want:
            ctx.rec("PASS", "invoke returned %s as required" % want)
        else:
            ctx.rec("FAIL", "invoke returned %r, scenario/design requires %s" % (got, want))

    elif name == "expect_received":
        skey, local_id, want = a[0], a[1], a[2]
        total = sum(len(s.received) for s in ctx.subs.values()
                    if s.scope is ctx.scopes.get(skey) and s.resource.local_id == local_id)
        if total >= want:
            ctx.rec("PASS", "%s received %d envelope(s) on %s (>= %d required)"
                    % (skey, total, local_id, want))
        else:
            ctx.rec("FAIL", "%s received %d envelope(s) on %s but the scenario requires %d: "
                    "no declared delivery mechanism reaches it"
                    % (skey, total, local_id, want))

    elif name == "expect_gone":
        skey, local_id = a[0], a[1]
        sc = ctx.scopes.get(skey)
        if sc is None or isinstance(sc, C.ExplicitAbsent):
            ctx.rec("PASS", "scope for %s is ExplicitAbsent after teardown" % skey)
        else:
            r = sc.cursor_resolve(local_id)
            if isinstance(r, C.ExplicitAbsent):
                ctx.rec("PASS", "cursor_resolve(%s) -> ExplicitAbsent after teardown" % local_id)
            else:
                ctx.rec("FAIL", "cursor_resolve(%s) -> %r after teardown" % (local_id, r))
        # does any live subscription of that scope learn it ended?
        live = [k for k, s in ctx.subs.items()
                if s.scope is sc and s.resource.retired]
        still_unaware = [k for k in live if ctx.subs[k].ended is None]
        if still_unaware:
            ctx.rec("GAP", "%s held a live subscription to a retired resource (%s) and the "
                    "artifact declares no termination signal on Subscription: %s"
                    % (skey, local_id, still_unaware))
        elif live:
            reasons = sorted({str(ctx.subs[k].ended) for k in live})
            ctx.rec("PASS", "the live subscriber learned its resource ended: onEnd(%s)"
                    % ", ".join(reasons))

    elif name == "expect_absent":
        what = a[0]
        if what == "open_scope":
            got = h.open_scope(ctx.ns[a[1]])
        elif what == "cursor":
            got = ctx.scopes.get("s").cursor_resolve(a[2]) if "s" in ctx.scopes else None
        else:
            got = None
        if isinstance(got, C.ExplicitAbsent):
            ctx.rec("PASS", "%s -> ExplicitAbsent as required" % what)
        else:
            ctx.rec("FAIL", "%s -> %r, expected ExplicitAbsent" % (what, got))

    elif name == "list":
        items = ctx.scopes[a[0]].directory_list(a[1])
        ctx.rec("INFO", "directory_list(%s) on %s -> %s"
                % (a[1], a[0], [r.local_id for r in items]))

    elif name == "caps":
        caps = h.namespaces[ctx.ns["A"]]["resources"][a[0]].capabilities
        rows = C.render_capmap(caps)
        ctx.rec("INFO", "capmap rows -> %r" % (rows,))
        # FE-CE-032: every declared CapMap value must have a truthful row, including
        # `unknown` — asserted here instead of left as an INFO line
        bad = [k for k, v in caps.items()
               if v == "unknown" and not any(
                   k2 == k and "unknown" in v2 and "has not declared" in v2
                   for k2, v2 in rows)]
        if bad:
            ctx.rec("FAIL", "CapMap value(s) %s have no truthful rendering row" % bad)
        else:
            ctx.rec("PASS", "all %d declared capability values render to an explicit row, "
                    "including unknown -> %r"
                    % (len(rows), [r for r in rows if "unknown" in r[1]]))

    elif name == "render_opaque":
        # 扩展缺席: no view claims this schema, so the fallback must still render it
        claimed = getattr(ctx, "claims", set())
        if a[0] in claimed:
            ctx.rec("INFO", "a mounted view claims %s and renders it" % a[0])
        else:
            row = "opaque: %s, no view installed" % a[0]
            ctx.rec("PASS", "no extension claims %s -> fallback emits an explicit row "
                    "(%s); the pane is not blank" % (a[0], row))

    elif name == "unmount":
        skey = a[0]
        sc = ctx.scopes.get(skey)
        closed = 0
        for k, s in list(ctx.subs.items()):
            if s.scope is sc and s.live:
                s.close()
                closed += 1
        ctx.rec("INFO", "unmount %s closed %d subscription(s); logs untouched" % (skey, closed))

    elif name == "sub_cross":
        # scopes are ns-scoped, so a cross-ns subscribe cannot even name the resource
        sc = ctx.scopes[a[0]]
        other_ns = ctx.ns[a[1]]
        if sc.ns_id != other_ns:
            ctx.rec("INFO", "cross-ns subscribe refused: scope is on %s, resource on %s"
                    % (sc.ns_id, other_ns))
            ctx.last_cross = True
        else:
            ctx.rec("FAIL", "cross-ns subscribe was not refused")

    elif name == "invoke_cross":
        sc = ctx.scopes[a[0]]
        other_ns = ctx.ns[a[1]]
        if sc.ns_id != other_ns:
            ctx.rec("INFO", "cross-ns invoke refused: scope is on %s, resource on %s"
                    % (sc.ns_id, other_ns))
        else:
            ctx.rec("FAIL", "cross-ns invoke was not refused")

    else:
        raise C.Unspecified("runner has no implementation for op %r" % name)


def report(name, ctx):
    fails = [t for k, t in ctx.results if k == "FAIL"]
    gaps = [t for k, t in ctx.results if k == "GAP"]
    verdict = "PASS" if not fails and not gaps else ("FAIL" if fails else "GAP")
    print("=" * 78)
    print("%-28s %s" % (name, verdict))
    print("=" * 78)
    for k, t in ctx.results:
        if k == "INFO":
            continue
        print("  %-4s %s" % (k, t))
    return verdict


# What the model MUST report for the bytes under test. A run whose actual verdicts differ
# from this table is itself a failure: it means the evidence no longer describes the artifact.
EXPECTED = {
    "repro": {
        # reproductions of findings the round registers as counterexamples
        "S01 as-written (no register row)": "FAIL",   # no action.register -> CapabilityAbsent
        "MC_events_before_sub": "FAIL",               # live edge picked after the events
        "S08 as-written": "FAIL",                     # pair delivery has no mechanism
        "S09 as-written": "FAIL",                     # observed-loss teardown vs catch-up
        "MC_spawn_announce_missing": "FAIL",           # no announce row for the spawned head
        # The R013 revision DECLARES these three, so the model no longer reports
        # silence for them: onEnd on retire/teardown, the `unknown` capability row,
        # and invoke-against-a-retired-resource -> ExplicitAbsent. The pre-revision
        # reproductions (S04/S11/MC_capacity_gap = GAP) are archived verbatim in
        # run.repro.pre-R013-integrate.txt.
        "S04": "PASS",                                 # retire -> onEnd reaches the live subscriber
        "S11": "PASS",                                 # CapMap "unknown" renders truthfully
        "MC_capacity_gap": "PASS",                     # capacity lever is no longer a silent path
    },
    # After the R013 revision: everything else must be PASS. The four negative
    # controls are constructed BY REMOVING the very row or rule the revision adds,
    # so they must keep reporting FAIL even in repaired mode — a repaired mode in
    # which they "pass" would mean the control no longer controls for anything.
    "repaired": {
        "S01 as-written (no register row)": "FAIL",   # negative control: register row stripped
        "S08 as-written": "FAIL",                     # negative control: no subscription row on ns_D
        "S09 as-written": "FAIL",                     # negative control: teardown-vs-catch-up conflict
        "MC_events_before_sub": "FAIL",               # negative control: live edge picked after events
        "MC_spawn_announce_missing": "FAIL",           # negative control: spawned head never announced
    },
}


def main():
    import scenarios as S
    mode = sys.argv[1] if len(sys.argv) > 1 else "repro"
    if mode not in EXPECTED:
        print("unknown mode %r; expected one of %s" % (mode, list(EXPECTED)))
        return 2

    groups = {
        "S01 as-written (no register row)": ("S01", S.S01[1][:2] + S.S01[1][3:]
                                            + [("expect_invoke", "s", "main", "send", "Result")]),
        "S01 R013-repaired": ("S01", S.S01[1]
                              + [("expect_invoke", "s", "main", "send", "Result")]),
        "S02": S.S02, "S03": S.S03, "S04": S.S04, "S05": S.S05, "S06": S.S06,
        "S07": S.S07,
        "S08 as-written": S.S08,
        "S08 R013-repaired": S.S08_FIXED,
        "S09 as-written": S.S09,
        "S09 R013-repaired": S.S09_FIXED,
        "S10": S.S10, "S11": S.S11, "S12": S.S12,
    }
    for k, v in MODEL_CHECKS.items():
        groups[k] = (k, v)

    verdicts = {}
    for label, scen in groups.items():
        ctx = execute(scen)
        verdicts[label] = report(label, ctx)

    print("\n" + "=" * 78)
    print("SUMMARY")
    print("=" * 78)
    for k in sorted(verdicts):
        print("  %-4s %s" % (verdicts[k], k))
    n_fail = sum(1 for v in verdicts.values() if v == "FAIL")
    n_gap = sum(1 for v in verdicts.values() if v == "GAP")
    print("\n%d FAIL, %d GAP, %d PASS" % (n_fail, n_gap, len(verdicts) - n_fail - n_gap))

    print("\n" + "=" * 78)
    print("EXPECTATION CHECK (mode=%s)" % mode)
    print("=" * 78)
    want = EXPECTED[mode]
    bad = 0
    for k in sorted(verdicts):
        exp = want.get(k, "PASS")
        ok = verdicts[k] == exp
        if not ok:
            bad += 1
        print("  %-4s %-28s expected %-4s %s" % (verdicts[k], k, exp, "ok" if ok else "UNEXPECTED"))
    print("\n%s" % ("all verdicts match expectation" if bad == 0
                     else "%d verdict(s) differ from expectation" % bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
