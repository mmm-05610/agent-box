# agent-box-session

The concrete **Official Session Store** plugin for Agent-Box (API v2).

It is the durable authority for Official Sessions:

- `sessions` rows with the fixed `session ↔ work_id` mapping (one Session is
  exactly one Work);
- `turns` with frozen per-turn `BindingSnapshot`s and 1..N execution links;
- the append-only session event ledger with per-session monotonic `seq`;
- the session watermark (advanced only inside the commit transaction);
- idempotency receipts, the single-writer lease, recovery operations and
  resumable creation sagas;
- capability/diagnostic state (bounded and redacted).

The store lives in its own SQLite database under the plugin data dir and is
deliberately independent of the Work Core `agent-box.db`; cross-authority
creation uses durable, idempotent, resumable sagas — never distributed-ACID
claims. Malformed persisted state fails closed with typed errors.

Contribution: `agent-box.session.store@1` / `official-session-store`
(generic, namespaced, versioned — the Catalog gains no business fields).
