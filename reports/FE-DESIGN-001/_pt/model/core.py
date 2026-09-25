"""Minimal executable semantic model of the FE-DESIGN-001 candidate (A), R013.

MODEL ONLY. This is not a product implementation and proves nothing about any real
service, protocol or Agent. It exists so that each scenario can be *executed* against
one shared set of rules, instead of being read as prose.

Discipline that matters more than the code:
  * the model implements ONLY what `candidates/best.md` states;
  * where the artifact is silent it does not invent behaviour, it raises
    `Unspecified` and the runner reports it as a finding;
  * no scenario gets special-cased behaviour. All twelve scenarios drive this one
    core through the same op vocabulary (see scenarios.py).
"""

from __future__ import annotations

# --------------------------------------------------------------------------- sentinels


class Unspecified(Exception):
    """The artifact states nothing about this case. Never invent an answer."""

    def __init__(self, what: str):
        super().__init__(what)
        self.what = what


class ExplicitAbsent:
    """The structural 'not there' value (§R11.2/§R11.3)."""

    def __init__(self, what: str):
        self.what = what

    def __repr__(self) -> str:  # pragma: no cover - display only
        return "ExplicitAbsent(%s)" % self.what


class LocalIdBurned(Exception):
    """announce() reusing a retired local_id in the same namespace (§R11.3)."""


class NamespaceGone(Exception):
    """pump() after teardown (§R11.6 item 7)."""


class ScopeDenied(Exception):
    """resource.ns_id != scope.ns_id (§R11.1)."""


# ----------------------------------------------------------------------------- facts

class Envelope:
    __slots__ = ("seq", "payload_schema_id", "payload")

    def __init__(self, seq, payload_schema_id, payload):
        self.seq = seq
        self.payload_schema_id = payload_schema_id
        self.payload = payload

    def __repr__(self):  # pragma: no cover - display only
        return "seq=%s:%s" % (self.seq, self.payload)


class Resource:
    """One incarnation: announced, not yet retired. The log lives here."""

    def __init__(self, local_id, kind, payload_schema_id, capabilities):
        self.local_id = local_id
        self.kind = kind
        self.payload_schema_id = payload_schema_id
        self.capabilities = dict(capabilities)
        self.log: list[Envelope] = []          # retained until retire()/teardown()
        self.actions: dict[str, tuple] = {}    # action_type -> (params, result, handler)
        self.retired = False


class Subscription:
    """§R11.2: onNext + onEnd + close. `onEnd(reason)` is the declared termination
    signal (the R013 revision, FE-CE-037); a live subscriber MUST learn that its
    resource ended, so the model no longer reports silence here."""

    def __init__(self, scope, resource, from_cursor):
        self.scope = scope
        self.resource = resource
        self.from_cursor = from_cursor
        self.live = True
        self.received: list[Envelope] = []
        self.ended = None                 # set by onEnd(reason)
        self._end_handlers = []

    def onEnd(self, h):
        # the default view registers this on subscribe (extension duty 8)
        self._end_handlers.append(h)
        if self.ended is not None and not self._end_handlers[:-1]:
            h(self.ended)

    def _fire_end(self, reason):
        if self.ended is not None:
            return
        self.ended = reason
        for h in self._end_handlers:
            h(reason)

    def close(self):
        # §R11.3: releases the routing reference, never a log entry.
        self.live = False

    def __repr__(self):  # pragma: no cover - display only
        return "Sub(%s,%s,c=%s,got=%s)" % (
            self.resource.local_id, self.scope.ns_id, self.from_cursor, self.received)


# ------------------------------------------------------------------------------- host

