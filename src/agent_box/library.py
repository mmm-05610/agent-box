"""Component library for agent-box.

Architecture (v0.3.0 rework):

* Built-in component data lives in this module as Python constants
  (``_BUILTIN_PROVIDERS``, ``_BUILTIN_MCP_SERVERS``). It is *not* seeded
  into the database; the constants are read directly on every query.

* ``$AGENT_BOX_HOME/library.db`` only contains a single table:
  ``user_overrides``. Each row records one user modification to a
  built-in component's field path
  (e.g. ``env.ANTHROPIC_AUTH_TOKEN`` for the ``deepseek`` provider).

* On read, the built-in template is loaded from the constant and
  per-field overrides from ``user_overrides`` are merged in. ``set``
  writes an override; ``unset`` deletes it; the template default
  re-emerges.

* For backwards compatibility with pre-v0.3.0 installations, the
  legacy ``components`` table (and any rows it contains) is dropped
  on the first connection to the new schema.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from . import config

# ---------------------------------------------------------------------------
# Built-in component data
# ---------------------------------------------------------------------------
#
# Each provider entry is a *complete* template. ``env`` is the full
# settings.json `env` block CC will run with; ``ANTHROPIC_AUTH_TOKEN``
# is empty by default — the user fills it in via
# `agent-box component set <id> env.ANTHROPIC_AUTH_TOKEN <key>`.
# ---------------------------------------------------------------------------

# Common env block tail — every provider has these settings.
_TIMEOUT_MS = 3000000
_DISABLE_TRAFFIC = 1


def _env_for(base_url: str, model: str,
             haiku: Optional[str] = None,
             sonnet: Optional[str] = None,
             opus: Optional[str] = None) -> Dict[str, Any]:
    """Build the standard env block for a provider template."""
    return {
        "ANTHROPIC_BASE_URL": base_url,
        "ANTHROPIC_AUTH_TOKEN": "",
        "ANTHROPIC_MODEL": model,
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": haiku or model,
        "ANTHROPIC_DEFAULT_SONNET_MODEL": sonnet or model,
        "ANTHROPIC_DEFAULT_OPUS_MODEL": opus or model,
        "API_TIMEOUT_MS": _TIMEOUT_MS,
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": _DISABLE_TRAFFIC,
    }


_BUILTIN_PROVIDERS: List[Dict[str, Any]] = [
    # === Western majors ===
    {
        "id": "anthropic",
        "name": "Anthropic (Claude)",
        "label": "Anthropic官方",
        "region": "us",
        "tags": ["official", "anthropic"],
        "env": _env_for(
            "https://api.anthropic.com",
            "claude-sonnet-4-6",
            haiku="claude-haiku-4-5",
            sonnet="claude-sonnet-4-6",
            opus="claude-opus-4-1",
        ),
    },
    {
        "id": "openai",
        "name": "OpenAI (Responses API)",
        "label": "OpenAI (经openai兼容层)",
        "region": "us",
        "tags": ["openai", "compat"],
        "env": _env_for("https://api.openai.com/v1", "gpt-5.2"),
    },
    {
        "id": "azure-openai",
        "name": "Azure OpenAI",
        "label": "Azure OpenAI",
        "region": "global",
        "tags": ["azure", "openai", "enterprise"],
        "env": _env_for(
            "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOY",
            "gpt-5.2",
        ),
    },
    {
        "id": "google-vertex",
        "name": "Google Vertex AI (Claude)",
        "label": "Google Vertex AI",
        "region": "us",
        "tags": ["google", "vertex", "anthropic"],
        "env": _env_for(
            "https://us-east5-aiplatform.googleapis.com/v1",
            "claude-sonnet-4-6@20250514",
        ),
    },
    {
        "id": "xai-grok",
        "name": "xAI (Grok)",
        "label": "xAI Grok",
        "region": "us",
        "tags": ["xai", "grok"],
        "env": _env_for("https://api.x.ai/v1", "grok-4"),
    },
    {
        "id": "mistral",
        "name": "Mistral AI",
        "label": "Mistral AI",
        "region": "eu",
        "tags": ["mistral", "eu"],
        "env": _env_for("https://api.mistral.ai/v1", "mistral-large-3"),
    },
    {
        "id": "cohere",
        "name": "Cohere",
        "label": "Cohere",
        "region": "us",
        "tags": ["cohere"],
        "env": _env_for("https://api.cohere.com/v1", "command-r-plus"),
    },
    {
        "id": "perplexity",
        "name": "Perplexity",
        "label": "Perplexity",
        "region": "us",
        "tags": ["perplexity", "search"],
        "env": _env_for("https://api.perplexity.ai", "sonar-pro"),
    },

    # === China majors ===
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "label": "DeepSeek (深度求索)",
        "region": "cn",
        "tags": ["deepseek", "cn"],
        "env": _env_for(
            "https://api.deepseek.com/anthropic",
            "deepseek-v4-pro",
            haiku="deepseek-v4-flash",
        ),
    },
    {
        "id": "mimo",
        "name": "Xiaomi MiMo",
        "label": "MiMo (小米 MiMo)",
        "region": "cn",
        "tags": ["mimo", "cn"],
        "env": {
            "ANTHROPIC_BASE_URL": "https://token-plan-cn.xiaomimimo.com/anthropic",
            "ANTHROPIC_AUTH_TOKEN": "",
            "ANTHROPIC_MODEL": "mimo-v2.5-pro",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": "mimo-v2.5",
            "ANTHROPIC_DEFAULT_SONNET_MODEL": "mimo-v2.5-pro",
            "ANTHROPIC_DEFAULT_OPUS_MODEL": "mimo-v2.5-pro",
            "DISABLE_AUTOUPDATER": 1,
            "ENABLE_TOOL_SEARCH": "true",
            "API_TIMEOUT_MS": 3000000,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
        },
    },
    {
        "id": "kimi",
        "name": "Moonshot Kimi",
        "label": "月之暗面 Kimi",
        "region": "cn",
        "tags": ["kimi", "moonshot", "cn"],
        "env": _env_for("https://api.moonshot.cn/anthropic", "kimi-k2-pro"),
    },
    {
        "id": "glm",
        "name": "Zhipu GLM",
        "label": "智谱 GLM",
        "region": "cn",
        "tags": ["glm", "zhipu", "cn"],
        "env": _env_for("https://open.bigmodel.cn/api/anthropic", "glm-5.1"),
    },
    {
        "id": "minimax",
        "name": "MiniMax",
        "label": "MiniMax (稀宇科技)",
        "region": "cn",
        "tags": ["minimax", "cn"],
        "env": _env_for("https://api.minimaxi.com/anthropic", "MiniMax-M3"),
    },
    {
        "id": "qwen",
        "name": "Alibaba Qwen (DashScope)",
        "label": "阿里通义千问",
        "region": "cn",
        "tags": ["qwen", "alibaba", "cn"],
        "env": _env_for(
            "https://dashscope.aliyuncs.com/apps/anthropic", "qwen3-max"
        ),
    },
    {
        "id": "doubao",
        "name": "Volcengine Doubao",
        "label": "字节豆包 (火山引擎)",
        "region": "cn",
        "tags": ["doubao", "bytedance", "cn"],
        "env": _env_for(
            "https://ark.cn-beijing.volces.com/api/v3", "doubao-pro-256k"
        ),
    },
    {
        "id": "hunyuan",
        "name": "Tencent Hunyuan",
        "label": "腾讯混元",
        "region": "cn",
        "tags": ["hunyuan", "tencent", "cn"],
        "env": _env_for("https://hunyuan.tencent.com/anthropic", "hunyuan-pro"),
    },
    {
        "id": "wenxin",
        "name": "Baidu Wenxin",
        "label": "百度文心",
        "region": "cn",
        "tags": ["wenxin", "baidu", "cn"],
        "env": _env_for("https://qianfan.baidubce.com/anthropic", "ernie-5.0"),
    },
    {
        "id": "spark",
        "name": "iFlytek Spark",
        "label": "讯飞星火",
        "region": "cn",
        "tags": ["spark", "iflytek", "cn"],
        "env": _env_for(
            "https://spark-api-open.xf-yun.com/anthropic", "spark-pro"
        ),
    },
    {
        "id": "yi",
        "name": "01.AI Yi",
        "label": "零一万物 Yi",
        "region": "cn",
        "tags": ["yi", "01ai", "cn"],
        "env": _env_for("https://api.lingyiwanwu.com/anthropic", "yi-large"),
    },
    {
        "id": "stepfun",
        "name": "Stepfun",
        "label": "阶跃星辰 Step",
        "region": "cn",
        "tags": ["stepfun", "cn"],
        "env": _env_for("https://api.stepfun.com/anthropic", "step-3"),
    },
    {
        "id": "modelscope",
        "name": "ModelScope (Alibaba)",
        "label": "魔搭 ModelScope",
        "region": "cn",
        "tags": ["modelscope", "alibaba", "cn"],
        "env": _env_for(
            "https://api-inference.modelscope.cn/anthropic",
            "Qwen3-235B-A22B-Instruct",
        ),
    },
    {
        "id": "siliconflow",
        "name": "SiliconFlow",
        "label": "硅基流动",
        "region": "cn",
        "tags": ["siliconflow", "cn"],
        "env": _env_for(
            "https://api.siliconflow.cn/anthropic",
            "Qwen/Qwen3-235B-A22B-Instruct-2507",
        ),
    },
    {
        "id": "baichuan",
        "name": "Baichuan",
        "label": "百川智能",
        "region": "cn",
        "tags": ["baichuan", "cn"],
        "env": _env_for("https://api.baichuan-ai.com/anthropic", "baichuan-4"),
    },
    {
        "id": "minimax-cn",
        "name": "MiniMax (海螺AI)",
        "label": "MiniMax 海螺 (旧)",
        "region": "cn",
        "tags": ["minimax", "cn", "legacy"],
        "env": _env_for("https://api.hailuoai.com/anthropic", "abab-7-plus"),
    },
    {
        "id": "inclusionai",
        "name": "InclusionAI",
        "label": "灵境AI (蚂蚁)",
        "region": "cn",
        "tags": ["inclusion", "cn"],
        "env": _env_for(
            "https://api.inclusionai.com/anthropic", "inclusion-large"
        ),
    },

    # === Aggregators / gateways ===
    {
        "id": "openrouter",
        "name": "OpenRouter",
        "label": "OpenRouter (聚合)",
        "region": "global",
        "tags": ["aggregator", "openrouter"],
        "env": _env_for(
            "https://openrouter.ai/api/v1", "anthropic/claude-sonnet-4.6"
        ),
    },
    {
        "id": "302ai",
        "name": "302.AI",
        "label": "302.AI (聚合)",
        "region": "global",
        "tags": ["aggregator", "302ai", "cn"],
        "env": _env_for("https://api.302.ai/anthropic", "claude-sonnet-4-6"),
    },
    {
        "id": "jiekou",
        "name": "Jiekou.AI",
        "label": "Jiekou.AI (API2D)",
        "region": "global",
        "tags": ["aggregator", "jiekou", "cn"],
        "env": _env_for("https://api.jiekou.ai/anthropic", "claude-sonnet-4-6"),
    },
    {
        "id": "ohmygpt",
        "name": "OhMyGPT",
        "label": "OhMyGPT (聚合)",
        "region": "global",
        "tags": ["aggregator", "ohmygpt", "cn"],
        "env": _env_for("https://api.ohmygpt.com/anthropic", "claude-sonnet-4-6"),
    },
    {
        "id": "aigcbest",
        "name": "AIGCBest",
        "label": "AIGCBest (聚合)",
        "region": "global",
        "tags": ["aggregator", "aigcbest", "cn"],
        "env": _env_for("https://api.aigcbest.top/anthropic", "claude-sonnet-4-6"),
    },
    {
        "id": "apiyi",
        "name": "Apiyi (API易)",
        "label": "Apiyi API易 (聚合)",
        "region": "global",
        "tags": ["aggregator", "apiyi", "cn"],
        "env": _env_for("https://api.apiyi.com/anthropic", "claude-sonnet-4-6"),
    },
    {
        "id": "pacval",
        "name": "Pacval",
        "label": "Pacval (聚合)",
        "region": "global",
        "tags": ["aggregator", "pacval"],
        "env": _env_for("https://api.pacval.com/anthropic", "claude-sonnet-4-6"),
    },
    {
        "id": "iflow",
        "name": "iFlow (心流)",
        "label": "iFlow 心流 (阿里)",
        "region": "cn",
        "tags": ["iflow", "alibaba", "cn"],
        "env": _env_for("https://apis.iflow.cn/anthropic", "qwen3-max"),
    },
    {
        "id": "fastgpt",
        "name": "FastGPT",
        "label": "FastGPT (聚合)",
        "region": "global",
        "tags": ["aggregator", "fastgpt"],
        "env": _env_for("https://api.fastgpt.in/anthropic", "claude-sonnet-4-6"),
    },
    {
        "id": "ppio",
        "name": "PPIO 派欧云",
        "label": "PPIO 派欧云",
        "region": "cn",
        "tags": ["ppio", "cn"],
        "env": _env_for(
            "https://api.ppinfra.com/anthropic", "Qwen3-235B-A22B-Instruct"
        ),
    },
    {
        "id": "huoshan",
        "name": "Huoshan (火山)",
        "label": "火山 (备用)",
        "region": "cn",
        "tags": ["huoshan", "cn"],
        "env": _env_for("https://api.huoshan.com/anthropic", "deepseek-v4-pro"),
    },
    {
        "id": "aliyun-bailian",
        "name": "Aliyun Bailian (百炼)",
        "label": "阿里云百炼",
        "region": "cn",
        "tags": ["alibaba", "bailian", "cn"],
        "env": _env_for(
            "https://bailian.console.aliyun.com/anthropic", "qwen3-max"
        ),
    },

    # === Western inference / hosting platforms ===
    {
        "id": "groq",
        "name": "Groq",
        "label": "Groq (LPU)",
        "region": "us",
        "tags": ["groq", "hosting"],
        "env": _env_for(
            "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"
        ),
    },
    {
        "id": "together",
        "name": "Together AI",
        "label": "Together AI",
        "region": "us",
        "tags": ["together", "hosting"],
        "env": _env_for(
            "https://api.together.xyz/v1", "meta-llama/Llama-4-405B-Instruct"
        ),
    },
    {
        "id": "fireworks",
        "name": "Fireworks AI",
        "label": "Fireworks AI",
        "region": "us",
        "tags": ["fireworks", "hosting"],
        "env": _env_for(
            "https://api.fireworks.ai/inference/v1",
            "accounts/fireworks/models/llama-v4-405b-instruct",
        ),
    },
    {
        "id": "nvidia-nim",
        "name": "NVIDIA NIM",
        "label": "NVIDIA NIM",
        "region": "us",
        "tags": ["nvidia", "nim", "hosting"],
        "env": _env_for(
            "https://integrate.api.nvidia.com/v1", "meta/llama-4-405b-instruct"
        ),
    },
    {
        "id": "novita",
        "name": "Novita AI",
        "label": "Novita AI",
        "region": "global",
        "tags": ["novita", "hosting"],
        "env": _env_for(
            "https://api.novita.ai/v3/openai",
            "meta-llama/llama-4-405b-instruct",
        ),
    },
    {
        "id": "deepinfra",
        "name": "DeepInfra",
        "label": "DeepInfra",
        "region": "global",
        "tags": ["deepinfra", "hosting"],
        "env": _env_for(
            "https://api.deepinfra.com/v1/openai",
            "meta-llama/Meta-Llama-4-405B-Instruct",
        ),
    },
    {
        "id": "replicate",
        "name": "Replicate",
        "label": "Replicate",
        "region": "us",
        "tags": ["replicate", "hosting"],
        "env": _env_for(
            "https://api.replicate.com/v1", "meta/meta-llama-4-405b-instruct"
        ),
    },
    {
        "id": "anyscale",
        "name": "Anyscale",
        "label": "Anyscale Endpoints",
        "region": "us",
        "tags": ["anyscale", "hosting"],
        "env": _env_for(
            "https://api.anyscale.com/v1", "meta-llama/Llama-4-405B-Instruct"
        ),
    },
    {
        "id": "lepton",
        "name": "Lepton AI",
        "label": "Lepton AI",
        "region": "us",
        "tags": ["lepton", "hosting"],
        "env": _env_for(
            "https://api.lepton.ai/v1", "meta-llama/Llama-4-405B-Instruct"
        ),
    },
    {
        "id": "friendli",
        "name": "FriendliAI",
        "label": "FriendliAI",
        "region": "global",
        "tags": ["friendli", "hosting"],
        "env": _env_for(
            "https://api.friendli.ai/v1", "meta-llama-4-405b-instruct"
        ),
    },
    {
        "id": "cloudflare",
        "name": "Cloudflare Workers AI",
        "label": "Cloudflare Workers AI",
        "region": "global",
        "tags": ["cloudflare", "hosting"],
        "env": _env_for(
            "https://api.cloudflare.com/client/v4/accounts/ACCOUNT/ai/v1",
            "@cf/meta/llama-4-405b-instruct",
        ),
    },
    {
        "id": "hyperbolic",
        "name": "Hyperbolic",
        "label": "Hyperbolic",
        "region": "us",
        "tags": ["hyperbolic", "hosting"],
        "env": _env_for(
            "https://api.hyperbolic.xyz/v1", "meta-llama/Llama-4-405B-Instruct"
        ),
    },
    {
        "id": "octoai",
        "name": "OctoAI",
        "label": "OctoAI",
        "region": "us",
        "tags": ["octoai", "hosting"],
        "env": _env_for(
            "https://text.octoai.run/v1", "meta-llama-4-405b-instruct"
        ),
    },
    {
        "id": "aionlabs",
        "name": "AionLabs",
        "label": "AionLabs",
        "region": "global",
        "tags": ["aionlabs", "hosting"],
        "env": _env_for("https://api.aionlabs.ai/v1", "llama-4-405b-instruct"),
    },
    {
        "id": "yandex",
        "name": "Yandex Cloud YandexGPT",
        "label": "Yandex Cloud YandexGPT",
        "region": "ru",
        "tags": ["yandex", "ru"],
        "env": _env_for(
            "https://llm.api.cloud.yandex.net/v1", "yandexgpt/latest"
        ),
    },

    # === Local / self-hosted ===
    {
        "id": "ollama",
        "name": "Ollama (local)",
        "label": "Ollama (本地)",
        "region": "local",
        "tags": ["local", "ollama"],
        "env": _env_for("http://localhost:11434/v1", "llama4:405b"),
    },
    {
        "id": "vllm",
        "name": "vLLM (local server)",
        "label": "vLLM (本地)",
        "region": "local",
        "tags": ["local", "vllm"],
        "env": _env_for(
            "http://localhost:8000/v1", "meta-llama/Llama-4-405B-Instruct"
        ),
    },
    {
        "id": "lm-studio",
        "name": "LM Studio (local)",
        "label": "LM Studio (本地)",
        "region": "local",
        "tags": ["local", "lm-studio"],
        "env": _env_for("http://localhost:1234/v1", "llama-4-405b-instruct"),
    },
]


_BUILTIN_MCP_SERVERS: List[Dict[str, Any]] = [
    {
        "id": "filesystem",
        "name": "Filesystem MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        "env": {},
        "description": "Read/write files in a sandboxed directory",
        "tags": ["mcp", "fs"],
    },
    {
        "id": "git",
        "name": "Git MCP",
        "command": "python",
        "args": ["-m", "mcp_server_git", "--repository", "C:/Users/maoqh"],
        "env": {},
        "description": "Local git operations",
        "tags": ["mcp", "git"],
    },
    {
        "id": "context7",
        "name": "Context7",
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp@latest"],
        "env": {},
        "description": "Upstash Context7 MCP server",
        "tags": ["mcp", "search", "docs"],
    },
    {
        "id": "forgecraft",
        "name": "ForgeCraft",
        "command": "npx",
        "args": ["-y", "forgecraft-mcp@latest"],
        "env": {},
        "description": "ForgeCraft MCP server",
        "tags": ["mcp", "forgecraft"],
    },
    {
        "id": "github",
        "name": "GitHub MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": ""},
        "description": "Read/create GitHub issues, PRs",
        "tags": ["mcp", "github"],
    },
    {
        "id": "puppeteer",
        "name": "Puppeteer MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
        "env": {},
        "description": "Headless browser automation",
        "tags": ["mcp", "browser"],
    },
    {
        "id": "fetch",
        "name": "Fetch MCP",
        "command": "npx",
        "args": ["-y", "@kazuph/mcp-fetch"],
        "env": {},
        "description": "HTTP fetch (alternative to native CC WebFetch)",
        "tags": ["mcp", "http"],
    },
    {
        "id": "slack",
        "name": "Slack MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-slack"],
        "env": {"SLACK_BOT_TOKEN": "", "SLACK_TEAM_ID": ""},
        "description": "Read/post Slack messages",
        "tags": ["mcp", "slack"],
    },
    {
        "id": "google-maps",
        "name": "Google Maps MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-google-maps"],
        "env": {"GOOGLE_MAPS_API_KEY": ""},
        "description": "Geocoding, directions, places",
        "tags": ["mcp", "maps"],
    },
    {
        "id": "memory",
        "name": "Memory MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-memory"],
        "env": {},
        "description": "Persistent key-value memory across sessions",
        "tags": ["mcp", "memory"],
    },
    {
        "id": "sequential-thinking",
        "name": "Sequential Thinking MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
        "env": {},
        "description": "Step-by-step reasoning helper",
        "tags": ["mcp", "reasoning"],
    },
    {
        "id": "brave-search",
        "name": "Brave Search MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-brave-search"],
        "env": {"BRAVE_API_KEY": ""},
        "description": "Web search via Brave",
        "tags": ["mcp", "search"],
    },
    {
        "id": "everything",
        "name": "Everything MCP (test/demo)",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-everything"],
        "env": {},
        "description": "Reference MCP server, used in examples and tests",
        "tags": ["mcp", "demo"],
    },
]


# ---------------------------------------------------------------------------
# Built-in profile template
# ---------------------------------------------------------------------------
#
# These constants are the *default* settings for a newly-created CC
# profile. They are pure Python data — no filesystem reads required.
#
# If the host has an existing ``$AGENT_BOX_HOME/template/dot-claude/``
# (from a pre-v0.4.0 ``init-template`` run), `profile.create()` falls
# back to that directory for ``settings.json`` so user customisations
# survive the upgrade. Everything else (settings.local.json, CLAUDE.md,
# dot-claude.json) always comes from these constants.
# ---------------------------------------------------------------------------

_TEMPLATE_SETTINGS: Dict[str, Any] = {
    "includeCoAuthoredBy": False,
    "model": "sonnet",
    "outputStyle": "explanatory",
    "skipWorkflowUsageWarning": True,
    "theme": "dark",
    "showTurnDuration": True,
    "autoCompactThreshold": 0.75,
    "hooks": {
        "PreToolUse": [
            {
                "matcher": "Bash",
                "hooks": [
                    {
                        "type": "command",
                        "command": "python -c \"import sys,json; cmd=json.load(sys.stdin)[\'tool_input\'][\'command\']; sys.exit(2 if any(op in cmd for op in [\'rm -rf\',\'git push --force\',\'git push -f\',\'git reset --hard\',\'chmod 777\', \':(){ \']) else 0)\"",
                    }
                ],
            }
        ],
        "PostToolUse": [
            {
                "matcher": "Write|Edit",
                "hooks": [
                    {
                        "type": "command",
                        "command": "npx prettier --write \"$CLAUDE_FILE\" 2>nul || true",
                    }
                ],
            }
        ],
        "Stop": [
            {
                "matcher": "always",
                "hooks": [
                    {
                        "type": "command",
                        "command": "python3 /home/maoqh/projects/obsidian-knowledge-brain/scripts/session_harvester.py --mode stop",
                    }
                ],
            }
        ],
        "SessionStart": [
            {
                "matcher": "always",
                "hooks": [
                    {
                        "type": "command",
                        "command": "python3 /home/maoqh/projects/obsidian-knowledge-brain/scripts/session_harvester.py --mode start && python3 /home/maoqh/projects/obsidian-knowledge-brain/scripts/compiler.py",
                    }
                ],
            }
        ],
    },
    "enabledPlugins": {
        "rust-analyzer-lsp@claude-plugins-official": True,
        "superpowers@superpowers-marketplace": True,
        "superpowers@claude-plugins-official": True,
        "python-dev@cc-thingz": True,
        "dev-workflow@cc-thingz": True,
    },
    "extraKnownMarketplaces": {
        "superpowers-marketplace": {
            "source": {
                "source": "github",
                "repo": "obra/superpowers-marketplace",
            }
        },
        "cc-thingz": {
            "source": {
                "source": "github",
                "repo": "alexei-led/cc-thingz",
            }
        },
    },
}

_TEMPLATE_SETTINGS_LOCAL: Dict[str, Any] = {}

_TEMPLATE_CLAUDE_MD: str = "# {name}\n\n*agent-box profile — created {date}*\n"

_TEMPLATE_CLAUDE_JSON: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Schema (user_overrides only; no seeding)
# ---------------------------------------------------------------------------

# One global lock guards the schema-bootstrap on first access. After the
# schema is in place, sqlite3's own per-connection mutex is enough.
_INIT_LOCK = threading.Lock()
_INITIALIZED: Dict[str, bool] = {}

_NEW_SCHEMA = """
CREATE TABLE IF NOT EXISTS user_overrides (
    component_type TEXT NOT NULL,
    component_id   TEXT NOT NULL,
    field_path     TEXT NOT NULL,
    field_value    TEXT NOT NULL,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (component_type, component_id, field_path)
);
CREATE INDEX IF NOT EXISTS idx_user_overrides_lookup
    ON user_overrides (component_type, component_id);
