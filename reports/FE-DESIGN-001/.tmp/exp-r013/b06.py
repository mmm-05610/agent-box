# MODEL ONLY: a static check of the artifact's own tables, not a product test.
import io, re, sys
DECLARED = {"open_scope", "directory_list", "directory_lookup", "cursor_resolve",
            "subscribe", "invoke", "announce", "retire", "teardown", "pump",
            "register", "close", "claim_schema", "on_claim_changed", "open"}
NOT_A_CALL = {"execute"}
SPAN = re.compile(r"`([^`]+)`")
CALL = re.compile(r"(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\s*\(")
path = sys.argv[1]
lines = io.open(path, encoding="utf-8").read().split("\n")
tables, cur = 0, None
for l in lines:
    if l.startswith("| Step |"):
        tables += 1
for l in lines:
    if l.startswith("| "):
        for span in SPAN.findall(l):
            for name in CALL.findall(span):
                assert name in DECLARED or name in NOT_A_CALL, (name, span)
print("tables:", tables, "— every call token resolves to a declared member")
assert tables == 12
