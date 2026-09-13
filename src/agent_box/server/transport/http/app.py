"""Authenticated loopback HTTP API for the independent Server."""
from __future__ import annotations

from contextlib import asynccontextmanager
import json
import secrets
from typing import Annotated, Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from agent_box.server.bootstrap import ServerRuntime
from agent_box.server.errors import ServerError


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ProbeRequest(StrictModel):
    kind: str
    distribution: str = Field(min_length=1, max_length=128)
    user: str | None = Field(default=None, min_length=1, max_length=128)


class BrowseRequest(StrictModel):
    probe_id: str = Field(min_length=1, max_length=160)
    path: str = Field(min_length=1, max_length=4096)


class WorkspaceRequest(BrowseRequest):
    pass


class ProfileRequest(StrictModel):
    name: str = Field(min_length=1, max_length=128)
    harness_type: str = Field(min_length=1, max_length=64)
    configuration: dict[str, Any]
    credential_id: str | None = Field(default=None, min_length=1, max_length=160)


class SessionRequest(StrictModel):
    workspace_id: str = Field(min_length=1, max_length=160)
    profile_id: str = Field(min_length=1, max_length=160)


class TurnRequest(StrictModel):
    text: str = Field(min_length=1, max_length=4096)
    expected_profile_revision: int = Field(ge=1)
    overrides: dict[str, Any] | None = None


def _loopback_authority(value: str) -> bool:
    host = value.rsplit(":", 1)[0].lower() if not value.startswith("[") else value.split("]", 1)[0] + "]"
    return host in {"127.0.0.1", "localhost", "[::1]"}


def create_app(runtime: ServerRuntime) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        runtime.start()
        try:
            yield
        finally:
            runtime.stop()

    app = FastAPI(
        title="AgentBox Server", version="1", lifespan=lifespan,
        openapi_url=None, docs_url=None, redoc_url=None,
    )

    @app.middleware("http")
    async def loopback_policy(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or f"req_{uuid4().hex}"
        request.state.request_id = request_id
        host = request.headers.get("host", "")
        origin = request.headers.get("origin")
        if not _loopback_authority(host) or (origin and not _loopback_authority(origin.split("//", 1)[-1])):
            return _error("LOOPBACK_POLICY_REJECTED", "Host or Origin is not allowed", 403, False, request_id)
        response = await call_next(request)
        # Windows PowerShell 5 otherwise decodes non-ASCII JSON with the active
        # ANSI code page even though JSON itself is UTF-8 by specification.
        if response.headers.get("content-type") == "application/json":
            response.headers["content-type"] = "application/json; charset=utf-8"
        response.headers["X-Request-ID"] = request_id
        return response

    def _error_handler(request: Request, exc: ServerError):
        return _error(exc.code, exc.message, exc.status, exc.retryable, request.state.request_id)

    app.add_exception_handler(ServerError, _error_handler)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, _exc: RequestValidationError):
        return _error("REQUEST_INVALID", "Request did not match the API schema", 422, False, request.state.request_id)

    def authorize(
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
    ) -> None:
        expected = "Bearer " + runtime.token
        if authorization is None or not secrets.compare_digest(authorization, expected):
            raise ServerError("AUTHENTICATION_REQUIRED", "A valid bearer token is required", status=401)

    def idempotency_key(
        value: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    ) -> str:
        if value is None or not (1 <= len(value) <= 160):
            raise ServerError("IDEMPOTENCY_KEY_REQUIRED", "A bounded Idempotency-Key is required", status=400)
        return value

    protected = [Depends(authorize)]

    @app.get("/live")
    def live():
        return {"status": "alive"}

    @app.get("/api/v1/readiness", dependencies=protected)
    def readiness():
        return runtime.service.readiness()

    @app.get("/api/v1/openapi.json", dependencies=protected)
    def openapi():
        return app.openapi()

    @app.get("/api/v1/wsl/distributions", dependencies=protected)
    def distributions():
        return {"items": runtime.service.distributions()}

    @app.post("/api/v1/connections/probe", dependencies=protected)
    def probe(body: ProbeRequest, response: Response, key: str = Depends(idempotency_key)):
        if body.kind != "wsl":
            raise ServerError("CONNECTION_KIND_UNSUPPORTED", "Only WSL connections are supported", status=422)
        status, result = runtime.service.probe(key, body.distribution, body.user)
        response.status_code = status
        return result

    @app.post("/api/v1/connections/browse", dependencies=protected)
    def browse(body: BrowseRequest, response: Response, key: str = Depends(idempotency_key)):
        status, result = runtime.service.browse(key, body.probe_id, body.path)
        response.status_code = status
        return result

    @app.post("/api/v1/workspaces", dependencies=protected)
    def create_workspace(body: WorkspaceRequest, response: Response, key: str = Depends(idempotency_key)):
        status, result = runtime.service.create_workspace(key, body.model_dump())
        response.status_code = status
        return result

    @app.get("/api/v1/workspaces", dependencies=protected)
    def list_workspaces():
        return {"items": runtime.repository.list_workspaces()}

    @app.post("/api/v1/profiles", dependencies=protected)
    def create_profile(body: ProfileRequest, response: Response, key: str = Depends(idempotency_key)):
        status, result = runtime.service.create_profile(key, body.model_dump())
        response.status_code = status
        return result

    @app.get("/api/v1/profiles", dependencies=protected)
    def list_profiles():
        return {"items": runtime.service.profiles.list()}

    @app.post("/api/v1/sessions", dependencies=protected)
    def create_session(body: SessionRequest, response: Response, key: str = Depends(idempotency_key)):
        status, result = runtime.service.create_session(key, body.model_dump())
        response.status_code = status
        return result

    @app.get("/api/v1/sessions/{session_id}", dependencies=protected)
    def get_session(session_id: str):
        return runtime.repository.get_session(session_id)

    @app.post("/api/v1/sessions/{session_id}/turns", dependencies=protected)
    def create_turn(
        session_id: str, body: TurnRequest, response: Response,
        key: str = Depends(idempotency_key),
    ):
        status, result = runtime.service.create_turn(session_id, key, body.model_dump())
        response.status_code = status
        return result

    @app.get("/api/v1/sessions/{session_id}/events", dependencies=protected)
    def events(session_id: str, after: int = Query(default=0, ge=0)):
        generation = runtime.notifier.generation()
        history = runtime.repository.list_events(session_id, after)

        def stream():
            cursor = after
            for item in history:
                payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
                yield f"id: {item['seq']}\nevent: {item['kind']}\ndata: {payload}\n\n"
                cursor = item["seq"]
            current_generation = generation
            while True:
                batch = runtime.repository.list_events(session_id, cursor)
                if batch:
                    for item in batch:
                        payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
                        yield f"id: {item['seq']}\nevent: {item['kind']}\ndata: {payload}\n\n"
                        cursor = item["seq"]
                    current_generation = runtime.notifier.generation()
                    continue
                next_generation = runtime.notifier.wait_after(current_generation)
                if next_generation == current_generation:
                    yield ": keepalive\n\n"
                current_generation = next_generation

        return StreamingResponse(stream(), media_type="text/event-stream")

    @app.post("/api/v1/turns/{turn_id}/cancel", dependencies=protected)
    def cancel(turn_id: str, response: Response, key: str = Depends(idempotency_key)):
        status, result = runtime.service.cancel_turn(turn_id, key)
        response.status_code = status
        return result

    return app


def _error(code: str, message: str, status: int, retryable: bool, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "retryable": retryable, "request_id": request_id}},
    )