"""


class LibraryError(Exception):
    """Raised for any library operation failure."""


def library_db_path() -> Path:
    """Path to the SQLite database file. Created lazily on first call."""
    return config.agent_box_home() / "library.db"


@contextmanager
def _connect() -> Any:
    db_path = library_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


@contextmanager
def _safe_connect():
    """Like _connect, but yields None (and does not create files) when the
    DB doesn't exist yet *or* the user_overrides table is missing.

    Used by read paths so that a fresh checkout doesn't lazily create
    library.db, and so that a pre-v0.3.0 db (which has only the
    ``components`` table) can still be read by a list/show command
    before the migration runs.
    """
    db_path = library_db_path()
    if not db_path.is_file():
        yield None
        return
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        # Probe for the user_overrides table. If absent, the caller
        # sees a clean "no overrides" view; the migration that drops
        # ``components`` and creates ``user_overrides`` runs lazily on
        # the first write.
        cur = conn.execute(
            "SELECT 1 FROM sqlite_master "
            "WHERE type = 'table' AND name = 'user_overrides'"
        )
        if cur.fetchone() is None:
            conn.close()
            yield None
            return
        yield conn
        # Read-only; do not commit, do not create tables.
    finally:
        try:
            conn.close()
        except sqlite3.ProgrammingError:
            pass


def _ensure_schema() -> None:
    """Create the user_overrides table and drop any pre-v0.3.0 components table.

    Idempotent across processes. Old `components` data is discarded: it was
    just a flat-row mirror of the Python constants and is no longer needed.
    """
    db_key = str(library_db_path().resolve())
    if _INITIALIZED.get(db_key):
        return
    with _INIT_LOCK:
        if _INITIALIZED.get(db_key):
            return
        with _connect() as conn:
            # Migration: drop the pre-v0.3.0 table if present.
            conn.execute("DROP TABLE IF EXISTS components")
            conn.executescript(_NEW_SCHEMA)
        _INITIALIZED[db_key] = True


# ---------------------------------------------------------------------------
# Field-path helpers (e.g. "env.ANTHROPIC_AUTH_TOKEN" -> {env: {ANTHROPIC_AUTH_TOKEN: ...}})
# ---------------------------------------------------------------------------

def _split_field_path(path: str) -> List[str]:
    """Split a dotted field path into a list of segments.

    Empty path or path that starts/ends with '.' is rejected.
    """
    if not path:
        raise LibraryError("field path must not be empty")
    if "." in (path[0], path[-1]):
        raise LibraryError(f"malformed field path: {path!r}")
    return path.split(".")


def _deep_get(data: Dict[str, Any], path: List[str]) -> Any:
    cur: Any = data
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def _deep_set(data: Dict[str, Any], path: List[str], value: Any) -> None:
    cur = data
    for k in path[:-1]:
        nxt = cur.get(k)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[k] = nxt
        cur = nxt
    cur[path[-1]] = value


def _deep_unset(data: Dict[str, Any], path: List[str]) -> bool:
    """Remove the leaf at `path`. Returns True if something was removed."""
    if not path:
        return False
    cur: Any = data
    for k in path[:-1]:
        if not isinstance(cur, dict) or k not in cur:
            return False
        cur = cur[k]
    if isinstance(cur, dict) and path[-1] in cur:
        del cur[path[-1]]
        return True
    return False


def _coerce_value(raw: str) -> Any:
    """Decode an override value as JSON if it looks like JSON, else str.

    This lets us round-trip ints (e.g. 3000000) and booleans (e.g. 1)
    without losing type information when overlaying onto the template.
    """
    s = raw.strip()
    if s == "":
        return ""
    # Numbers and booleans/None are unambiguous; try them in turn.
    if s.lower() in ("true", "false", "null"):
        return json.loads(s.lower())
    if s.startswith(("{", "[")):
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return raw
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    return raw


def _stringify_value(value: Any) -> str:
    """Inverse of `_coerce_value` for storage in user_overrides."""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Built-in lookups (no DB)
# ---------------------------------------------------------------------------

def _find_builtin_provider(provider_id: str) -> Optional[Dict[str, Any]]:
    for row in _BUILTIN_PROVIDERS:
        if row["id"] == provider_id:
            # Return a deep-ish copy so callers can mutate freely.
            return {
                "id": row["id"],
                "name": row["name"],
                "label": row.get("label", ""),
                "region": row.get("region", ""),
                "tags": list(row.get("tags", [])),
                "env": dict(row["env"]),
                "built_in": True,
            }
    return None


def _find_builtin_mcp(mcp_id: str) -> Optional[Dict[str, Any]]:
    for row in _BUILTIN_MCP_SERVERS:
        if row["id"] == mcp_id:
            return {
                "id": row["id"],
                "name": row["name"],
                "command": row["command"],
                "args": list(row.get("args", [])),
                "env": dict(row.get("env", {})),
                "description": row.get("description", ""),
                "tags": list(row.get("tags", [])),
                "built_in": True,
            }
    return None


# ---------------------------------------------------------------------------
# Override I/O
# ---------------------------------------------------------------------------

def _load_overrides(component_type: str, component_id: str) -> Dict[str, str]:
    with _safe_connect() as conn:
        if conn is None:
            return {}
        rows = conn.execute(
            "SELECT field_path, field_value FROM user_overrides "
            "WHERE component_type = ? AND component_id = ?",
            (component_type, component_id),
        ).fetchall()
    return {r["field_path"]: r["field_value"] for r in rows}


def _has_any_overrides(component_type: str, component_id: str) -> bool:
    with _safe_connect() as conn:
        if conn is None:
            return False
        row = conn.execute(
            "SELECT 1 AS x FROM user_overrides "
            "WHERE component_type = ? AND component_id = ? LIMIT 1",
            (component_type, component_id),
        ).fetchone()
    return row is not None


def set_override(component_type: str, component_id: str,
                 field_path: str, value: str) -> None:
    """Record a user override for one field of a built-in component."""
    if component_type not in ("provider", "mcp_server"):
        raise LibraryError(
            f"unsupported component type {component_type!r} "
            f"(use 'provider' or 'mcp_server')"
        )
    if not field_path:
        raise LibraryError("field path must not be empty")
    # Verify the built-in exists; the override is meaningless without it.
    if component_type == "provider":
        if _find_builtin_provider(component_id) is None:
            raise LibraryError(f"provider not found: {component_id!r}")
    else:
        if _find_builtin_mcp(component_id) is None:
            raise LibraryError(f"mcp_server not found: {component_id!r}")
    _ensure_schema()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_overrides (component_type, component_id, field_path, field_value)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(component_type, component_id, field_path)
            DO UPDATE SET field_value = excluded.field_value,
                          updated_at  = datetime('now')
            """,
            (component_type, component_id, field_path, value),
        )


