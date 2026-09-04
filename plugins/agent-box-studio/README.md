# agent-box-studio

The fresh **Agent-Box Studio** service skeleton (API v2): a FastAPI HTTP/WS
shell over the Agent-Box Extension Environment.

This round ships only the minimal surface plus one fully fake/offline Turn
transaction vertical:

- `GET /api/v1/health` (anonymous, liveness only — explicit decision)
- `GET /api/v1/capabilities` (capability truth: UNAVAILABLE / NOT_IMPLEMENTED
  for everything not actually implemented this round)
- `POST/GET /api/v1/sessions`, `GET /api/v1/sessions/{id}`
- `GET /api/v1/sessions/{id}/transcript`
- `POST /api/v1/sessions/{id}/turns`, `GET .../turns/{turn_id}`
- `WS /api/v1/sessions/{id}/events?after={seq}` (short-lived single-use
  ticket auth, durable-ledger replay, typed resync on bad cursors)
- `GET /api/v1/sessions/{id}/recovery`

Auth: REST bearer token (constant-time compare), WS via single-use tickets;
loopback still requires the token; CORS is denied unless explicitly
configured.

No real Harness, no vendor session knowledge, no permission/cancel/compact,
and no frontend rebinding: those are reported honestly as NOT_IMPLEMENTED.
