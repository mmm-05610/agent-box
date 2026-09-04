"""FastAPI application factory for the fresh Studio service."""
from __future__ import annotations

import sys
from typing import Any, NoReturn, Optional

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from agent_box.extensions.bootstrap import ExtensionEnvironment, build_extension_environment
from agent_box.protocols.session import (
    SESSION_STORE_KIND,
    ResyncRequired,
    SessionError,
    SessionNotFound,
    SessionStore,
    TurnNotFound,
)
from agent_box.protocols.session.failures import (
    IdempotencyConflict,
    InvalidCursor,
    InvalidTurnTransition,
    MalformedSessionState,
    RecoveryRequired,
    TerminalAlreadyRecorded,
)
from agent_box.protocols.session.store import session_store_contribution
from agent_box.work_core.repository import CoreRepository

from ..auth import TicketIssuer, TokenGuard, generate_token
from ..config import StudioConfig
from ..schemas import (
    BreakLeaseRequest,
    CreateSessionRequest,
    PermissionResponseRequest,
    QuestionResponseRequest,
    TurnCreateRequest,
)
from ..service import (
    SERVICE_NAME,
    BindingVerificationError,
    CrossHarnessContinuationUnsupported,
    LaunchSelectionError,
    ProviderSelectionError,
    StudioService,
)
from ..testing import FAKE_PROVIDER_ID
from .errors import (
    http_exception_handler,
    log_unhandled_exception,
    request_correlation_id,
    unhandled_exception_handler,
    validation_exception_handler,
)
from .events import SessionEventStream, stream_session_events

WORKSPACE_PROVIDER_ID = "local-live-workspace"
SESSION_INPUTS_PROVIDER_ID = "agent-box-session-inputs"


def _error_detail(code: str, message: str, **extra: Any) -> dict[str, Any]:
    """Structured HTTPException detail; the exception handler flattens it
    into the stable error envelope and stamps the correlation id."""
    error: dict[str, Any] = {"code": code, "message": message}
    for key, value in extra.items():
        if value is not None:
            error[key] = value
    return {"error": error}


def _error_response(status: int, code: str, message: str, **extra: Any) -> NoReturn:
    raise HTTPException(status_code=status, detail=_error_detail(code, message, **extra))


def _map_session_error(exc: Exception) -> Optional[tuple[int, str, str, dict[str, Any]]]:
    """Typed error vocabulary → stable HTTP codes (no leaking internals).

    Returns ``None`` for exception types outside the typed vocabulary so
    callers fall back to the content-free INTERNAL_ERROR envelope instead
    of ever echoing ``str(exc)``.
    """
    from agent_box.protocols.session.failures import (
        SessionCapabilityUnavailable,
        SessionWriterConflict,
    )

    if isinstance(exc, SessionNotFound):
        return 404, "SESSION_NOT_FOUND", str(exc), {}
    if isinstance(exc, TurnNotFound):
        return 404, "TURN_NOT_FOUND", str(exc), {}
    if isinstance(exc, MalformedSessionState):
        return 500, "MALFORMED_SESSION_STATE", str(exc), {}
    if isinstance(exc, RecoveryRequired):
        return 409, "RECOVERY_REQUIRED", str(exc), {"recoverable": True}
    if isinstance(exc, (SessionWriterConflict, TerminalAlreadyRecorded)):
        return (
            409,
            "SESSION_WRITER_CONFLICT" if isinstance(exc, SessionWriterConflict) else "TERMINAL_ALREADY_RECORDED",
            str(exc),
            {},
        )
    if isinstance(exc, IdempotencyConflict):
        return 409, "IDEMPOTENCY_CONFLICT", str(exc), {}
    if isinstance(exc, InvalidTurnTransition):
        return 409, "INVALID_TURN_TRANSITION", str(exc), {}
    if isinstance(exc, InvalidCursor):
        return 400, "INVALID_CURSOR", str(exc), {}
    if isinstance(exc, ResyncRequired):
        return 409, "RESYNC_REQUIRED", str(exc), {"current_watermark": exc.current_watermark}
    if isinstance(exc, ProviderSelectionError):
        return 409, "PROVIDER_SELECTION_FAILED", str(exc), {}
    if isinstance(exc, LaunchSelectionError):
        return 409, "LAUNCH_SELECTION_FAILED", str(exc), {}
    if isinstance(exc, BindingVerificationError):
        return 409, "BINDING_VERIFICATION_FAILED", str(exc), {}
    if isinstance(exc, CrossHarnessContinuationUnsupported):
        return 409, "CROSS_HARNESS_CONTINUATION_UNSUPPORTED", str(exc), {}
    if isinstance(exc, SessionCapabilityUnavailable):
        return 409, "SESSION_CAPABILITY_UNAVAILABLE", str(exc), {}
    if type(exc).__name__ in ("ProjectNotRegistered", "ProjectIdentityConflict", "ProjectPathRejected"):
        return (
            404 if type(exc).__name__ == "ProjectNotRegistered" else 409,
            type(exc).__name__.upper(),
            str(exc),
            {},
        )
    if type(exc).__name__ == "WorkspaceLocalError":
        return 400, "WORKSPACE_LOCAL_ERROR", str(exc), {}
    if isinstance(exc, SessionError):
        return 400, "SESSION_ERROR", str(exc), {}
    return None