def delete_override(component_type: str, component_id: str, field_path: str) -> bool:
    """Remove a user override. Returns True if a row was deleted."""
    _ensure_schema()
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM user_overrides "
            "WHERE component_type = ? AND component_id = ? AND field_path = ?",
            (component_type, component_id, field_path),
        )
    return cur.rowcount > 0


def list_overrides(component_type: str, component_id: str) -> Dict[str, str]:
    """Return all override rows for a component, keyed by field_path."""
    return _load_overrides(component_type, component_id)


# ---------------------------------------------------------------------------
# Public read API
# ---------------------------------------------------------------------------

def get_provider(provider_id: str) -> Optional[Dict[str, Any]]:
    """Return the merged provider dict (template + user_overrides) or None.

    The returned dict has shape:
        {id, name, label, region, tags, env, built_in, overrides}
    where `env` reflects all overrides applied, and `overrides` is the
    list of field paths the user has customised.
    """
    template = _find_builtin_provider(provider_id)
    if template is None:
        return None
    overrides = _load_overrides("provider", provider_id)
    out = dict(template)
    env = dict(template["env"])
    for path, raw in overrides.items():
        try:
            segs = _split_field_path(path)
        except LibraryError:
            continue
        # Only `env.*` paths are merged today; other top-level keys are
        # reserved for future use.
        if segs[0] == "env" and len(segs) >= 2:
            _deep_set(env, segs[1:], _coerce_value(raw))
    out["env"] = env
    out["overrides"] = sorted(overrides.keys())
    return out


