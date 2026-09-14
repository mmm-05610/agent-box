"""OpenCode 生产部署模板（非秘密），由插件层唯一拥有。

这个模块拥有 OpenCode 部署里"属于这个 Harness"的部分：单文件二进制在 guest 的
固定挂载点、原生配置进入隔离 HOME 的位置、原生会话存储（SQLite）所在的 state
投影、凭据的环境变量名，以及驱动模块的声明。它只输出**通用字段**：Server、
Core、Worker 与 bwrap 只看到 `executableMounts` / `projectionFiles` /
`stateProjection` / `adapter`，任何一层都不认识 OpenCode。

与 Pi 一样，这里**不复制第二套漂移实现**：原生配置逐字节来自
`deploy/opencode/opencode.json`，而该文件等于 `scripts/server-round1/
model-validation-42d.mjs` 的 `openCodeModelConfig()`（模板测试用 `--family
opencode --dry-run` 逐字段比对）。里面没有任何秘密：API key 是环境引用
`{env:DEEPSEEK_API_KEY}`，由 Harness 在沙箱内解析 Worker 物化出来的凭据。

本阶段实测记录（详见 docs/server-round1/fullstack/opencode-production-packaging.md）：

* `limit.output: 64` 真的进入 provider 请求体（假端点看到 `max_tokens=64`），
  因此不需要 42d 用过的 `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX`；后者的名字
  含 `TOKEN`，会被 Server/Core 的环境变量名规则拒绝，本模板不得声明它。
* 带标题创建会话时，一轮 prompt 恰好产生 **1** 次 provider 请求；不带标题时
  OpenCode 会为了生成标题多发一次请求，因此驱动始终随会话写入标题。
* 对可重试的 5xx，一次 prompt 实测最多产生 **6** 次 provider 尝试（受控实验，
  见门的 retry 观测）。42d 预备脚本里的 `maxProviderAttempts: 12` 没有证据，
  本阶段以实测值取代，并由门在真实链路中复核。
* 会话与消息持久化在 `$XDG_DATA_HOME/opencode/opencode.db`（SQLite，连同
  `-wal`/`-shm`），所以 state 投影目标就是驱动进程的 `XDG_DATA_HOME`。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

OPENCODE_PROVIDER = "deepseek"
#: 产品/ProviderModel 模型 id（用户确认过的那个），不得被静默改写。
PRODUCT_MODEL_ID = "deepseek-flash"
#: OpenCode 自己的模型目录地址形态（由 Harness 扩展层翻译）。
NATIVE_MODEL_VALUE = f"{OPENCODE_PROVIDER}/{PRODUCT_MODEL_ID}"
OFFICIAL_BASE_URL = "https://api.deepseek.com"
CREDENTIAL_KIND = "api-key"
CREDENTIAL_ENVIRONMENT = "DEEPSEEK_API_KEY"
OUTPUT_TOKEN_LIMIT = 64
#: 本阶段授权的单文件二进制版本（由 build-opencode-authorization.mjs 取证）。
OPENCODE_VERSION = "1.18.21"

#: 固定 guest 挂载点：Worker 校验摘要后只读挂载单文件，bwrap 模板只允许
#: `/runtime/bin/<name>` 这一种目标形态。
BINARY_NAME = "opencode"
BINARY_TARGET = f"/runtime/bin/{BINARY_NAME}"
#: 生产 argv：直接执行挂载好的二进制（不加壳、不加解释器）。
BINARY_ARGV: tuple[str, ...] = ()

#: 隔离 HOME 下的原生配置与原生数据目录（state 投影）。
AGENT_HOME = "/tmp/agentbox-home"
CONFIG_TARGET = f"{AGENT_HOME}/opencode.json"
STATE_TARGET = f"{AGENT_HOME}/opencode-state"

#: 生产 adapter 环境。每一项都有明确理由：
#: * `OPENCODE_CONFIG` 指向只读投影进来的原生配置（避免读 guest 里的用户目录）；
#: * `XDG_DATA_HOME` 指向 state 投影目标，SQLite 存储因此可被 Server 回读；
#: * 三个 DISABLE_* 关闭自动更新、模型目录下载与 LSP 下载，使一次运行只与
#:   provider 端点通信（42d 预备运行同样设置）。
#: 依赖环境变量名里**不得**出现 TOKEN/SECRET/KEY/PASSWORD/CREDENTIAL/AUTH，
#: 因此这里没有 `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX`（输出上限由配置的
#: `limit.output` 承载，已实测进入请求体）。
ADAPTER_ENVIRONMENT = {
    "OPENCODE_CONFIG": CONFIG_TARGET,
    "XDG_DATA_HOME": STATE_TARGET,
    "OPENCODE_DISABLE_AUTOUPDATE": "1",
    "OPENCODE_DISABLE_MODELS_FETCH": "1",
    "OPENCODE_DISABLE_LSP_DOWNLOAD": "1",
}

#: 驱动模块：随 deployment 进入评审过的 bundle，sidecar 只从同一 bundle 的
#: `deployment/` 目录加载它（Server/Core/Worker 只搬运声明，不认识内容）。
DRIVER_SOURCE = "deploy/opencode/driver-native.mjs"

#: 产品模型控件：模型是 Provider/Model 引用，控件不给默认值。
MODEL_CONTROL_ID = "model"

#: 一轮 prompt 的 provider 请求预算：带标题的会话恰好 1 次（实测）。
PROVIDER_REQUESTS_PER_PROMPT = 1
#: 对可重试失败，一次 prompt 的 provider 尝试上界（受控实验实测 6 次）。
MEASURED_RETRY_ATTEMPTS = 6

PLUGIN_ROOT = Path(__file__).resolve().parents[3]
DEPLOY_DIRECTORY = PLUGIN_ROOT / "deploy" / "opencode"
CONFIG_TEMPLATE = DEPLOY_DIRECTORY / "opencode.json"
DRIVER_TEMPLATE = DEPLOY_DIRECTORY / "driver-native.mjs"
#: 仅供不得访问真实网络的门的离线资产：预载到 opencode 进程的 loopback 守护。
#: 生产部署**从不**引用它（模板测试断言生产默认里没有 LD_PRELOAD / 审计路径）。
EGRESS_GUARD = DEPLOY_DIRECTORY / "egress-guard.c"

CONFIG_SOURCE = "deploy/opencode/opencode.json"


class OpenCodeProductionTemplateError(ValueError):
    """本模板拒绝输出的部署声明。"""


def config_document() -> dict[str, Any]:
    """签入的原生配置（官方根地址，无秘密）。"""
    return json.loads(CONFIG_TEMPLATE.read_text(encoding="utf-8"))


def loopback_config_document(base_url: str) -> dict[str, Any]:
    """只替换 `baseURL` 的副本：把生产配置指向本机假端点。"""
    if not isinstance(base_url, str) or not base_url.startswith("http://127.0.0.1:"):
        raise OpenCodeProductionTemplateError("OPENCODE_LOOPBACK_BASE_URL_INVALID")
    document = config_document()
    document["provider"][OPENCODE_PROVIDER]["options"]["baseURL"] = base_url
    return document


def documented_differences(base_url: str) -> dict[str, tuple[Any, Any]]:
    """loopback 覆盖到底改了哪些字段，用于审计"只改了一处"。"""
    production = config_document()
    override = loopback_config_document(base_url)
    changed: dict[str, tuple[Any, Any]] = {}
    for provider_id, provider in production["provider"].items():
        other = override["provider"][provider_id]
        for key in sorted(set(provider) | set(other)):
            if provider.get(key) != other.get(key):
                changed[f"provider.{provider_id}.{key}"] = (provider.get(key), other.get(key))
    return changed


def model_aliases() -> dict[str, str]:
    """产品模型 id -> 原生目录值；与 `runtime/profile_extensions.mjs` 必须一致。"""
    return {PRODUCT_MODEL_ID: NATIVE_MODEL_VALUE}


def native_model(model: object) -> object:
    """翻译一个产品模型 id；其它值原样透传（未知模型由驱动在发包前拒绝）。"""
    if not isinstance(model, str):
        return model
    return model_aliases().get(model, model)


def projection_files() -> tuple[dict[str, str], ...]:
    """只读进入隔离 HOME 的原生配置。"""
    return ({"source": CONFIG_SOURCE, "target": CONFIG_TARGET},)


def executable_mount(binary_source: str, digest: str) -> dict[str, str]:
    """单文件二进制的可执行挂载声明（摘要由授权工具取证）。"""
    if (not isinstance(binary_source, str) or not binary_source.startswith("/")
            or "\\" in binary_source or "\x00" in binary_source or "//" in binary_source
            or binary_source.endswith("/")
            or any(part in {"", ".", ".."} for part in binary_source.split("/")[1:])):
        raise OpenCodeProductionTemplateError("OPENCODE_BINARY_SOURCE_INVALID")
    if (not isinstance(digest, str) or len(digest) != 71 or not digest.startswith("sha256:")
            or any(character not in "0123456789abcdef" for character in digest[7:])):
        raise OpenCodeProductionTemplateError("OPENCODE_BINARY_DIGEST_INVALID")
    return {"source": binary_source, "target": BINARY_TARGET, "digest": digest}


def validated_mounts(override: Sequence[Mapping[str, str]]) -> tuple[dict[str, str], ...]:
    """调用方给出的挂载覆盖必须与模板自己产生的形状完全一致。"""
    mounts = []
    for item in override:
        if not isinstance(item, Mapping) or set(item) != {"source", "target", "digest"}:
            raise OpenCodeProductionTemplateError("OPENCODE_EXECUTABLE_MOUNT_INVALID")
        if item["target"] != BINARY_TARGET:
            raise OpenCodeProductionTemplateError("OPENCODE_EXECUTABLE_MOUNT_INVALID")
        mounts.append(executable_mount(item["source"], item["digest"]))
    return tuple(mounts)


def harness_deployment(
    *,
    binary_source: str,
    binary_digest: str,
    timeout_ms: int = 120_000,
    adapter_environment: Mapping[str, str] | None = None,
    projection_files_override: Sequence[Mapping[str, str]] | None = None,
    executable_mounts_override: Sequence[Mapping[str, str]] | None = None,
) -> dict[str, Any]:
    """一条生产 Harness 声明，可直接写进非秘密 deployment 文件。"""
    if adapter_environment is not None and any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in adapter_environment.items()
    ):
        raise OpenCodeProductionTemplateError("OPENCODE_ADAPTER_ENVIRONMENT_INVALID")
    mounts = (validated_mounts(executable_mounts_override) if executable_mounts_override is not None
              else (executable_mount(binary_source, binary_digest),))
    return {
        "id": "opencode",
        "timeoutMs": timeout_ms,
        "credentialKind": CREDENTIAL_KIND,
        "credentialEnvironment": CREDENTIAL_ENVIRONMENT,
        "modelControlId": MODEL_CONTROL_ID,
        "controlOptions": {MODEL_CONTROL_ID: []},
        "executableMounts": [dict(item) for item in mounts],
        "projectionFiles": [dict(item) for item in (
            projection_files_override
            if projection_files_override is not None else projection_files()
        )],
        "stateProjection": {"target": STATE_TARGET},
        "adapter": {
            "command": BINARY_TARGET,
            "args": list(BINARY_ARGV),
            # 环境只到达 Harness 的原生进程；凭据以声明的环境变量在 guest 内注入，
            # 不写进任何文件或参数。
            "environment": dict(
                ADAPTER_ENVIRONMENT if adapter_environment is None else adapter_environment),
            "driver": {"source": DRIVER_SOURCE},
        },
    }


def deployment_document(
    *, binary_source: str, binary_digest: str, plugin_root: Path | str = PLUGIN_ROOT, **harness: Any,
) -> dict[str, Any]:
    """Server 加载的完整非秘密 deployment 文件。"""
    return {
        "schemaVersion": 1,
        "pluginRoot": str(plugin_root),
        "harnesses": [harness_deployment(
            binary_source=binary_source, binary_digest=binary_digest, **harness,
        )],
    }


def main(arguments: Sequence[str] | None = None) -> int:
    """为一个已授权的二进制输出生产部署文件。"""
    parser = argparse.ArgumentParser(description="Emit the OpenCode production deployment file.")
    parser.add_argument("--binary-source", required=True,
                        help="canonical path of the authorized single-file binary")
    parser.add_argument("--binary-digest", required=True, help="its full sha256: digest")
    parser.add_argument("--out", required=True, help="path of the deployment file to write")
    parser.add_argument("--plugin-root", default=str(PLUGIN_ROOT))
    parser.add_argument("--timeout-ms", type=int, default=120_000)
    options = parser.parse_args(arguments)
    document = deployment_document(
        binary_source=options.binary_source, binary_digest=options.binary_digest,
        plugin_root=options.plugin_root, timeout_ms=options.timeout_ms,
    )
    output = Path(options.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "OPENCODE_PRODUCTION_DEPLOYMENT_EMITTED",
        "out": str(output), "binaryTarget": BINARY_TARGET,
        "productModelId": PRODUCT_MODEL_ID, "nativeModelValue": NATIVE_MODEL_VALUE,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI parity with the module
    raise SystemExit(main())