def _handle_error(request: Request, exc: Exception) -> NoReturn:
    """Map a caught exception to the stable error envelope.

    Typed failures map to their stable codes; anything unexpected is
    logged (type name + correlation id only) and re-raised as a
    content-free 500.
    """
    if isinstance(exc, HTTPException):
        raise exc
    mapped = _map_session_error(exc)
    if mapped is None:
        log_unhandled_exception(request, exc)
        _error_response(500, "INTERNAL_ERROR", "internal error")
    status, code, message, extra = mapped
    _error_response(status, code, message, **extra)


def _workspace_provider(environment: ExtensionEnvironment):
    for provider in environment.registry.resource_providers():
        if provider.descriptor().id == WORKSPACE_PROVIDER_ID:
            return provider
    return None


def create_app(
    config: StudioConfig | None = None,
    *,
    environment: ExtensionEnvironment | None = None,
    store: SessionStore | None = None,
    workspace: Any | None = None,
    service: StudioService | None = None,
    token: str | None = None,
) -> FastAPI:
    """Build the Studio FastAPI app.

    ``environment``/``store``/``workspace``/``service`` are injection points
    for tests and embedders.  When omitted the canonical bootstrap loads the
    installed plugins and discovers the Session Store and Live Workspace
    through the Catalog/Registry only.
    """
    config = config or StudioConfig.from_env()
    if environment is None:
        if config.agent_box_home is not None:
            import os

            from agent_box.work_core.runtime import AGENT_BOX_HOME_ENV

            os.environ[AGENT_BOX_HOME_ENV] = str(config.agent_box_home)
        environment = build_extension_environment()
    resolved_token = token or config.token or generate_token()
    if token is None and config.token is None:
        # An ephemeral token was generated: surface it exactly once, on
        # stderr, and never again — not in logs or error responses.
        print(f"agent-box-studio auth token: {resolved_token}", file=sys.stderr)

    guard = TokenGuard(resolved_token)
    tickets = TicketIssuer()

    if store is None:
        store = environment.catalog.query(
            SESSION_STORE_KIND, "official-session-store"
        )
    if workspace is None:
        workspace = _workspace_provider(environment)

    app = FastAPI(title="Agent-Box Studio", lifespan=_lifespan)
    app.state.config = config
    app.state.environment = environment
    app.state.token_guard = guard
    app.state.tickets = tickets
    app.state.store = store
    app.state.workspace = workspace
    app.state.stream = SessionEventStream(store)
    if service is None:
        service = StudioService(
            store,
            workspace,
            environment.registry,
            CoreRepository(),
            on_event=app.state.stream.notify,
            worker_mode=config.worker_mode,
            poll_interval=config.poll_interval,
            turn_timeout_seconds=config.turn_timeout_seconds,
        )
    app.state.service = service

    if config.cors_origins:
        # Default is no CORS middleware at all: browsers get the default
        # same-origin denial.  Explicit configuration opens specific origins.
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(config.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )

    # -- correlation ids ------------------------------------------------------

    @app.middleware("http")
    async def correlation_id_middleware(request: Request, call_next):
        """Stamp every request with a correlation id and mirror it in the
        ``X-Correlation-Id`` response header (also embedded in every error
        envelope)."""
        correlation_id = request_correlation_id(request)
        response = await call_next(request)
        response.headers.setdefault("X-Correlation-Id", correlation_id)
        return response

    # -- stable error envelopes -----------------------------------------------

    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # -- auth ----------------------------------------------------------------

    def require_token(authorization: Optional[str] = Header(default=None)) -> None:
        if not guard.check_bearer(authorization):
            _error_response(401, "UNAUTHORIZED", "missing or invalid bearer token")

    # -- health / capabilities (explicitly decided surfaces) ------------------

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        # Anonymous by explicit decision: liveness probe only, returns no
        # configuration, version, token or path facts.
        return {"status": "ok", "service": SERVICE_NAME}

    @app.get("/api/v1/capabilities", dependencies=[Depends(require_token)])
    def capabilities() -> dict[str, Any]:
        result = {"service": SERVICE_NAME, "api_version": 1}
        result.update(service.capability_truth())
        return result

    @app.post("/api/v1/ws-ticket", dependencies=[Depends(require_token)])
    def ws_ticket() -> dict[str, Any]:
        ticket = tickets.issue("studio-client")
        return {"ticket": ticket.value, "expires_in": 30, "single_use": True}

    # -- sessions ---------------------------------------------------------------

    @app.post("/api/v1/sessions", status_code=201, dependencies=[Depends(require_token)])
    def create_session(request: Request, body: CreateSessionRequest) -> dict[str, Any]:
        try:
            created = service.create_session(
                idempotency_key=body.idempotency_key,
                title=body.title,
                project_path=body.project_path,
            )
        except Exception as exc:
            _handle_error(request, exc)
        session = created["session"]
        return {
            "session": {
                "session_id": session.session_id,
                "work_id": session.work_id,
                "title": session.title,
                "status": session.status,
                "workspace_mode": session.workspace_mode,
                "project_id": created["project_id"],
                "watermark": session.watermark,
                "created_at": session.created_at.isoformat(),
            }
        }

    @app.get("/api/v1/sessions", dependencies=[Depends(require_token)])
    def list_sessions() -> dict[str, Any]:
        sessions = service.list_sessions()
        return {
            "sessions": [
                {
                    "session_id": s.session_id,
                    "work_id": s.work_id,
                    "title": s.title,
                    "status": s.status,
                    "workspace_mode": s.workspace_mode,
                    "watermark": s.watermark,
                }
                for s in sessions
            ]
        }

    def _session_or_404(request: Request, session_id: str):
        try:
            return service.get_session(session_id)
        except Exception as exc:
            _handle_error(request, exc)

    @app.get("/api/v1/sessions/{session_id}", dependencies=[Depends(require_token)])
    def get_session(session_id: str, request: Request) -> dict[str, Any]:
        session = _session_or_404(request, session_id)
        return {
            "session": {
                "session_id": session.session_id,
                "work_id": session.work_id,
                "title": session.title,
                "status": session.status,
                "workspace_mode": session.workspace_mode,
                "workspace_provider": session.workspace_ref.provider,
                "watermark": session.watermark,
                "created_at": session.created_at.isoformat(),
            }
        }

    @app.get(
        "/api/v1/sessions/{session_id}/transcript",
        dependencies=[Depends(require_token)],
    )
    def transcript(session_id: str, request: Request, after: int = 0) -> dict[str, Any]:
        _session_or_404(request, session_id)
        try:
            events = service.transcript(session_id, after_seq=after)
        except Exception as exc:
            _handle_error(request, exc)
        return {
            "session_id": session_id,
            "watermark": store.watermark(session_id),
            "events": [
                {
                    "seq": e.seq,
                    "event_id": e.event_id,
                    "event_type": e.event_type,
                    "turn_id": e.turn_id,
                    "execution_id": e.execution_id,
                    "payload": dict(e.payload),
                    "terminal": e.terminal,
                }
                for e in events
            ],
        }

    @app.post(
        "/api/v1/sessions/{session_id}/turns",
        status_code=202,
        dependencies=[Depends(require_token)],
    )
    def create_turn(
        session_id: str, request: Request, body: TurnCreateRequest
    ) -> dict[str, Any]:
        """Accept one Turn (HTTP 202).

        The Turn and its run-transaction journal are durable before this
        returns; the production dispatch chain runs on the background
        worker (or inline under the test worker mode).
        """
        _session_or_404(request, session_id)
        try:
            return service.submit_turn(
                session_id,
                idempotency_key=body.idempotency_key,
                input_text=body.input,
                execution_provider_id=body.execution_provider_id,
                harness_type=body.harness_type,
                profile_id=body.profile.profile_id if body.profile else None,
                profile_revision=body.profile.revision if body.profile else None,
                profile_digest=body.profile.digest if body.profile else None,
                model=body.model.model_id if body.model else None,
                launch_mode=body.launch_mode,
                runtime_host=body.runtime_host,
                sandbox=body.sandbox,
                terminal=body.terminal,
                continue_from_turn_id=body.continue_from_turn_id,
            )
        except Exception as exc:
            _handle_error(request, exc)

    @app.post(
        "/api/v1/sessions/{session_id}/turns/{turn_id}/cancel",
        status_code=200,
        dependencies=[Depends(require_token)],
        response_model=None,
    )
    def cancel_turn(
        session_id: str, turn_id: str, request: Request
    ) -> dict[str, Any]:
        _session_or_404(request, session_id)
        try:
            return service.cancel_turn(session_id, turn_id)
        except Exception as exc:
            _handle_error(request, exc)

    @app.post(
        "/api/v1/sessions/{session_id}/permissions/{request_id}/respond",
        status_code=200,
        dependencies=[Depends(require_token)],
        response_model=None,
    )
    def respond_permission(
        session_id: str, request_id: str, request: Request, body: PermissionResponseRequest
    ) -> dict[str, Any]:
        _session_or_404(request, session_id)
        try:
            return service.respond_permission(
                session_id, request_id, decision=body.decision
            )
        except Exception as exc:
            _handle_error(request, exc)

    @app.post(
        "/api/v1/sessions/{session_id}/questions/{request_id}/respond",
        status_code=200,
        dependencies=[Depends(require_token)],
        response_model=None,
    )
    def respond_question(
        session_id: str, request_id: str, request: Request, body: QuestionResponseRequest
    ) -> dict[str, Any]:
        _session_or_404(request, session_id)
        try:
            return service.respond_question(
                session_id, request_id, decision=body.decision
            )
        except Exception as exc:
            _handle_error(request, exc)

    @app.get(
        "/api/v1/sessions/{session_id}/turns/{turn_id}",
        dependencies=[Depends(require_token)],
    )
    def get_turn(session_id: str, turn_id: str, request: Request) -> dict[str, Any]:
        _session_or_404(request, session_id)
        try:
            payload = service.get_turn(session_id, turn_id)
        except Exception as exc:
            _handle_error(request, exc)
        turn = store.get_turn(session_id, turn_id)
        payload["created_at"] = turn.created_at.isoformat() if turn.created_at else None
        return {"turn": payload}

    # -- recovery / lease ---------------------------------------------------------

    def _session_recovery_ops(session_id: str):
        """The recovery operations that belong to this session only.

        The store's session-scoped listing can surface foreign pending
        saga entries; filter them here so no other session's operation
        ids, states or details ever leak across a session boundary.
        """
        return [
            op
            for op in store.recovery_operations(session_id=session_id)
            if op.session_id == session_id
        ]

    @app.get(
        "/api/v1/sessions/{session_id}/recovery",
        dependencies=[Depends(require_token)],
    )
    def recovery(session_id: str, request: Request) -> dict[str, Any]:
        _session_or_404(request, session_id)
        payload = service.recovery(session_id)
        payload["operations"] = [
            op for op in payload.get("operations", []) if op.get("session_id") == session_id
        ]
        return payload

    @app.post(
        "/api/v1/sessions/{session_id}/recovery/{op_id}",
        status_code=200,
        dependencies=[Depends(require_token)],
        response_model=None,
    )
    def recover(session_id: str, op_id: str, request: Request) -> dict[str, Any]:
        _session_or_404(request, session_id)
        # Cross-session denial: an op of another session is simply "not
        # found" from this session's perspective (no existence leak).
        owned = {op.op_id for op in _session_recovery_ops(session_id)}
        if op_id not in owned:
            _error_response(
                404,
                "RECOVERY_OP_NOT_FOUND",
                "recovery operation not found for this session",
            )
        try:
            result = service.recover(session_id, op_id)
        except Exception as exc:
            _handle_error(request, exc)
        return result

    @app.post(
        "/api/v1/sessions/{session_id}/lease/break",
        status_code=200,
        dependencies=[Depends(require_token)],
        response_model=None,
    )
    def break_lease(
        session_id: str, request: Request, body: BreakLeaseRequest
    ) -> dict[str, Any]:
        _session_or_404(request, session_id)
        try:
            result = service.break_lease(
                session_id,
                expected_owner_id=body.expected_owner_id,
                expected_turn_id=body.expected_turn_id,
                reason=body.reason,
                confirm=body.confirm,
            )
        except Exception as exc:
            _handle_error(request, exc)
        return result

    # -- WebSocket events ------------------------------------------------------

    @app.websocket("/api/v1/sessions/{session_id}/events")
    async def ws_events(
        websocket: WebSocket,
        session_id: str,
        ticket: str = Query(default=""),
        after: int = Query(default=0),
    ) -> None:
        subject = tickets.redeem(ticket)
        if subject is None:
            await websocket.close(code=4401)
            return
        try:
            await websocket.accept()
        except Exception:
            return
        try:
            await stream_session_events(websocket, app.state.stream, session_id, after)
        except WebSocketDisconnect:
            return

    return app


async def _lifespan(app: FastAPI):
    import asyncio

    stream = getattr(app.state, "stream", None)
    if stream is not None:
        stream.attach_loop(asyncio.get_running_loop())
    service = getattr(app.state, "service", None)
    if service is not None:
        # Restart recovery: reconcile unfinished run transactions from the
        # durable journal BEFORE any new turn can be accepted.
        service.recover_on_startup()
        service.start_worker()
    try:
        yield
    finally:
        if service is not None:
            service.stop_worker()
