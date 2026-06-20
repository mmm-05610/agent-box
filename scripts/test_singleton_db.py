"""Thread-safety smoke test for SessionDB singleton.

Run:  .venv/bin/python scripts/test_singleton_db.py
"""
from __future__ import annotations

import threading
import time

from gui.state import SessionDB, fetch_sessions, record_launch


def main() -> int:
    db = SessionDB.instance()
    assert SessionDB.instance() is db, "singleton broken"

    results = {"writes": 0, "reads": 0, "errors": []}
    lock = threading.Lock()

    def writer(profile_name, n):
        try:
            for i in range(n):
                record_launch(profile_name, "cc", "/tmp/test", "新会话", 99999 + i)
                with lock:
                    results["writes"] += 1
        except Exception as e:
            results["errors"].append(f"writer: {e}")

    def reader():
        try:
            for _ in range(20):
                fetch_sessions(limit=10)
                with lock:
                    results["reads"] += 1
                time.sleep(0.001)
        except Exception as e:
            results["errors"].append(f"reader: {e}")

    threads = [threading.Thread(target=writer, args=(f"test-{i}", 5))
               for i in range(4)]
    threads.append(threading.Thread(target=reader))
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    print(f"Writes: {results['writes']}")
    print(f"Reads:  {results['reads']}")
    print(f"Errors: {results['errors']}")
    assert results["writes"] == 20
    assert results["reads"] == 20
    assert not results["errors"]
    print("SQLite thread safety: PASS")

    # Cleanup
    all_rows = fetch_sessions(limit=500)
    test_rows = [r for r in all_rows if r["profile"].startswith("test-")]
    if test_rows:
        ids = ",".join(str(r["id"]) for r in test_rows)
        with db._lock:
            db._conn.execute(f"DELETE FROM sessions WHERE id IN ({ids})")
            db._conn.commit()
    print("Cleanup done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())