def get_mcp_server(mcp_id: str) -> Optional[Dict[str, Any]]:
    """Return the merged mcp_server dict (template + user_overrides) or None."""
    template = _find_builtin_mcp(mcp_id)
    if template is None:
        return None
    overrides = _load_overrides("mcp_server", mcp_id)
    out = dict(template)
    for path, raw in overrides.items():
        try:
            segs = _split_field_path(path)
        except LibraryError:
            continue
        if segs[0] == "env" and len(segs) >= 2:
            _deep_set(out["env"], segs[1:], _coerce_value(raw))
        elif segs[0] in ("args",) and len(segs) == 1:
            # Whole-list replacement is enough for now; per-index edits
            # are not part of the spec.
            try:
                out["args"] = json.loads(raw)
            except json.JSONDecodeError:
                pass
        elif segs[0] == "command" and len(segs) == 1:
            out["command"] = raw
    out["overrides"] = sorted(overrides.keys())
    return out


def list_providers() -> List[Dict[str, Any]]:
    """List all built-in providers with their override flags.

    Each entry: {id, name, label, region, tags, has_overrides, built_in}.
    """
    out: List[Dict[str, Any]] = []
    for row in _BUILTIN_PROVIDERS:
        out.append(
            {
                "id": row["id"],
                "name": row["name"],
                "label": row.get("label", ""),
                "region": row.get("region", ""),
                "tags": list(row.get("tags", [])),
                "built_in": True,
                "has_overrides": _has_any_overrides("provider", row["id"]),
            }
        )
    return out