class Host:
    def __init__(self):
        self.namespaces: dict[str, dict] = {}
        self._n = 0

    # --- adapter side -------------------------------------------------------
    def open_namespace(self, service: str) -> str:
        self._n += 1
        ns_id = "ns_%d" % self._n            # fresh id space per namespace (§R11.3)
        self.namespaces[ns_id] = {"service": service, "resources": {}, "burned": set()}
        return ns_id

    def announce(self, ns_id, local_id, kind, payload_schema_id, capabilities):
        if ns_id not in self.namespaces:
            raise NamespaceGone("namespace %s was torn down" % ns_id)
        ns = self.namespaces[ns_id]
        if local_id in ns["burned"]:
            raise LocalIdBurned(local_id)    # §R11.3 one incarnation per local_id
        ns["resources"][local_id] = Resource(local_id, kind, payload_schema_id, capabilities)

    def register_action(self, ns_id, local_id, action_type, result_fields, handler):
        if ns_id not in self.namespaces:
            raise NamespaceGone("namespace %s was torn down" % ns_id)
        ns = self.namespaces[ns_id]
        if local_id not in ns["resources"]:
            raise Unspecified("register_action on a local_id that was never announced")
        ns["resources"][local_id].actions[action_type] = (result_fields, handler)

    def pump(self, ns_id, local_id, payload_schema_id, payload):
        if ns_id not in self.namespaces:
            raise NamespaceGone("namespace %s was torn down" % ns_id)
        ns = self.namespaces[ns_id]
        if local_id not in ns["resources"]:
            raise NamespaceGone("pump on a local_id that is not announced")
        res = ns["resources"][local_id]
        env = Envelope(len(res.log) + 1, payload_schema_id, payload)   # arrival index
        res.log.append(env)
        for sub in list(getattr(self, "_subs", [])):                   # live routing
            if sub.resource is res and sub.live and sub.from_cursor <= env.seq:
                sub.received.append(env)
        return env.seq

    def retire(self, ns_id, local_id, reason):
        if ns_id not in self.namespaces:
            raise NamespaceGone("namespace %s was torn down" % ns_id)
        ns = self.namespaces[ns_id]
        res = ns["resources"].pop(local_id, None)
        if res is None:
            return
        res.retired = True
        res.log = []                        # §R11.3 the sole per-resource disposal point
        ns["burned"].add(local_id)          # §R11.3 burns the id for the ns lifetime
        for sub in list(getattr(self, "_subs", [])):
            if sub.resource is res:
                sub._fire_end(reason)       # §R11.2 onEnd(reason): the live subscriber learns

    def teardown(self, ns_id, reason):
        ns = self.namespaces.pop(ns_id, None)
        if ns is None:
            return
        for res in ns["resources"].values():
            res.retired = True
            res.log = []
        for sub in list(getattr(self, "_subs", [])):
            if sub.scope.ns_id == ns_id:
                sub._fire_end(reason)       # onEnd, then force-closed (§R11.3)
                sub.live = False

    # --- view side ---------------------------------------------------------
    def open_scope(self, ns_id):
        if ns_id not in self.namespaces:
            return ExplicitAbsent("namespace %s is not open in this host" % ns_id)
        return SubscriberScope(self, ns_id)


