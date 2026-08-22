# Execution Identity v0.1

Invariant：Execution identity 跟随一个稳定、provider-authoritative native execution/session instance；不跟随 client process、turn、poll、step 或 checkpoint。

| Situation | Rule |
| --- | --- |
| Codex client/turn exits，同一 thread 可 resume | same Execution |
| LangGraph client exits，同一 SQLite-backed `thread_id` 从 checkpoint resume | same Execution |
| same native instance advances checkpoint/retries node | same Execution；Core unaware |
| native instance abandoned，然后新 thread/instance | new Execution, same Work |
| same workflow definition with new `thread_id` | new Execution, same Work |
| checkpoint fork to new LangGraph thread | new Execution when host federates it; otherwise provider-native only |

若 provider 无法给出连续 native identity，Core 不猜测：projection 为 unknown，host 可 abandon/restart 为新 Execution。