def list_mcp_servers() -> List[Dict[str, Any]]:
    """List all built-in MCP servers with their override flags."""
    out: List[Dict[str, Any]] = []
    for row in _BUILTIN_MCP_SERVERS:
        out.append(
            {
                "id": row["id"],
                "name": row["name"],
                "command": row.get("command", ""),
                "description": row.get("description", ""),
                "tags": list(row.get("tags", [])),
                "built_in": True,
                "has_overrides": _has_any_overrides("mcp_server", row["id"]),
            }
        )
    return out


def list_components(
    type: Optional[str] = None,
    *,
    region: Optional[str] = None,
    tag: Optional[str] = None,
    include_builtin: bool = True,
) -> List[Dict[str, Any]]:
    """Combined list used by `component list`. shape matches CLI's needs."""
    out: List[Dict[str, Any]] = []
    if type in (None, "provider"):
        for p in list_providers():
            if not include_builtin and not p["has_overrides"]:
                continue
            if region and p["region"] != region:
                continue
            if tag and tag not in p["tags"]:
                continue
            out.append(
                {
                    "id": p["id"],
                    "type": "provider",
                    "name": p["name"],
                    "label": p["label"],
                    "region": p["region"],
                    "tags": p["tags"],
                    "built_in": p["built_in"],
                    "has_overrides": p["has_overrides"],
                }
            )
    if type in (None, "mcp_server"):
        for m in list_mcp_servers():
            if not include_builtin and not m["has_overrides"]:
                continue
            if tag and tag not in m["tags"]:
                continue
            out.append(
                {
                    "id": m["id"],
                    "type": "mcp_server",
                    "name": m["name"],
                    "label": m.get("description", ""),
                    "region": "",
                    "tags": m["tags"],
                    "built_in": m["built_in"],
                    "has_overrides": m["has_overrides"],
                    "command": m.get("command", ""),
                }
            )
    out.sort(key=lambda r: (r["type"], r["id"]))
    return out


