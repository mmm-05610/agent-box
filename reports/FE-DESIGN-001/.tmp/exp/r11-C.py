# MODEL ONLY: proves the walk is total and recursive; no host depth constant enters it.
DECL = {"branch": "scalar", "diff_body": "opaque",
        "files": [{"path": "scalar", "additions": "scalar", "deletions": "scalar",
                   "hunks": [{"lines": "scalar"}]}]}

def walk(decl, actual, path=""):
    rows = []
    if not isinstance(actual, dict):
        return [(path or "value", "(unreadable: declared record, got %s)" % type(actual).__name__)]
    for name, kind in decl.items():
        p = "%s.%s" % (path, name) if path else name
        if name not in actual:
            rows.append((p, "(absent at runtime)"))
            continue
        v = actual[name]
        if kind == "scalar":
            rows.append((p, str(v)) if isinstance(v, (str, int, float, bool))
                        else (p, "(unreadable: declared scalar, got %s)" % type(v).__name__))
        elif kind == "opaque":
            rows.append((p, "(opaque: no view installed)"))
        elif isinstance(kind, dict):
            rows += walk(kind, v, p)
        elif isinstance(kind, list):
            if not isinstance(v, list):
                rows.append((p, "(unreadable: declared list, got %s)" % type(v).__name__))
                continue
            if not v:
                rows.append((p, "(empty list)"))
                continue
            for i, item in enumerate(v):
                rows += walk(kind[0], item, "%s[%d]" % (p, i))
    return rows

cases = {
 "conforming": {"branch": "main", "diff_body": "<b>",
                "files": [{"path": "a.rs", "additions": 42, "deletions": 7, "hunks": [{"lines": 3}]}]},
 "partial":    {"branch": "main", "diff_body": "<b>",
                "files": [{"path": "a.rs", "additions": 42, "hunks": [{"lines": 3}]}]},
 "null_list":  {"branch": "main", "diff_body": "<b>", "files": None},
 "nested":     {"branch": "main", "diff_body": "<b>",
                "files": [{"path": "a.rs", "additions": 1, "deletions": 0,
                           "hunks": [{"lines": 9}, {"lines": 4}]}]},
}
for name, v in cases.items():
    rows = walk(DECL, v)
    assert rows, name
    print(name, "->", rows)
assert any(p.endswith("deletions") and val == "(absent at runtime)"
           for p, val in walk(DECL, cases["partial"]))
assert any("unreadable: declared list" in val for p, val in walk(DECL, cases["null_list"]))
assert any(p == "files[0].hunks[1].lines" for p, val in walk(DECL, cases["nested"]))
print("total over declared fields, recursive to depth, no depth constant, no exception raised")
