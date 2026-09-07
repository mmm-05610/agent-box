# Studio API contract snapshot

Generated from the current `create_app(...).openapi()` object on 2026-09-06
with `PYTHONDONTWRITEBYTECODE=1`, an isolated `AGENT_BOX_HOME`, and a synthetic
validation token. This is a route inventory plus the canonical digest of the
full OpenAPI object; payload examples were validated separately against the
listening service.

- OpenAPI: `3.1.0`
- canonical JSON SHA-256: `ab14ce4490e37fb66cca1450d521b51a19a5c5bcb4cb8368ffaaf2dc49c9b725`
- application routes: `40` (including documentation routes)

| Method | Path |
|---|---|
| GET | `/api/v1/capabilities` |
| GET, POST | `/api/v1/harness-provider-configs` |
| DELETE, GET, PATCH | `/api/v1/harness-provider-configs/{config_id}` |
| POST | `/api/v1/harness-provider-configs/{config_id}/disable` |
| POST | `/api/v1/harness-provider-configs/{config_id}/probe` |
| GET, POST | `/api/v1/harnesses/{harness_type}/profiles` |
| GET | `/api/v1/harnesses/{harness_type}/profiles/{profile_id}` |
| GET | `/api/v1/health` |
| GET, POST | `/api/v1/projects` |
| GET | `/api/v1/projects/{project_id}` |
| GET, POST | `/api/v1/provider-accounts` |
| GET, POST | `/api/v1/providers` |
| DELETE, GET, PUT | `/api/v1/providers/{provider_id}` |
| DELETE, PUT | `/api/v1/providers/{provider_id}/credential` |
| POST | `/api/v1/providers/{provider_id}/models/discover` |
| POST | `/api/v1/providers/{provider_id}/probe` |
| GET | `/api/v1/readiness` |
| GET, POST | `/api/v1/sessions` |
| GET | `/api/v1/sessions/{session_id}` |
| POST | `/api/v1/sessions/{session_id}/lease/break` |
| POST | `/api/v1/sessions/{session_id}/permissions/{request_id}/respond` |
| POST | `/api/v1/sessions/{session_id}/questions/{request_id}/respond` |
| GET | `/api/v1/sessions/{session_id}/recovery` |
| POST | `/api/v1/sessions/{session_id}/recovery/{op_id}` |
| GET | `/api/v1/sessions/{session_id}/transcript` |
| POST | `/api/v1/sessions/{session_id}/turns` |
| GET | `/api/v1/sessions/{session_id}/turns/{turn_id}` |
| POST | `/api/v1/sessions/{session_id}/turns/{turn_id}/cancel` |
| POST | `/api/v1/ws-ticket` |

The `/docs`, `/openapi.json`, and `/redoc` framework routes are intentionally
excluded from the table above but included in the application-route count.