def show_component(type: str, id: str) -> Dict[str, Any]:
    """Return one component as a dict; raises LibraryError if not found."""
    if type == "provider":
        p = get_provider(id)
        if p is None:
            raise LibraryError(f"component not found: provider/{id}")
        return {
            "id": p["id"],
            "type": "provider",
            "name": p["name"],
            "label": p["label"],
            "region": p["region"],
            "tags": p["tags"],
            "built_in": p["built_in"],
            "env": p["env"],
            "overrides": p["overrides"],
        }
    if type == "mcp_server":
        m = get_mcp_server(id)
        if m is None:
            raise LibraryError(f"component not found: mcp_server/{id}")
        return {
            "id": m["id"],
            "type": "mcp_server",
            "name": m["name"],
            "description": m.get("description", ""),
            "tags": m["tags"],
            "built_in": m["built_in"],
            "command": m["command"],
            "args": m["args"],
            "env": m["env"],
            "overrides": m["overrides"],
        }
    raise LibraryError(f"unsupported component type {type!r}")


# ---------------------------------------------------------------------------
# Legacy write API (still exported for `component add|delete`)
# ---------------------------------------------------------------------------
# v0.3.0 only ships built-ins; user-defined components are not part of
# the spec, but the entry points are kept for forward-compat and so
# the old test suite still imports cleanly.

