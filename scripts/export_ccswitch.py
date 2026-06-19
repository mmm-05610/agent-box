#!/usr/bin/env python3
"""export_ccswitch.py — one-shot developer tool.

Reads the publicly documented cc-switch provider catalog and emits a
Python module containing `_BUILTIN_PROVIDERS` and `_BUILTIN_MCP_SERVERS`
lists in the exact shape that `src/agent_box/library.py` expects.

This is a **developer tool**, not a runtime path. Run it once when you
want to refresh the built-in component data:

    python3 scripts/export_ccswitch.py            # writes to stdout
    python3 scripts/export_ccswitch.py -o out.py  # writes to a file

After the generated file is in place, paste the lists into `library.py`
(or replace the constant there with an `import`).

Data sources (in priority order):
    1. --input <file>   a local JSON file with the same shape
    2. cc-switch's published provider list (best-effort web fetch with
       a hard-coded local fallback so the script always produces output,
       even offline)

Output schema (one record per line in the file):
    {
        "id": "deepseek",                  # stable slug
        "name": "DeepSeek",                # human name
        "base_url": "https://...",         # CC ANTHROPIC_BASE_URL
        "model": "deepseek-v4-pro",        # CC ANTHROPIC_MODEL
        "label": "DeepSeek (深度求索)",     # short label (often CN)
        "region": "cn",                    # cn / us / eu / ru / global / local
        "tags": ["deepseek", "cn"]         # free-form
    }

Run with --help for the full option list.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Built-in fallback data — what we ship today, also used as the "always
# works, no network" baseline when the live fetch fails.
# ---------------------------------------------------------------------------

_LOCAL_FALLBACK_PROVIDERS: List[Dict[str, Any]] = [
    # Each entry mirrors the shape library.py's _BUILTIN_PROVIDERS expects.
    # The base_url / model values track the v0.2.0 cut.
    {"id": "anthropic", "name": "Anthropic (Claude)", "base_url": "https://api.anthropic.com", "model": "claude-sonnet-4-6", "label": "Anthropic官方", "region": "us", "tags": ["official", "anthropic"]},
    {"id": "openai", "name": "OpenAI (Responses API)", "base_url": "https://api.openai.com/v1", "model": "gpt-5.2", "label": "OpenAI", "region": "us", "tags": ["openai", "compat"]},
    {"id": "azure-openai", "name": "Azure OpenAI", "base_url": "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOY", "model": "gpt-5.2", "label": "Azure OpenAI", "region": "global", "tags": ["azure", "openai"]},
    {"id": "google-vertex", "name": "Google Vertex AI (Claude)", "base_url": "https://us-east5-aiplatform.googleapis.com/v1", "model": "claude-sonnet-4-6@20250514", "label": "Google Vertex AI", "region": "us", "tags": ["google", "vertex"]},
    {"id": "xai-grok", "name": "xAI (Grok)", "base_url": "https://api.x.ai/v1", "model": "grok-4", "label": "xAI Grok", "region": "us", "tags": ["xai", "grok"]},
    {"id": "deepseek", "name": "DeepSeek", "base_url": "https://api.deepseek.com/anthropic", "model": "deepseek-v4-pro", "label": "DeepSeek (深度求索)", "region": "cn", "tags": ["deepseek", "cn"]},
    {"id": "kimi", "name": "Moonshot Kimi", "base_url": "https://api.moonshot.cn/anthropic", "model": "kimi-k2-pro", "label": "月之暗面 Kimi", "region": "cn", "tags": ["kimi", "moonshot", "cn"]},
    {"id": "glm", "name": "Zhipu GLM", "base_url": "https://open.bigmodel.cn/api/anthropic", "model": "glm-5", "label": "智谱 GLM", "region": "cn", "tags": ["glm", "zhipu", "cn"]},
    {"id": "minimax", "name": "MiniMax", "base_url": "https://api.minimaxi.com/anthropic", "model": "MiniMax-M2.7", "label": "MiniMax (稀宇科技)", "region": "cn", "tags": ["minimax", "cn"]},
    {"id": "qwen", "name": "Alibaba Qwen (DashScope)", "base_url": "https://dashscope.aliyuncs.com/apps/anthropic", "model": "qwen3-max", "label": "阿里通义千问", "region": "cn", "tags": ["qwen", "alibaba", "cn"]},
    {"id": "doubao", "name": "Volcengine Doubao", "base_url": "https://ark.cn-beijing.volces.com/api/v3", "model": "doubao-pro-256k", "label": "字节豆包", "region": "cn", "tags": ["doubao", "bytedance", "cn"]},
    {"id": "hunyuan", "name": "Tencent Hunyuan", "base_url": "https://hunyuan.tencent.com/anthropic", "model": "hunyuan-pro", "label": "腾讯混元", "region": "cn", "tags": ["hunyuan", "tencent", "cn"]},
    {"id": "wenxin", "name": "Baidu Wenxin", "base_url": "https://qianfan.baidubce.com/anthropic", "model": "ernie-5.0", "label": "百度文心", "region": "cn", "tags": ["wenxin", "baidu", "cn"]},
    {"id": "spark", "name": "iFlytek Spark", "base_url": "https://spark-api-open.xf-yun.com/anthropic", "model": "spark-pro", "label": "讯飞星火", "region": "cn", "tags": ["spark", "iflytek", "cn"]},
    {"id": "yi", "name": "01.AI Yi", "base_url": "https://api.lingyiwanwu.com/anthropic", "model": "yi-large", "label": "零一万物 Yi", "region": "cn", "tags": ["yi", "01ai", "cn"]},
    {"id": "stepfun", "name": "Stepfun", "base_url": "https://api.stepfun.com/anthropic", "model": "step-3", "label": "阶跃星辰", "region": "cn", "tags": ["stepfun", "cn"]},
    {"id": "modelscope", "name": "ModelScope (Alibaba)", "base_url": "https://api-inference.modelscope.cn/anthropic", "model": "Qwen3-235B-A22B-Instruct", "label": "魔搭 ModelScope", "region": "cn", "tags": ["modelscope", "alibaba", "cn"]},
    {"id": "siliconflow", "name": "SiliconFlow", "base_url": "https://api.siliconflow.cn/anthropic", "model": "Qwen/Qwen3-235B-A22B-Instruct-2507", "label": "硅基流动", "region": "cn", "tags": ["siliconflow", "cn"]},
    {"id": "openrouter", "name": "OpenRouter", "base_url": "https://openrouter.ai/api/v1", "model": "anthropic/claude-sonnet-4.6", "label": "OpenRouter", "region": "global", "tags": ["aggregator", "openrouter"]},
    {"id": "302ai", "name": "302.AI", "base_url": "https://api.302.ai/anthropic", "model": "claude-sonnet-4-6", "label": "302.AI", "region": "global", "tags": ["aggregator", "302ai", "cn"]},
    {"id": "iflow", "name": "iFlow (心流)", "base_url": "https://apis.iflow.cn/anthropic", "model": "qwen3-max", "label": "iFlow 心流", "region": "cn", "tags": ["iflow", "alibaba", "cn"]},
    {"id": "groq", "name": "Groq", "base_url": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile", "label": "Groq", "region": "us", "tags": ["groq", "hosting"]},
    {"id": "together", "name": "Together AI", "base_url": "https://api.together.xyz/v1", "model": "meta-llama/Llama-4-405B-Instruct", "label": "Together AI", "region": "us", "tags": ["together", "hosting"]},
    {"id": "fireworks", "name": "Fireworks AI", "base_url": "https://api.fireworks.ai/inference/v1", "model": "accounts/fireworks/models/llama-v4-405b-instruct", "label": "Fireworks AI", "region": "us", "tags": ["fireworks", "hosting"]},
    {"id": "nvidia-nim", "name": "NVIDIA NIM", "base_url": "https://integrate.api.nvidia.com/v1", "model": "meta/llama-4-405b-instruct", "label": "NVIDIA NIM", "region": "us", "tags": ["nvidia", "nim"]},
    {"id": "ollama", "name": "Ollama (local)", "base_url": "http://localhost:11434/v1", "model": "llama4:405b", "label": "Ollama (本地)", "region": "local", "tags": ["local", "ollama"]},
    {"id": "vllm", "name": "vLLM (local server)", "base_url": "http://localhost:8000/v1", "model": "meta-llama/Llama-4-405B-Instruct", "label": "vLLM (本地)", "region": "local", "tags": ["local", "vllm"]},
    {"id": "lm-studio", "name": "LM Studio (local)", "base_url": "http://localhost:1234/v1", "model": "llama-4-405b-instruct", "label": "LM Studio (本地)", "region": "local", "tags": ["local", "lm-studio"]},
]

_LOCAL_FALLBACK_MCP_SERVERS: List[Dict[str, Any]] = [
    {"id": "filesystem", "name": "Filesystem MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"], "env": {}, "description": "Read/write files in a sandboxed directory", "tags": ["mcp", "fs"]},
    {"id": "github", "name": "GitHub MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": ""}, "description": "Interact with GitHub repos, issues, PRs", "tags": ["mcp", "github"]},
    {"id": "postgres", "name": "PostgreSQL MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"], "env": {}, "description": "Read-only Postgres access", "tags": ["mcp", "db", "postgres"]},
    {"id": "sqlite", "name": "SQLite MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sqlite", "/tmp/db.sqlite"], "env": {}, "description": "Local SQLite database access", "tags": ["mcp", "db", "sqlite"]},
    {"id": "puppeteer", "name": "Puppeteer MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-puppeteer"], "env": {}, "description": "Headless browser automation", "tags": ["mcp", "browser"]},
    {"id": "fetch", "name": "Fetch MCP", "command": "npx", "args": ["-y", "@kazuph/mcp-fetch"], "env": {}, "description": "HTTP fetch", "tags": ["mcp", "http"]},
    {"id": "memory", "name": "Memory MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"], "env": {}, "description": "Persistent key-value memory across sessions", "tags": ["mcp", "memory"]},
    {"id": "brave-search", "name": "Brave Search MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-brave-search"], "env": {"BRAVE_API_KEY": ""}, "description": "Web search via Brave", "tags": ["mcp", "search"]},
    {"id": "sequential-thinking", "name": "Sequential Thinking MCP", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"], "env": {}, "description": "Step-by-step reasoning helper", "tags": ["mcp", "reasoning"]},
]

# Live fetch URL — best effort, not authoritative. The hard-coded data
# above is the canonical source for v0.2.0. A maintainer runs the script,
# eyeballs the diff, and pastes the result into library.py.
_CCSWITCH_PROVIDERS_URL = (
    "https://raw.githubusercontent.com/songtianlun/cc-switch/main/internal/data/ccs_presets.json"
)


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

def _fetch_remote_providers(timeout: float = 10.0) -> Optional[List[Dict[str, Any]]]:
    """Try to fetch a fresh provider catalog from the cc-switch project.

    Returns None on any error; the caller falls back to the local list.
    """
    try:
        req = urllib.request.Request(
            _CCSWITCH_PROVIDERS_URL,
            headers={"User-Agent": "agent-box-export-ccswitch/0.2"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError):
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, list):
        return None
    # cc-switch schema (best guess): each entry has name, base_url, model
    # plus a "category" or "provider" field. We don't strictly care; we
    # pull what we recognize and skip the rest.
    out: List[Dict[str, Any]] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        slug = entry.get("id") or entry.get("slug") or entry.get("name")
        if not isinstance(slug, str):
            continue
        slug = slug.strip().lower().replace(" ", "-").replace("_", "-")
        if not slug:
            continue
        base_url = entry.get("base_url") or entry.get("baseURL") or entry.get("url")
        model = entry.get("model") or entry.get("defaultModel")
        if not base_url or not model:
            continue
        out.append(
            {
                "id": slug,
                "name": str(entry.get("name", slug)),
                "base_url": str(base_url),
                "model": str(model),
                "label": str(entry.get("label", "")),
                "region": str(entry.get("region", entry.get("category", ""))),
                "tags": list(entry.get("tags", []) or []),
            }
        )
    return out or None


# ---------------------------------------------------------------------------
# Generate the Python module
# ---------------------------------------------------------------------------

def _py_string(s: str) -> str:
    """Python-string repr for a list-of-dict value."""
    s = str(s)
    if not s:
        return '""'
    if all(c.isalnum() or c in " -_./:+" for c in s):
        return f'"{s}"'
    return json.dumps(s, ensure_ascii=False)


def render_module(
    providers: List[Dict[str, Any]],
    mcp_servers: List[Dict[str, Any]],
) -> str:
    """Produce a Python source file containing both lists."""
    lines: List[str] = []
    lines.append("# AUTOGENERATED by scripts/export_ccswitch.py — DO NOT EDIT BY HAND")
    lines.append("#")
    lines.append("# Paste the two constants below into src/agent_box/library.py")
    lines.append("# (replace the existing _BUILTIN_PROVIDERS / _BUILTIN_MCP_SERVERS")
    lines.append("# blocks with these). The shape must match — id, name, base_url,")
    lines.append("# model, label, region, tags.")
    lines.append("")
    lines.append("from __future__ import annotations")
    lines.append("from typing import Any, Dict, List")
    lines.append("")
    lines.append("_BUILTIN_PROVIDERS: List[Dict[str, Any]] = [")
    for p in providers:
        lines.append("    {")
        lines.append(f'        "id": {_py_string(p["id"])},')
        lines.append(f'        "name": {_py_string(p["name"])},')
        lines.append(f'        "base_url": {_py_string(p["base_url"])},')
        lines.append(f'        "model": {_py_string(p["model"])},')
        lines.append(f'        "label": {_py_string(p.get("label", ""))},')
        lines.append(f'        "region": {_py_string(p.get("region", ""))},')
        tags_repr = json.dumps(p.get("tags", []) or [], ensure_ascii=False)
        lines.append(f'        "tags": {tags_repr},')
        lines.append("    },")
    lines.append("]")
    lines.append("")
    lines.append("_BUILTIN_MCP_SERVERS: List[Dict[str, Any]] = [")
    for s in mcp_servers:
        lines.append("    {")
        lines.append(f'        "id": {_py_string(s["id"])},')
        lines.append(f'        "name": {_py_string(s["name"])},')
        lines.append(f'        "command": {_py_string(s.get("command", "npx"))},')
        args_repr = json.dumps(s.get("args", []) or [], ensure_ascii=False)
        lines.append(f'        "args": {args_repr},')
        env_repr = json.dumps(s.get("env", {}) or {}, ensure_ascii=False)
        lines.append(f'        "env": {env_repr},')
        lines.append(f'        "description": {_py_string(s.get("description", s.get("label", "")))},')
        tags_repr = json.dumps(s.get("tags", []) or [], ensure_ascii=False)
        lines.append(f'        "tags": {tags_repr},')
        lines.append("    },")
    lines.append("]")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(
        prog="export-ccswitch",
        description=(
            "One-shot developer tool: extract the built-in provider + MCP "
            "server lists from cc-switch (or a local file) and emit a Python "
            "module ready to paste into src/agent_box/library.py."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            examples:
              # print to stdout (uses local fallback if network fetch fails)
              python3 scripts/export_ccswitch.py

              # read from a local JSON dump
              python3 scripts/export_ccswitch.py --input ccs_presets.json -o builtins.py

              # offline mode (skip the cc-switch fetch, use the embedded baseline)
              python3 scripts/export_ccswitch.py --offline -o builtins.py
        """),
    )
    p.add_argument(
        "--input", "-i",
        help="Path to a local JSON file in cc-switch's schema (skips network fetch).",
    )
    p.add_argument(
        "--output", "-o",
        help="Path to write the generated module (default: stdout).",
    )
    p.add_argument(
        "--offline", action="store_true",
        help="Skip the network fetch; use the embedded baseline.",
    )
    p.add_argument(
        "--quiet", action="store_true",
        help="Don't print the summary line to stderr.",
    )
    args = p.parse_args(argv)

    providers: Optional[List[Dict[str, Any]]] = None
    mcp_servers: List[Dict[str, Any]] = list(_LOCAL_FALLBACK_MCP_SERVERS)

    if args.input:
        try:
            with open(args.input, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"export-ccswitch: failed to read {args.input}: {exc}", file=sys.stderr)
            return 2
        if isinstance(data, list):
            providers = data
        elif isinstance(data, dict) and "providers" in data:
            providers = data["providers"]
        if isinstance(data, dict) and "mcp_servers" in data:
            mcp_servers = data["mcp_servers"]
    elif not args.offline:
        providers = _fetch_remote_providers()

    if providers is None:
        providers = list(_LOCAL_FALLBACK_PROVIDERS)
        if not args.quiet and not args.input:
            print(
                "export-ccswitch: using local fallback (network fetch unavailable)",
                file=sys.stderr,
            )

    # Deduplicate by id (last write wins) and sort by id.
    by_id: Dict[str, Dict[str, Any]] = {}
    for p in providers:
        by_id[p["id"]] = p
    providers = [by_id[k] for k in sorted(by_id)]

    by_id = {}
    for s in mcp_servers:
        by_id[s["id"]] = s
    mcp_servers = [by_id[k] for k in sorted(by_id)]

    if not args.quiet:
        print(
            f"export-ccswitch: {len(providers)} providers, {len(mcp_servers)} mcp_servers",
            file=sys.stderr,
        )

    output = render_module(providers, mcp_servers)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(output)
        if not args.quiet:
            print(f"export-ccswitch: wrote {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
