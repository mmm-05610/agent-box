# Execution Projection v0.1

Mandatory fields：`phase`（`active`/`terminal`/`unknown`）、terminal `outcome`（succeeded/failed/cancelled/abandoned）、`resumable_now`、`freshness`（observed/stale/unreachable）。`observed_at` 可作 timestamp，不替代 freshness。

| Provider condition | phase | outcome | resumable_now | freshness |
| --- | --- | --- | --- | --- |
| Codex running turn | active | — | true when session remains resumable | observed |
| Codex completed/failed turn with thread | terminal | succeeded/failed | true if native session accepts resume | observed |
| subprocess active / SIGTERM | active / terminal | — / cancelled | false | observed |
| subprocess PID unavailable | unknown | — | false | unreachable |
| LangGraph running / interrupt checkpoint | active | — | true if checkpoint exists | observed |
| LangGraph resumed / completed | active / terminal | — / succeeded | true / false | observed |
| any provider query failure | unknown | — | unknown where necessary | unreachable |

`waiting` 不加入公共 phase：human waiting、queue、checkpoint pause、rate limit 和 retry 是 provider detail。Provider `supports_resume` 是 capability；`resumable_now` 是该 execution 的 projection，二者不可混同。