def add_component(*args, **kwargs):  # pragma: no cover
    raise LibraryError(
        "user-defined components are not supported in v0.3.0 "
        "(use `agent-box component set <id> <field> <value>` to override "
        "fields on a built-in)"
    )


def delete_component(*args, **kwargs):  # pragma: no cover
    raise LibraryError(
        "user-defined components are not supported in v0.3.0 "
        "(use `agent-box component unset <id> <field>` to drop an override)"
    )


def builtin_count() -> Dict[str, int]:
    """Return {type: count} for built-in rows (always pure constants)."""
    return {
        "provider": len(_BUILTIN_PROVIDERS),
        "mcp_server": len(_BUILTIN_MCP_SERVERS),
    }


# ---------------------------------------------------------------------------
# Helpers used by `profile.apply_provider`
# ---------------------------------------------------------------------------

def get_provider_env(provider_id: str) -> Optional[Dict[str, Any]]:
    """Convenience: return just the merged env block for a provider."""
    p = get_provider(provider_id)
    if p is None:
        return None
    return p["env"]


def get_provider_ids() -> List[str]:
    """Sorted list of built-in provider ids."""
    return sorted(p["id"] for p in _BUILTIN_PROVIDERS)


# ---------------------------------------------------------------------------
# Agent type registry (v0.4.0: multi-agent support)
# ---------------------------------------------------------------------------
#
# Each agent type maps to:
#   * config_dir - the host config directory the profile is going to
#     bind-mount over inside the bwrap namespace.
#   * binary     - the executable name (looked up via shutil.which) that
#     is invoked as bwrap's child process.
#
# CC is the legacy path: the profile keeps its dot-claude/ + provider
# injection. The other three types use a single "copy the whole config
# directory and bind-mount it" strategy - no provider injection, no
# settings.json manipulation.
# ---------------------------------------------------------------------------

