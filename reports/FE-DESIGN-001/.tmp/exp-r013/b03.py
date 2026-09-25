# MODEL ONLY: proves the walk is total and recursive against SchemaDecl.
DECL = {  # the SchemaDecl grammar: scalar | opaque | record | list
  "branch": {"kind": "scalar"}, "diff_body": {"kind": "opaque"},
  "files": {"kind": "list", "item": {"kind": "record", "fields": {
      "path": {"kind": "scalar"}, "additions": {"kind": "scalar"},
      "deletions": {"kind": "scalar"},
      "hunks": {"kind": "list", "item": {"kind": "record", "fields": {
          "lines": {"kind": "scalar"}}}}}}}}

def walk(decl, actual, path=""):
    rows = []
    if decl["kind"] == "scalar":
        v = actual if isinstance(actual, (str, int, float, bool)) else None
        rows.append((path or "value", str(v) if v is not None
                     else "(unreadable: declared scalar)"))
    elif decl["kind"] == "opaque":
        rows.append((path or "value", "(opaque: no view installed)"))
    elif decl["kind"] == "record":
        for name, item in decl["fields"].items():
            p = "%s.%s" % (path, name) if path else name
            if not isinstance(actual, dict) or name not in actual:
                rows.append((p, "(absent at runtime)"))
            else:
                rows += walk(item, actual[name], p)
    elif decl["kind"] == "list":
        if not isinstance(actual, list):
            rows.append((path or "value", "(unreadable: declared list)"))
        else:
            for i, item in enumerate(actual):
                rows += walk(decl["item"], item, "%s[%d]" % (path, i))
    return rows

nested = {"branch": "main", "diff_body": None,
          "files": [{"path": "a.rs", "additions": 1, "deletions": 0,
                     "hunks": [{"lines": 9}, {"lines": 4}]}]}
rows = walk(DECL, nested)
assert any(p == "files[0].hunks[1].lines" for p, v in rows)
assert any(p.endswith("deletions") and v == "(absent at runtime)" for p, v in walk(DECL, {
    "branch": "main", "files": [{"path": "a.rs", "additions": 1, "hunks": [{"lines": 3}]}]}))
print("recursive walk over SchemaDecl, total, no depth constant, no exception")
