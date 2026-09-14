"""Pi production deployment template for the managed sidecar chain (non-secret).

This module owns the Pi-specific parts of a production deployment: which
artifact directory carries the adapter and its native dependency closure, how
the product model id is spelled in the native model catalogue, which
environment variable carries the credential reference, and which confined guest
paths hold the native configuration and the native session journal.

It is deliberately *data*: the Server, Core, Worker and bwrap layers only ever
see the generic `runtimeArtifactMounts` / `projectionFiles` / `stateProjection`
/ `adapter` fields this template produces, and never a Pi branch.

The native configuration itself (`models.json`, `settings.json`) is checked in
next to this module under `deploy/pi/` and is byte-identical to the
configuration Work Order 42-D prepared in `bc7d95b`: one provider, the
user-confirmed product model `deepseek-flash`, the official DeepSeek root, a
64-token output ceiling, thinking disabled, and both agent and provider retries
off. A test asserts that equality, so the template cannot drift into a second
implementation. The loopback endpoint a no-model gate uses is produced by
copying `models.json` and replacing `baseUrl` alone.

Nothing here reads, stores, or emits credential content: the API key is an
environment *reference* (`$DEEPSEEK_API_KEY`) resolved by the Harness inside
the sandbox, where the Worker materialized it.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from ..registry.capability_claims import capability_claims as _derive_capability_claims

PI_PROVIDER = "deepseek"
#: The product/ProviderModel model id the user confirmed. It must never change
#: silently: the native catalogue value below is derived from it.
PRODUCT_MODEL_ID = "deepseek-flash"
#: The value Pi's own model catalogue advertises for that product model.
NATIVE_MODEL_VALUE = f"{PI_PROVIDER}/{PRODUCT_MODEL_ID}"
OFFICIAL_BASE_URL = "https://api.deepseek.com"
CREDENTIAL_KIND = "api-key"
CREDENTIAL_ENVIRONMENT = "DEEPSEEK_API_KEY"
OUTPUT_TOKEN_LIMIT = 64

#: Stable artifact name and the confined guest path it is projected to. The
#: adapter entry is derived from it, so the two can never disagree.
ARTIFACT_NAME = "pi-runtime"
ARTIFACT_TARGET = f"/runtime/artifacts/{ARTIFACT_NAME}"
ADAPTER_ARTIFACT_RELATIVE_ENTRY = "node_modules/@automatalabs/pi-acp/dist/index.js"
ADAPTER_ARTIFACT_ENTRY = f"{ARTIFACT_TARGET}/{ADAPTER_ARTIFACT_RELATIVE_ENTRY}"
#: Declared by the pinned builder output; the deployment only records it.
ADAPTER_PACKAGE = "@automatalabs/pi-acp"
ADAPTER_VERSION = "0.5.0"

#: Confined agent home and the native session journal subtree inside it.
AGENT_HOME = "/tmp/agentbox-home"
STATE_TARGET = f"{AGENT_HOME}/sessions"

#: Production adapter environment. `PI_OFFLINE` disables Pi's startup network
#: operations (remote model catalogue refresh, package manager); it does not
#: disable the provider request itself. The version-check and install-telemetry
#: flags keep a managed run from talking to anything but the provider.
ADAPTER_ENVIRONMENT = {
    "PI_CODING_AGENT_DIR": AGENT_HOME,
    "PI_OFFLINE": "1",
    "PI_SKIP_VERSION_CHECK": "1",
    "PI_TELEMETRY": "0",
}

#: The product control that selects the model. The Server only knows this id
#: from the declaration; nothing about Pi is hardcoded in it. No default value
#: is advertised, because a model selection is a Provider/Model reference the
#: product resolves, not one of a fixed set of native strings - and a silently
#: discovered default would run a model the user never chose.
MODEL_CONTROL_ID = "model"

PLUGIN_ROOT = Path(__file__).resolve().parents[3]
DEPLOY_DIRECTORY = PLUGIN_ROOT / "deploy" / "pi"
MODELS_TEMPLATE = DEPLOY_DIRECTORY / "models.json"
SETTINGS_TEMPLATE = DEPLOY_DIRECTORY / "settings.json"
#: Reviewed offline asset for gates that must not reach a real endpoint. It is
#: never referenced by a production deployment.
LOOPBACK_GUARD = DEPLOY_DIRECTORY / "loopback-guard.cjs"
LOOPBACK_GUARD_TARGET = f"{AGENT_HOME}/pi-loopback-guard.cjs"

MODELS_SOURCE = "deploy/pi/models.json"
SETTINGS_SOURCE = "deploy/pi/settings.json"


class PiProductionTemplateError(ValueError):
    """A deployment declaration this template refuses to emit."""


def capability_claims() -> dict[str, bool]:
    """本模板部署时声明的 canonical 能力（派生自注册表，不手写）。

    `attach` 是**静态候选**：真实握手播发过 `promptCapabilities {image}`，投递链路
    也在代码上成立，但没有一次运行真的送过非空附件，所以它只是声明上限、不是观测
    结论。观测结论由链门的证据表决定，本模板无权改写。
    """
    return _derive_capability_claims("pi")


def models_document() -> dict[str, Any]:
    """The checked-in native model catalogue (official root)."""
    return json.loads(MODELS_TEMPLATE.read_text(encoding="utf-8"))


def settings_document() -> dict[str, Any]:
    """The checked-in native settings (agent and provider retries off)."""
    return json.loads(SETTINGS_TEMPLATE.read_text(encoding="utf-8"))


def loopback_models_document(base_url: str) -> dict[str, Any]:
    """A copy of the catalogue with only `baseUrl` replaced.

    A no-model gate needs Pi to talk to a local fake endpoint. Everything else -
    provider, model id, output ceiling, thinking mode, cost metadata - stays the
    template's, and the production template itself is never rewritten.
    """
    if not isinstance(base_url, str) or not base_url.startswith("http://127.0.0.1:"):
        raise PiProductionTemplateError("PI_LOOPBACK_BASE_URL_INVALID")
    document = models_document()
    document["providers"][PI_PROVIDER]["baseUrl"] = base_url
    return document


def documented_differences(base_url: str) -> dict[str, tuple[Any, Any]]:
    """Exactly which fields a loopback override changes, for auditing it."""
    production = models_document()
    override = loopback_models_document(base_url)
    return {
        f"providers.{PI_PROVIDER}.{key}": (production["providers"][PI_PROVIDER].get(key),
                                           override["providers"][PI_PROVIDER].get(key))
        for key in sorted(set(production["providers"][PI_PROVIDER]) | set(override["providers"][PI_PROVIDER]))
        if production["providers"][PI_PROVIDER].get(key) != override["providers"][PI_PROVIDER].get(key)
    }


def model_aliases() -> dict[str, str]:
    """Product model id -> native catalogue value, owned by the Harness layer."""
    return {PRODUCT_MODEL_ID: NATIVE_MODEL_VALUE}


def native_model(model: object) -> object:
    """Translate one product model id; anything else is passed through untouched."""
    if not isinstance(model, str):
        return model
    return model_aliases().get(model, model)


def projection_files() -> tuple[dict[str, str], ...]:
    """The native configuration, read-only, inside the confined agent home."""
    return (
        {"source": MODELS_SOURCE, "target": f"{AGENT_HOME}/models.json"},
        {"source": SETTINGS_SOURCE, "target": f"{AGENT_HOME}/settings.json"},
    )


def harness_deployment(
    *,
    artifact_source: str,
    tree_digest: str,
    timeout_ms: int = 120_000,
    adapter_environment: Mapping[str, str] | None = None,
    projection_files_override: Sequence[Mapping[str, str]] | None = None,
    runtime_artifact_mounts_override: Sequence[Mapping[str, str]] | None = None,
) -> dict[str, Any]:
    """One production Harness entry, ready for a non-secret deployment file."""
    if not isinstance(artifact_source, str) or not artifact_source.startswith("/"):
        raise PiProductionTemplateError("PI_ARTIFACT_SOURCE_INVALID")
    if not isinstance(tree_digest, str) or not tree_digest.startswith("sha256:") or len(tree_digest) != 71:
        raise PiProductionTemplateError("PI_ARTIFACT_DIGEST_INVALID")
    if adapter_environment is not None and any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in adapter_environment.items()
    ):
        raise PiProductionTemplateError("PI_ADAPTER_ENVIRONMENT_INVALID")
    mounts = runtime_artifact_mounts_override or ({
        "source": artifact_source, "target": ARTIFACT_TARGET, "treeDigest": tree_digest,
    },)
    return {
        "id": "pi",
        "timeoutMs": timeout_ms,
        # 能力声明**派生**自注册表（`harnesses.toml`），不由本模板手写：see
        # `registry.capability_claims`。它是静态声明上限，测试逐项断言 true 项 == TOML，
        # 因此"生产部署声明的能力"与"注册表声明的能力"不可能漂移。
        "capabilityClaims": capability_claims(),
        "credentialKind": CREDENTIAL_KIND,
        "credentialEnvironment": CREDENTIAL_ENVIRONMENT,
        "modelControlId": MODEL_CONTROL_ID,
        "controlOptions": {MODEL_CONTROL_ID: []},
        "runtimeArtifactMounts": [dict(item) for item in mounts],
        "projectionFiles": [dict(item) for item in (
            projection_files_override
            if projection_files_override is not None else projection_files()
        )],
        "stateProjection": {"target": STATE_TARGET},
        "adapter": {
            "command": "/usr/bin/node",
            "args": [ADAPTER_ARTIFACT_ENTRY],
            # The environment reaches the adapter process only, and the
            # credential is injected there as the declared environment
            # variable; no secret is written into any file or argument.
            "environment": dict(ADAPTER_ENVIRONMENT if adapter_environment is None else adapter_environment),
        },
    }


def deployment_document(
    *, artifact_source: str, tree_digest: str, plugin_root: Path | str = PLUGIN_ROOT, **harness: Any,
) -> dict[str, Any]:
    """The whole non-secret deployment file the Server loads."""
    return {
        "schemaVersion": 1,
        "pluginRoot": str(plugin_root),
        "harnesses": [harness_deployment(
            artifact_source=artifact_source, tree_digest=tree_digest, **harness,
        )],
    }


def main(arguments: Sequence[str] | None = None) -> int:
    """Emit the production deployment file for one built artifact."""
    parser = argparse.ArgumentParser(description="Emit the Pi production deployment file.")
    parser.add_argument("--artifact-source", required=True,
                        help="canonical WSL path of the built Pi runtime artifact")
    parser.add_argument("--tree-digest", required=True,
                        help="the artifact manifest's sha256: tree digest")
    parser.add_argument("--out", required=True, help="path of the deployment file to write")
    parser.add_argument("--plugin-root", default=str(PLUGIN_ROOT))
    parser.add_argument("--timeout-ms", type=int, default=120_000)
    options = parser.parse_args(arguments)
    document = deployment_document(
        artifact_source=options.artifact_source, tree_digest=options.tree_digest,
        plugin_root=options.plugin_root, timeout_ms=options.timeout_ms,
    )
    output = Path(options.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PI_PRODUCTION_DEPLOYMENT_EMITTED",
        "out": str(output), "artifactTarget": ARTIFACT_TARGET,
        "productModelId": PRODUCT_MODEL_ID, "nativeModelValue": NATIVE_MODEL_VALUE,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI parity with the module
    raise SystemExit(main())
