"""FastAPI application factory for the fresh Studio service."""
from __future__ import annotations

import os
import sys
from pathlib import Path
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
from fastapi.responses import JSONResponse
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
from agent_box_model_providers.errors import ProviderAuthorityError
from agent_box_model_providers.resource import (
    HarnessModelProviderConfigResolver,
    model_provider_config_store,
    provider_account_store,
)
from ..schemas import (
    BreakLeaseRequest,
    CreateProfileRequest,
    CreateProviderRequest,
    CreateProviderAccountRequest,
    CreateHarnessProviderConfigRequest,
    UpdateHarnessProviderConfigRequest,
    CreateSessionRequest,
    PermissionResponseRequest,
    ProbeRequest,
    QuestionResponseRequest,
    RegisterProjectRequest,
    SetCredentialRequest,
    TurnCreateRequest,
    UpdateProviderRequest,
    UpdateProviderAccountRequest,
)
from ..service import (
    SERVICE_NAME,
    BindingVerificationError,
    CrossHarnessContinuationUnsupported,
    HarnessNotFound,
    LaunchSelectionError,
    ProfileAuthorityError,
    ProfileNotFound,
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
    if isinstance(exc, HarnessNotFound):
        return 404, "HARNESS_NOT_FOUND", str(exc), {}
    if isinstance(exc, ProfileNotFound):
        return 404, "PROFILE_NOT_FOUND", str(exc), {}
    if isinstance(exc, ProfileAuthorityError):
        return 409, exc.authority_code, str(exc), {}
    if isinstance(exc, ProviderAuthorityError):
        # Provider authority failures carry their own stable code + status;
        # messages are content-free (never credential values, never bodies).
        return exc.http_status, exc.code, str(exc), dict(exc.extra)
    if isinstance(exc, SessionCapabilityUnavailable):
        return 409, "SESSION_CAPABILITY_UNAVAILABLE", str(exc), {}
    if type(exc).__name__ in (
        "ProjectNotRegistered", "ProjectIdentityConflict", "ProjectPathRejected", "WorkspaceLocalError",
    ):
        http_code, code = {
            "ProjectNotRegistered": (404, "PROJECT_NOT_REGISTERED"),
            "ProjectPathRejected": (409, "PROJECT_PATH_REJECTED"),
            "ProjectIdentityConflict": (409, "PROJECT_IDENTITY_CONFLICT"),
            "WorkspaceLocalError": (400, "WORKSPACE_LOCAL_ERROR"),
        }[type(exc).__name__]
        return http_code, code, str(exc), {}
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
    host_operations: object | None = None,
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
            from agent_box.work_core.runtime import AGENT_BOX_HOME_ENV

            os.environ[AGENT_BOX_HOME_ENV] = str(config.agent_box_home)
        environment = build_extension_environment(host_operations=host_operations)
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
            host_operations=host_operations,
        )
    app.state.service = service
    # -- provider authority (P2, architecture override) --------------------------
    # The authority is the model-providers PLUGIN, reached through the
    # Resource Library — the studio never imports the concrete store.  The
    # per-request resolver fails closed with a typed 503 when the plugin is
    # not registered.
    app.state.provider_store = None  # legacy attribute; authority is registry-resolved

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

    @app.get("/api/v1/readiness", dependencies=[Depends(require_token)])
    def readiness(credential_preflight: bool = Query(default=False)) -> dict[str, Any]:
        """Component readiness truth: per-provider executable/version,
        launch modes, native resume, credential locator, sandbox/runtime/
        terminal ports.  Opt-in ``credential_preflight`` runs the bounded,
        content-free login status probe.  Never a single ready flag."""
        return service.readiness(credential_preflight=credential_preflight)

    @app.post("/api/v1/ws-ticket", dependencies=[Depends(require_token)])
    def ws_ticket() -> dict[str, Any]:
        ticket = tickets.issue("studio-client")
        return {"ticket": ticket.value, "expires_in": 30, "single_use": True}

    # -- profiles (the single registered profile authority) ---------------------

    @app.get(
        "/api/v1/harnesses/{harness_type}/profiles",
        dependencies=[Depends(require_token)],
    )
    def list_profiles(harness_type: str, request: Request) -> dict[str, Any]:
        try:
            return service.list_profiles(harness_type)
        except Exception as exc:
            _handle_error(request, exc)

    @app.post(
        "/api/v1/harnesses/{harness_type}/profiles",
        status_code=201,
        dependencies=[Depends(require_token)],
    )
    def create_profile(
        harness_type: str, request: Request, body: CreateProfileRequest
    ) -> dict[str, Any]:
        try:
            created = service.create_or_update_profile(
                harness_type,
                profile_id=body.profile_id,
                payload=body.payload,
                expected_revision=body.expected_revision,
            )
        except Exception as exc:
            _handle_error(request, exc)
        # Every accepted write creates an immutable profile revision.
        return created

    @app.get(
        "/api/v1/harnesses/{harness_type}/profiles/{profile_id}",
        dependencies=[Depends(require_token)],
    )
    def get_profile(
        harness_type: str, profile_id: str, request: Request,
        revision: Optional[int] = Query(default=None),
    ) -> dict[str, Any]:
        try:
            return service.get_profile(harness_type, profile_id, revision=revision)
        except Exception as exc:
            _handle_error(request, exc)

    # -- providers (the P2 model-gateway provider authority) ---------------------

    _CREDENTIAL_ENV_VARS = {
        "claude-code": "ANTHROPIC_AUTH_TOKEN",
        "opencode": "OPENCODE_API_KEY",
        "hermes": "OPENAI_API_KEY",
        "pi": "MINIMAX_API_KEY",
    }

    def _provider_store(request: Request) -> HarnessModelProviderConfigResolver:
        """The HarnessProviderConfig management facade, resolved through the
        Resource Library (the model-providers plugin's registry entry)."""
        try:
            return model_provider_config_store(request.app.state.environment.registry)
        except Exception as exc:
            _error_response(
                503,
                "PROVIDER_AUTHORITY_UNAVAILABLE",
                "the model provider authority plugin is not registered",
            )
            raise RuntimeError("unreachable") from exc

    def _models_payload(models: Any) -> Any:
        """DTO entries -> plain bounded dicts for the durable store."""
        if models is None:
            return None
        return [entry.model_dump(exclude_none=True) for entry in models]

    @app.get("/api/v1/providers", dependencies=[Depends(require_token)])
    def list_providers(request: Request) -> dict[str, Any]:
        return {"providers": _provider_store(request).list()}

    @app.get("/api/v1/provider-accounts", dependencies=[Depends(require_token)])
    def list_provider_accounts(request: Request) -> dict[str, Any]:
        try:
            return {"accounts": provider_account_store(request.app.state.environment.registry).list_rows()}
        except Exception as exc:
            _handle_error(request, exc)

    @app.post("/api/v1/provider-accounts", status_code=201, dependencies=[Depends(require_token)])
    def create_provider_account(request: Request, body: CreateProviderAccountRequest) -> dict[str, Any]:
        try:
            account = provider_account_store(request.app.state.environment.registry).create(**body.model_dump())
            return {"account": account}
        except Exception as exc:
            _handle_error(request, exc)

    @app.get("/api/v1/harness-provider-configs", dependencies=[Depends(require_token)])
    def list_harness_provider_configs(request: Request) -> dict[str, Any]:
        try:
            return {"configs": _provider_store(request).list()}
        except Exception as exc:
            _handle_error(request, exc)

    @app.post("/api/v1/harness-provider-configs", status_code=201, dependencies=[Depends(require_token)])
    def create_harness_provider_config(request: Request, body: CreateHarnessProviderConfigRequest) -> dict[str, Any]:
        try:
            values = body.model_dump(exclude_none=True)
            if values.get("models") is not None:
                values["models"] = [
                    item.model_dump(exclude_none=True) for item in body.models or []
                ]
            config = _provider_store(request).create(**values)
            return {"config": config}
        except Exception as exc:
            _handle_error(request, exc)

    @app.get("/api/v1/harness-provider-configs/{config_id}", dependencies=[Depends(require_token)])
    def get_harness_provider_config(config_id: str, request: Request, revision: Optional[int] = Query(default=None, ge=1)) -> dict[str, Any]:
        try:
            return {"config": _provider_store(request).get(config_id, revision)}
        except Exception as exc:
            _handle_error(request, exc)

    @app.patch("/api/v1/harness-provider-configs/{config_id}", dependencies=[Depends(require_token)])
    def update_harness_provider_config(config_id: str, request: Request, body: UpdateHarnessProviderConfigRequest) -> dict[str, Any]:
        try:
            values = body.model_dump(exclude_none=True)
            values.pop("expected_revision")
            if body.models is not None:
                values["models"] = [item.model_dump(exclude_none=True) for item in body.models]
            return {"config": _provider_store(request).update(config_id, body.expected_revision, **values)}
        except Exception as exc:
            _handle_error(request, exc)

    @app.post("/api/v1/harness-provider-configs/{config_id}/disable", dependencies=[Depends(require_token)])
    def disable_harness_provider_config(config_id: str, request: Request, expected_revision: int = Query(..., ge=1)) -> dict[str, Any]:
        try:
            return {"config": _provider_store(request).update(config_id, expected_revision, enabled=False)}
        except Exception as exc:
            _handle_error(request, exc)

    @app.post("/api/v1/harness-provider-configs/{config_id}/probe", dependencies=[Depends(require_token)])
    def probe_harness_provider_config(config_id: str, request: Request, body: ProbeRequest) -> dict[str, Any]:
        try:
            return _provider_store(request).probe(config_id, model=body.model)
        except Exception as exc:
            _handle_error(request, exc)

    @app.delete("/api/v1/harness-provider-configs/{config_id}", dependencies=[Depends(require_token)])
    def delete_harness_provider_config(config_id: str, request: Request, replacement_config_id: Optional[str] = Query(default=None)) -> dict[str, Any]:
        try:
            _provider_store(request).delete(
                config_id,
                session_store=getattr(service, "_store", None),
                replacement_config_id=replacement_config_id,
            )
            return {"deleted": True, "config_id": config_id}
        except Exception as exc:
            _handle_error(request, exc)

    @app.post(
        "/api/v1/providers", status_code=201, dependencies=[Depends(require_token)]
    )
    def create_provider(
        request: Request, body: CreateProviderRequest
    ) -> dict[str, Any]:
        try:
            facade = _provider_store(request)
            row = facade.create(
                config_id=body.provider_id,
                harness_type=body.harness_type,
                protocol_family=body.protocol_family,
                base_url=body.base_url,
                models=_models_payload(body.models),
                credential_ref=f"gateway/{body.provider_id}",
                projection={"credential_env_var": _CREDENTIAL_ENV_VARS.get(body.harness_type, "")},
                enabled=True,
            )
            if body.credential_value:
                facade.credentials.set(body.provider_id, body.credential_value)
        except Exception as exc:
            _handle_error(request, exc)
        return {"provider": row}

    @app.get(
        "/api/v1/providers/{provider_id}", dependencies=[Depends(require_token)]
    )
    def get_provider(provider_id: str, request: Request) -> dict[str, Any]:
        try:
            return {"provider": _provider_store(request).get(provider_id)}
        except Exception as exc:
            _handle_error(request, exc)

    @app.put(
        "/api/v1/providers/{provider_id}", dependencies=[Depends(require_token)]
    )
    def update_provider(
        provider_id: str, request: Request, body: UpdateProviderRequest
    ) -> dict[str, Any]:
        try:
            changed: dict[str, Any] = {}
            for field_name, value in (
                ("base_url", body.base_url),
                ("protocol_family", body.protocol_family),
                ("models", _models_payload(body.models) if body.models is not None else None),
                ("enabled", getattr(body, "enabled", None)),
            ):
                if value is not None:
                    changed[field_name] = value
            row = _provider_store(request).update(
                provider_id, expected_revision=body.expected_revision, **changed
            )
        except Exception as exc:
            _handle_error(request, exc)
        return {"provider": row}

    @app.put(
        "/api/v1/providers/{provider_id}/credential",
        status_code=201,
        dependencies=[Depends(require_token)],
    )
    def set_provider_credential(
        provider_id: str, request: Request, body: SetCredentialRequest
    ) -> dict[str, Any]:
        """Write-only credential replace: the value is materialized at mode
        0600 and NEVER echoed back, not even in this response."""
        try:
            _provider_store(request).credentials.set(provider_id, body.value)
            return {"credential": {"locator": f"gateway/{provider_id}", "present": True}}
        except Exception as exc:
            _handle_error(request, exc)

    @app.delete(
        "/api/v1/providers/{provider_id}/credential",
        dependencies=[Depends(require_token)],
    )
    def delete_provider_credential(
        provider_id: str, request: Request
    ) -> dict[str, Any]:
        try:
            _provider_store(request).credentials.delete(provider_id)
            return {"credential": {"locator": f"gateway/{provider_id}", "present": False}}
        except Exception as exc:
            _handle_error(request, exc)

    @app.delete(
        "/api/v1/providers/{provider_id}", dependencies=[Depends(require_token)]
    )
    def delete_provider(
        provider_id: str,
        request: Request,
        replacement: Optional[str] = Query(default=None),
    ) -> dict[str, Any]:
        """Delete one provider (destroying its credential file).

        A provider referenced by any turn Binding in the session store is
        409 PROVIDER_IN_USE unless ``replacement=<provider_id>`` names a
        live replacement provider.
        """
        provider_store = _provider_store(request)
        try:
            provider_store.delete(
                provider_id,
                session_store=getattr(service, "_store", None),
                replacement_config_id=replacement,
            )
        except Exception as exc:
            _handle_error(request, exc)
        return {"deleted": True, "provider_id": provider_id}

    @app.post(
        "/api/v1/providers/{provider_id}/probe",
        dependencies=[Depends(require_token)],
    )
    def probe_provider(
        provider_id: str, request: Request, body: ProbeRequest
    ) -> dict[str, Any]:
        """One bounded real request through the protocol family; typed
        outcome, deterministic stop, evidence bounded to the last 8."""
        try:
            return _provider_store(request).probe(provider_id, model=body.model)
        except Exception as exc:
            _handle_error(request, exc)

    @app.post(
        "/api/v1/providers/{provider_id}/models/discover",
        dependencies=[Depends(require_token)],
    )
    def discover_provider_models(
        provider_id: str, request: Request
    ) -> dict[str, Any]:
        """Bounded listing fetch; typed failure; manual models untouched."""
        from agent_box_model_providers.probe import discover_models

        try:
            facade = _provider_store(request)
            record = facade.get(provider_id)
            value = facade.credentials.read(provider_id)
            discovered = discover_models(
                record["protocol_family"],
                record["base_url"],
                credential_value=value,
            )
            existing = {entry.get("model_id") for entry in record.get("models", [])}
            added = [m for m in discovered if m not in existing]
            revision = facade.current_revision(provider_id)
            if added:
                record = facade.update(
                    provider_id,
                    expected_revision=revision,
                    models=list(record.get("models", []))
                    + [{"model_id": m} for m in added],
                )
            return {
                "discovered": discovered,
                "added": added,
                "provider": record,
            }
        except Exception as exc:
            _handle_error(request, exc)

    # -- projects (standalone registration surface) ------------------------------

    @app.post("/api/v1/projects", dependencies=[Depends(require_token)])
    def register_project(request: Request, body: RegisterProjectRequest) -> dict[str, Any]:
        try:
            known = {
                p["project_id"] for p in service.list_projects().get("projects", [])
            }
            project = service.register_project(body.path)
        except Exception as exc:
            _handle_error(request, exc)
        # Re-registering the same canonical root is an idempotent replay
        # (200); a genuinely new registration is 201.  The host path never
        # appears in the response.
        status = 200 if project["project_id"] in known else 201
        return JSONResponse(status_code=status, content={"project": project})

    @app.get("/api/v1/projects", dependencies=[Depends(require_token)])
    def list_projects(request: Request) -> dict[str, Any]:
        try:
            return service.list_projects()
        except Exception as exc:
            _handle_error(request, exc)

    @app.get("/api/v1/projects/{project_id}", dependencies=[Depends(require_token)])
    def get_project(project_id: str, request: Request) -> dict[str, Any]:
        try:
            return service.get_project(project_id)
        except Exception as exc:
            _handle_error(request, exc)

    @app.get("/api/v1/remote-projects", dependencies=[Depends(require_token)])
    def list_remote_projects(request: Request) -> dict[str, Any]:
        """Saved WSL Project identities (the GUI's project selector).

        Non-secret identity fields only, delegated from the workspace
        provider; a non-WSL workspace honestly reports an empty list.
        """
        try:
            return service.list_remote_projects()
        except Exception as exc:
            _handle_error(request, exc)

    # -- sessions ---------------------------------------------------------------

    @app.post("/api/v1/sessions", status_code=201, dependencies=[Depends(require_token)])
    def create_session(request: Request, body: CreateSessionRequest) -> dict[str, Any]:
        remote_fields = (
            body.connection_id,
            body.connection_revision,
            body.project_identity,
            body.remote_path,
        )
        has_remote = any(value is not None for value in remote_fields)
        if has_remote and body.project_path is not None:
            # Local and remote references are mutually exclusive: a Session
            # is bound to exactly one workspace authority.
            _error_response(
                400,
                "SESSION_REFERENCE_CONFLICT",
                "a Session references either a local project path or one "
                "remote Connection project, never both",
            )
        try:
            if has_remote:
                if body.project_id is None or any(
                    value is None for value in remote_fields
                ):
                    _error_response(
                        400,
                        "SESSION_REFERENCE_CONFLICT",
                        "a remote Session requires connection_id, "
                        "connection_revision, project_identity, remote_path "
                        "and project_id together",
                    )
                created = service.create_remote_session(
                    idempotency_key=body.idempotency_key,
                    title=body.title,
                    connection_id=body.connection_id,
                    connection_revision=body.connection_revision,
                    project_identity=body.project_identity,
                    project_id=body.project_id,
                    remote_path=body.remote_path,
                )
            else:
                created = service.create_session(
                    idempotency_key=body.idempotency_key,
                    title=body.title,
                    project_path=body.project_path,
                    project_id=body.project_id,
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
                "workspace_provider": session.workspace_ref.provider,
                "project_id": created["project_id"],
                **(
                    {
                        "connection_id": created["connection_id"],
                        "connection_revision": created["connection_revision"],
                    }
                    if has_remote
                    else {}
                ),
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
                    "project_id": s.project_identity,
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

    def _transcript_turns(session_id: str, events) -> list[dict[str, Any]]:
        """P4 flat-transcript projection for the GUI's approved restore
        shape: one row per Turn with the frozen input text (the user's own
        content), the joined assistant messages, and the committed outcome.
        Derived from durable authority only; bounded parts per turn."""
        import json as _json

        grouped: dict[str, dict[str, Any]] = {}
        for event in events:
            turn_id = event.turn_id
            if not turn_id:
                continue
            row = grouped.setdefault(turn_id, {"assistant": [], "usage": None})
            payload = dict(event.payload or {})
            if event.event_type == "assistant.message":
                text = str(payload.get("text", ""))
                if text and len(row["assistant"]) < 64:
                    row["assistant"].append(text[:4000])
            elif event.event_type == "usage.updated":
                raw = str(payload.get("usage_json", "") or "")
                try:
                    row["usage"] = _json.loads(raw) if raw else None
                except Exception:  # noqa: BLE001 - usage is best-effort
                    row["usage"] = None
        turns: list[dict[str, Any]] = []
        for turn_id, row in grouped.items():
            try:
                turn = store.get_turn(session_id, turn_id)
            except Exception:  # noqa: BLE001 - unreadable turn: skip row
                continue
            try:
                input_text = store.turn_input_text(turn_id)
            except Exception:  # noqa: BLE001 - absent input: honest empty
                input_text = ""
            status = (
                turn.terminal_outcome.value
                if turn.terminal_outcome
                else turn.state.value
            )
            turns.append(
                {
                    "turn_id": turn_id,
                    "input": input_text,
                    "assistant_text": "\n".join(row["assistant"]) or None,
                    "status": status,
                    "usage": row["usage"],
                }
            )
        return turns

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
                "project_id": session.project_identity,
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
            # REST matches the WS replay gate: a cursor beyond the committed
            # watermark is a resync, never a silent empty page.
            store.assert_replay_cursor(session_id, after)
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
            # P4 flat-transcript restore: derived from durable authority only
            # (turn rows + frozen input + assistant.message events); no
            # fabrication, no credential material.
            "turns": _transcript_turns(session_id, events),
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
                model_provider=(
                    {
                        "config_id": body.model_provider.config_id,
                        "revision": body.model_provider.revision,
                        "digest": body.model_provider.digest,
                    }
                    if body.model_provider
                    else None
                ),
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