_AGENT_TYPES: Dict[str, Dict[str, Any]] = {
    "cc":       {"config_dir": "~/.claude",          "binary": "claude"},
    "codex":    {"config_dir": "~/.codex",           "binary": "codex"},
    "hermes":   {"config_dir": "~/.hermes",          "binary": "hermes"},
    "opencode": {"config_dir": "~/.config/opencode", "binary": "opencode",
                 "data_dir": "~/.local/share/opencode"},
}


def get_agent_types() -> List[str]:
    """Sorted list of supported agent type ids."""
    return sorted(_AGENT_TYPES.keys())


def get_agent_config(agent_type: str) -> Optional[Dict[str, Any]]:
    """Return {config_dir, binary [, data_dir]} for an agent type, or None if unknown."""
    return _AGENT_TYPES.get(agent_type)


# ---------------------------------------------------------------------------
# Per-agent template directories
# ---------------------------------------------------------------------------
#
# Each non-CC agent type has a template *directory* under
# ``agent_box/templates/<type>/`` containing a minimal, valid config.
# ``profile.create`` copies the whole directory into the profile;
# ``launch.launch`` bind-mounts the copy over the real config dir.
#
# CC uses the legacy _TEMPLATE_SETTINGS etc. constants (above) instead,
# because its config structure (settings.json with env block) warrants
# more granular handling.


def get_template_dir(agent_type: str) -> Optional[Path]:
    """Absolute path to the template directory for *agent_type*.

    Returns *None* for ``cc`` (handled separately) and for unknown
    types. The directory is guaranteed to exist on disk for all types
    shipped with the package.
    """
    if agent_type == "cc":
        return None
    p = Path(__file__).resolve().parent / "templates" / agent_type
    return p if p.is_dir() else None


def get_template_data_dir(agent_type: str) -> Optional[Path]:
    """Absolute path to the secondary data template directory, or *None*.

    Only relevant for agents that store config across two locations
    (e.g. OpenCode: config at ~/.config/opencode/, auth at ~/.local/share/opencode/).
    """
    p = Path(__file__).resolve().parent / "templates" / f"{agent_type}-data"
    return p if p.is_dir() else None
