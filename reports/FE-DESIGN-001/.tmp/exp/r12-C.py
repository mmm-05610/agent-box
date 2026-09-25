# MODEL ONLY: a static check of the artifact's own tables, not a product test.
import io, re, sys

# Members declared on the artifact's interfaces (ViewHost / SubscriberScope /
# NamespaceHandle / Subscription, plus the namespace factory of R11.6 item 1).
DECLARED_MEMBERS = {"open_scope", "directory_list", "directory_lookup", "cursor_resolve",
                    "subscribe", "invoke", "announce", "retire", "teardown", "pump",
                    "register", "close", "open"}
# Names the artifact itself declares as types, variants or errors in R11.2 / R11.4 / R11.3.
DECLARED_NAMES = {"RenderRow", "CapMap", "Result", "SubmitResult", "ReadResult", "Envelope",
                  "ExplicitAbsent", "ScopeDenied", "OutcomeUnknown", "NamespaceGone",
                  "LocalIdBurned", "CapabilityAbsent"}
# `execute(any)` is the disqualifier token the artifact's own delete columns name, not a call.
NOT_A_CALL = {"execute"}
ALLOWED = DECLARED_MEMBERS | DECLARED_NAMES | NOT_A_CALL

SPAN = re.compile(r"`([^`]+)`")
CALL = re.compile(r"(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\s*\(")

path = sys.argv[1]
lines = io.open(path, encoding="utf-8").read().split("\n")

# A scenario step table is a run of "| "-rows introduced by the "| Step | Actor" header.
tables, cur, rows_of = 0, None, []
for l in lines:
    if l.startswith("| Step | Actor"):
        tables += 1
        cur = []
        rows_of.append(cur)
    elif cur is not None:
        if l.startswith("| "):
            cur.append(l)
        elif not l.startswith("|---"):
            cur = None

undeclared = {}
for cur in rows_of:
    for l in cur:
        for span in SPAN.findall(l):
            for name in CALL.findall(span):
                if name not in ALLOWED:
                    undeclared.setdefault(name, []).append(span.strip()[:70])

print("artifact:", path)
print("scenario step tables found:", tables)
print("rows scanned:", sum(len(c) for c in rows_of))
print("undeclared call tokens:", undeclared or "none")
assert tables == 12, tables
assert not undeclared, undeclared
print("FE-CE-026: every call inside the twelve tables' code spans resolves to a name the artifact declares")