class SubscriberScope:
    def __init__(self, host: Host, ns_id: str):
        self.host = host
        self.ns_id = ns_id

    # §R11.1 the only permission rule
    def _check(self, res_ns_id):
        if res_ns_id != self.ns_id:
            raise ScopeDenied(res_ns_id)

    def directory_list(self, kind=None):
        rs = self.host.namespaces.get(self.ns_id, {}).get("resources", {})
        return [r for r in rs.values() if kind is None or r.kind == kind]

    def directory_lookup(self, local_id):
        rs = self.host.namespaces.get(self.ns_id, {}).get("resources", {})
        return rs.get(local_id) or ExplicitAbsent("no resource %s" % local_id)

    def cursor_resolve(self, local_id):
        rs = self.host.namespaces.get(self.ns_id, {}).get("resources", {})
        res = rs.get(local_id)
        if res is None:
            return ExplicitAbsent("not announced")          # §R11.3
        return len(res.log) + 1                             # next Seq it will assign

    def subscribe(self, local_id, from_cursor):
        rs = self.host.namespaces.get(self.ns_id, {}).get("resources", {})
        res = rs.get(local_id)
        if res is None:
            return ExplicitAbsent("not announced")          # §R11.3
        sub = Subscription(self, res, from_cursor)
        sub.received = [e for e in res.log if e.seq >= from_cursor]   # §R11.3 replay
        self.host._subs = getattr(self.host, "_subs", [])
        self.host._subs.append(sub)
        return sub

    def invoke(self, local_id, action_type, params):
        rs = self.host.namespaces.get(self.ns_id, {}).get("resources", {})
        res = rs.get(local_id)
        if res is None:
            # §R11.1/§R11.3 revised: invoke against a retired or never-announced
            # resource returns the structural ExplicitAbsent (FE-CE-037)
            return ("ExplicitAbsent", "retired or never announced")
        act = res.actions.get(action_type)
        if act is None:
            return ("CapabilityAbsent", action_type)         # §R11.6 structural absence
        result_fields, handler = act
        return ("Result", handler(params))


# ------------------------------------------------- the default view's rendering rules
# §R11.5: exactly one row per declared field of the declared schema; recursive;
# the four InvokeOutcome variants are distinguishable; an unconfirmed outcome is
# never rendered as a current value or a current state.

def render_declared(decl, actual, path=""):
    rows = []
    if not isinstance(actual, dict):
        return [(path or "value", "unreadable: declared record, got %s" % type(actual).__name__)]
    for name, kind in decl.items():
        p = "%s.%s" % (path, name) if path else name
        if name not in actual:
            rows.append((p, "absent at runtime"))
            continue
        v = actual[name]
        if kind == "scalar":
            rows.append((p, str(v)) if isinstance(v, (str, int, float, bool))
                        else (p, "unreadable: declared scalar, got %s" % type(v).__name__))
        elif kind == "opaque":
            rows.append((p, "opaque: no view installed"))
        elif isinstance(kind, dict):
            rows += render_declared(kind, v, p)
        elif isinstance(kind, list):
            if not isinstance(v, list):
                rows.append((p, "unreadable: declared list, got %s" % type(v).__name__))
                continue
            if not v:
                rows.append((p, "empty list"))
                continue
            for i, item in enumerate(v):
                rows += render_declared(kind[0], item, "%s[%d]" % (p, i))
    return rows


def render_capmap(capabilities):
    """§R11.6 the CapMap is informational with three declared values. §R11.5 now
    states a row for each of them, including `unknown` (FE-CE-032)."""
    out = []
    for name, value in sorted(capabilities.items()):
        if value == "supported":
            out.append((name, "supported"))
        elif value == "not_supported":
            out.append((name, "not supported"))
        elif value == "unknown":
            out.append((name, "support for %s is unknown — the service has not declared it"
                        % name))
        else:
            raise Unspecified("mystery CapMap value %r" % value)
    return out


def render_outcome(outcome, prior_rows=None, ts="t1"):
    """The four variants, §R11.5."""
    kind = outcome[0]
    if kind == "Result":
        return ("current@%s" % ts, outcome[1])
    if kind == "CapabilityAbsent":
        return ("no %s action registered for this kind; value not obtainable" % outcome[1],
                prior_rows or [])
    if kind == "ScopeDenied":
        return ("this resource is outside this view's namespace scope", prior_rows or [])
    if kind == "OutcomeUnknown":
        if prior_rows:
            return ("last-confirmed@t0 NOT current", prior_rows)
        return ("value not confirmed; read did not return", [])
    if outcome[0] == "ExplicitAbsent":
        return ("this resource no longer exists (retired or never announced)",
                prior_rows or [])
    raise Unspecified("unknown InvokeOutcome variant %r" % (kind,))
