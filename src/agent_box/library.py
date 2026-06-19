"""Component library for agent-box v3.

Backs `agent-box component <list|show|add|delete>` and the new
provider-resolution path used by `agent-box create`.

Storage:
    $AGENT_BOX_HOME/library.db   (sqlite3, stdlib only)

On the first call to any read/write function the schema is created and
the built-in rows from `_BUILTIN_PROVIDERS` and `_BUILTIN_MCP_SERVERS`
are inserted (idempotently — INSERT OR IGNORE on the natural key). After
that, user `component add` rows live alongside the built-ins.

`providers.py` is kept as a hard-coded fallback: the `providers` module
exposes the same `env_block(name) -> dict` and `get(name) -> Spec` API,
and falls back to `library.get_provider(name)` when the built-in table
is consulted. This way old code paths keep working.

Component rows are versioned via `built_in = 1` flag; the `component
delete` subcommand refuses to remove a built-in row.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

from . import config

# ---------------------------------------------------------------------------
# Built-in component data
# ---------------------------------------------------------------------------
#
# Schema for a provider row (the JSON `config` blob is the same shape
# the rest of agent-box expects in settings.json `env`):
#
#   {
#     "ANTHROPIC_BASE_URL":         "...",
#     "ANTHROPIC_MODEL":            "...",
#     "ANTHROPIC_DEFAULT_HAIKU_MODEL":  "...",
#     "ANTHROPIC_DEFAULT_SONNET_MODEL": "...",
#     "ANTHROPIC_DEFAULT_OPUS_MODEL":   "...",
#     "API_TIMEOUT_MS":             "3000000",
#     "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
#   }
#
# API key is a placeholder; agent-box config command sets the real one.
#
# Sources: real-world cc-switch provider list (公开 API 列表), trimmed to
# the providers whose endpoints speak the Anthropic Messages API dialect
# (or claim to). Models listed are the flagship/headline model for the
# provider as of the v0.2.0 cut.
# ---------------------------------------------------------------------------

_BUILTIN_PROVIDERS: List[Dict[str, Any]] = [
    # === Western majors ===
    {
        "id": "anthropic",
        "name": "Anthropic (Claude)",
        "base_url": "https://api.anthropic.com",
        "model": "claude-sonnet-4-6",
        "label": "Anthropic官方",
        "region": "us",
        "tags": ["official", "anthropic"],
    },
    {
        "id": "openai",
        "name": "OpenAI (Responses API)",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-5.2",
        "label": "OpenAI (经openai兼容层)",
        "region": "us",
        "tags": ["openai", "compat"],
    },
    {
        "id": "azure-openai",
        "name": "Azure OpenAI",
        "base_url": "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOY",
        "model": "gpt-5.2",
        "label": "Azure OpenAI",
        "region": "global",
        "tags": ["azure", "openai", "enterprise"],
    },
    {
        "id": "google-vertex",
        "name": "Google Vertex AI (Claude)",
        "base_url": "https://us-east5-aiplatform.googleapis.com/v1",
        "model": "claude-sonnet-4-6@20250514",
        "label": "Google Vertex AI",
        "region": "us",
        "tags": ["google", "vertex", "anthropic"],
    },
    {
        "id": "xai-grok",
        "name": "xAI (Grok)",
        "base_url": "https://api.x.ai/v1",
        "model": "grok-4",
        "label": "xAI Grok",
        "region": "us",
        "tags": ["xai", "grok"],
    },
    {
        "id": "mistral",
        "name": "Mistral AI",
        "base_url": "https://api.mistral.ai/v1",
        "model": "mistral-large-3",
        "label": "Mistral AI",
        "region": "eu",
        "tags": ["mistral", "eu"],
    },
    {
        "id": "cohere",
        "name": "Cohere",
        "base_url": "https://api.cohere.com/v1",
        "model": "command-r-plus",
        "label": "Cohere",
        "region": "us",
        "tags": ["cohere"],
    },
    {
        "id": "perplexity",
        "name": "Perplexity",
        "base_url": "https://api.perplexity.ai",
        "model": "sonar-pro",
        "label": "Perplexity",
        "region": "us",
        "tags": ["perplexity", "search"],
    },

    # === China majors ===
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/anthropic",
        "model": "deepseek-v4-pro",
        "label": "DeepSeek (深度求索)",
        "region": "cn",
        "tags": ["deepseek", "cn"],
    },
    {
        "id": "kimi",
        "name": "Moonshot Kimi",
        "base_url": "https://api.moonshot.cn/anthropic",
        "model": "kimi-k2-pro",
        "label": "月之暗面 Kimi",
        "region": "cn",
        "tags": ["kimi", "moonshot", "cn"],
    },
    {
        "id": "glm",
        "name": "Zhipu GLM",
        "base_url": "https://open.bigmodel.cn/api/anthropic",
        "model": "glm-5",
        "label": "智谱 GLM",
        "region": "cn",
        "tags": ["glm", "zhipu", "cn"],
    },
    {
        "id": "minimax",
        "name": "MiniMax",
        "base_url": "https://api.minimaxi.com/anthropic",
        "model": "MiniMax-M2.7",
        "label": "MiniMax (稀宇科技)",
        "region": "cn",
        "tags": ["minimax", "cn"],
    },
    {
        "id": "qwen",
        "name": "Alibaba Qwen (DashScope)",
        "base_url": "https://dashscope.aliyuncs.com/apps/anthropic",
        "model": "qwen3-max",
        "label": "阿里通义千问",
        "region": "cn",
        "tags": ["qwen", "alibaba", "cn"],
    },
    {
        "id": "doubao",
        "name": "Volcengine Doubao",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "model": "doubao-pro-256k",
        "label": "字节豆包 (火山引擎)",
        "region": "cn",
        "tags": ["doubao", "bytedance", "cn"],
    },
    {
        "id": "hunyuan",
        "name": "Tencent Hunyuan",
        "base_url": "https://hunyuan.tencent.com/anthropic",
        "model": "hunyuan-pro",
        "label": "腾讯混元",
        "region": "cn",
        "tags": ["hunyuan", "tencent", "cn"],
    },
    {
        "id": "wenxin",
        "name": "Baidu Wenxin",
        "base_url": "https://qianfan.baidubce.com/anthropic",
        "model": "ernie-5.0",
        "label": "百度文心",
        "region": "cn",
        "tags": ["wenxin", "baidu", "cn"],
    },
    {
        "id": "spark",
        "name": "iFlytek Spark",
        "base_url": "https://spark-api-open.xf-yun.com/anthropic",
        "model": "spark-pro",
        "label": "讯飞星火",
        "region": "cn",
        "tags": ["spark", "iflytek", "cn"],
    },
    {
        "id": "yi",
        "name": "01.AI Yi",
        "base_url": "https://api.lingyiwanwu.com/anthropic",
        "model": "yi-large",
        "label": "零一万物 Yi",
        "region": "cn",
        "tags": ["yi", "01ai", "cn"],
    },
    {
        "id": "stepfun",
        "name": "Stepfun",
        "base_url": "https://api.stepfun.com/anthropic",
        "model": "step-3",
        "label": "阶跃星辰 Step",
        "region": "cn",
        "tags": ["stepfun", "cn"],
    },
    {
        "id": "modelscope",
        "name": "ModelScope (Alibaba)",
        "base_url": "https://api-inference.modelscope.cn/anthropic",
        "model": "Qwen3-235B-A22B-Instruct",
        "label": "魔搭 ModelScope",
        "region": "cn",
        "tags": ["modelscope", "alibaba", "cn"],
    },
    {
        "id": "siliconflow",
        "name": "SiliconFlow",
        "base_url": "https://api.siliconflow.cn/anthropic",
        "model": "Qwen/Qwen3-235B-A22B-Instruct-2507",
        "label": "硅基流动",
        "region": "cn",
        "tags": ["siliconflow", "cn"],
    },
    {
        "id": "baichuan",
        "name": "Baichuan",
        "base_url": "https://api.baichuan-ai.com/anthropic",
        "model": "baichuan-4",
        "label": "百川智能",
        "region": "cn",
        "tags": ["baichuan", "cn"],
    },
    {
        "id": "minimax-cn",
        "name": "MiniMax (海螺AI)",
        "base_url": "https://api.hailuoai.com/anthropic",
        "model": "abab-7-plus",
        "label": "MiniMax 海螺 (旧)",
        "region": "cn",
        "tags": ["minimax", "cn", "legacy"],
    },
    {
        "id": "inclusionai",
        "name": "InclusionAI",
        "base_url": "https://api.inclusionai.com/anthropic",
        "model": "inclusion-large",
        "label": "灵境AI (蚂蚁)",
        "region": "cn",
        "tags": ["inclusion", "cn"],
    },

    # === Aggregators / gateways ===
    {
        "id": "openrouter",
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "anthropic/claude-sonnet-4.6",
        "label": "OpenRouter (聚合)",
        "region": "global",
        "tags": ["aggregator", "openrouter"],
    },
    {
        "id": "302ai",
        "name": "302.AI",
        "base_url": "https://api.302.ai/anthropic",
        "model": "claude-sonnet-4-6",
        "label": "302.AI (聚合)",
        "region": "global",
        "tags": ["aggregator", "302ai", "cn"],
    },
    {
        "id": "jiekou",
        "name": "Jiekou.AI",
        "base_url": "https://api.jiekou.ai/anthropic",
        "model": "claude-sonnet-4-6",
        "label": "Jiekou.AI (API2D)",
        "region": "global",
        "tags": ["aggregator", "jiekou", "cn"],
    },
    {
        "id": "ohmygpt",
        "name": "OhMyGPT",
        "base_url": "https://api.ohmygpt.com/anthropic",
        "model": "claude-sonnet-4-6",
        "label": "OhMyGPT (聚合)",
        "region": "global",
        "tags": ["aggregator", "ohmygpt", "cn"],
    },
    {
        "id": "aigcbest",
        "name": "AIGCBest",
        "base_url": "https://api.aigcbest.top/anthropic",
        "model": "claude-sonnet-4-6",
        "label": "AIGCBest (聚合)",
        "region": "global",
        "tags": ["aggregator", "aigcbest", "cn"],
    },
    {
        "id": "apiyi",
        "name": "Apiyi (API易)",
        "base_url": "https://api.apiyi.com/anthropic",
        "model": "claude-sonnet-4-6",
        "label": "Apiyi API易 (聚合)",
        "region": "global",
        "tags": ["aggregator", "apiyi", "cn"],
    },
    {
        "id": "pacval",
        "name": "Pacval",
        "base_url": "https://api.pacval.com/anthropic",
        "model": "claude-sonnet-4-6",
        "label": "Pacval (聚合)",
        "region": "global",
        "tags": ["aggregator", "pacval"],
    },
    {
        "id": "iflow",
        "name": "iFlow (心流)",
        "base_url": "https://apis.iflow.cn/anthropic",
        "model": "qwen3-max",
        "label": "iFlow 心流 (阿里)",
        "region": "cn",
        "tags": ["iflow", "alibaba", "cn"],
    },
    {
        "id": "fastgpt",
        "name": "FastGPT",
        "base_url": "https://api.fastgpt.in/anthropic",
        "model": "claude-sonnet-4-6",
        "label": "FastGPT (聚合)",
        "region": "global",
        "tags": ["aggregator", "fastgpt"],
    },
    {
        "id": "ppio",
        "name": "PPIO 派欧云",
        "base_url": "https://api.ppinfra.com/anthropic",
        "model": "Qwen3-235B-A22B-Instruct",
        "label": "PPIO 派欧云",
        "region": "cn",
        "tags": ["ppio", "cn"],
    },
    {
        "id": "huoshan",
        "name": "Huoshan (火山)",
        "base_url": "https://api.huoshan.com/anthropic",
        "model": "deepseek-v4-pro",
        "label": "火山 (备用)",
        "region": "cn",
        "tags": ["huoshan", "cn"],
    },
    {
        "id": "aliyun-bailian",
        "name": "Aliyun Bailian (百炼)",
        "base_url": "https://bailian.console.aliyun.com/anthropic",
        "model": "qwen3-max",
        "label": "阿里云百炼",
        "region": "cn",
        "tags": ["alibaba", "bailian", "cn"],
    },

    # === Western inference / hosting platforms ===
    {
        "id": "groq",
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
        "label": "Groq (LPU)",
        "region": "us",
        "tags": ["groq", "hosting"],
    },
    {
        "id": "together",
        "name": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "model": "meta-llama/Llama-4-405B-Instruct",
        "label": "Together AI",
        "region": "us",
        "tags": ["together", "hosting"],
    },
    {
        "id": "fireworks",
        "name": "Fireworks AI",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "model": "accounts/fireworks/models/llama-v4-405b-instruct",
        "label": "Fireworks AI",
        "region": "us",
        "tags": ["fireworks", "hosting"],
    },
    {
        "id": "nvidia-nim",
        "name": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": "meta/llama-4-405b-instruct",
        "label": "NVIDIA NIM",
        "region": "us",
        "tags": ["nvidia", "nim", "hosting"],
    },
    {
        "id": "novita",
        "name": "Novita AI",
        "base_url": "https://api.novita.ai/v3/openai",
        "model": "meta-llama/llama-4-405b-instruct",
        "label": "Novita AI",
        "region": "global",
        "tags": ["novita", "hosting"],
    },
    {
        "id": "deepinfra",
        "name": "DeepInfra",
        "base_url": "https://api.deepinfra.com/v1/openai",
        "model": "meta-llama/Meta-Llama-4-405B-Instruct",
        "label": "DeepInfra",
        "region": "global",
        "tags": ["deepinfra", "hosting"],
    },
    {
        "id": "replicate",
        "name": "Replicate",
        "base_url": "https://api.replicate.com/v1",
        "model": "meta/meta-llama-4-405b-instruct",
        "label": "Replicate",
        "region": "us",
        "tags": ["replicate", "hosting"],
    },
    {
        "id": "anyscale",
        "name": "Anyscale",
        "base_url": "https://api.anyscale.com/v1",
        "model": "meta-llama/Llama-4-405B-Instruct",
        "label": "Anyscale Endpoints",
        "region": "us",
        "tags": ["anyscale", "hosting"],
    },
    {
        "id": "lepton",
        "name": "Lepton AI",
        "base_url": "https://api.lepton.ai/v1",
        "model": "meta-llama/Llama-4-405B-Instruct",
        "label": "Lepton AI",
        "region": "us",
        "tags": ["lepton", "hosting"],
    },
    {
        "id": "friendli",
        "name": "FriendliAI",
        "base_url": "https://api.friendli.ai/v1",
        "model": "meta-llama-4-405b-instruct",
        "label": "FriendliAI",
        "region": "global",
        "tags": ["friendli", "hosting"],
    },
    {
        "id": "cloudflare",
        "name": "Cloudflare Workers AI",
        "base_url": "https://api.cloudflare.com/client/v4/accounts/ACCOUNT/ai/v1",
        "model": "@cf/meta/llama-4-405b-instruct",
        "label": "Cloudflare Workers AI",
        "region": "global",
        "tags": ["cloudflare", "hosting"],
    },
    {
        "id": "hyperbolic",
        "name": "Hyperbolic",
        "base_url": "https://api.hyperbolic.xyz/v1",
        "model": "meta-llama/Llama-4-405B-Instruct",
        "label": "Hyperbolic",
        "region": "us",
        "tags": ["hyperbolic", "hosting"],
    },
    {
        "id": "octoai",
        "name": "OctoAI",
        "base_url": "https://text.octoai.run/v1",
        "model": "meta-llama-4-405b-instruct",
        "label": "OctoAI",
        "region": "us",
        "tags": ["octoai", "hosting"],
    },
    {
        "id": "aionlabs",
        "name": "AionLabs",
        "base_url": "https://api.aionlabs.ai/v1",
        "model": "llama-4-405b-instruct",
        "label": "AionLabs",
        "region": "global",
        "tags": ["aionlabs", "hosting"],
    },
    {
        "id": "yandex",
        "name": "Yandex Cloud YandexGPT",
        "base_url": "https://llm.api.cloud.yandex.net/v1",
        "model": "yandexgpt/latest",
        "label": "Yandex Cloud YandexGPT",
        "region": "ru",
        "tags": ["yandex", "ru"],
    },

    # === Local / self-hosted ===
    {
        "id": "ollama",
        "name": "Ollama (local)",
        "base_url": "http://localhost:11434/v1",
        "model": "llama4:405b",
        "label": "Ollama (本地)",
        "region": "local",
        "tags": ["local", "ollama"],
    },
    {
        "id": "vllm",
        "name": "vLLM (local server)",
        "base_url": "http://localhost:8000/v1",
        "model": "meta-llama/Llama-4-405B-Instruct",
        "label": "vLLM (本地)",
        "region": "local",
        "tags": ["local", "vllm"],
    },
    {
        "id": "lm-studio",
        "name": "LM Studio (local)",
        "base_url": "http://localhost:1234/v1",
        "model": "llama-4-405b-instruct",
        "label": "LM Studio (本地)",
        "region": "local",
        "tags": ["local", "lm-studio"],
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
        "id": "github",
        "name": "GitHub MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": ""},
        "description": "Interact with GitHub repos, issues, PRs",
        "tags": ["mcp", "github"],
    },
    {
        "id": "postgres",
        "name": "PostgreSQL MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
        "env": {},
        "description": "Read-only Postgres access (use a read-only role!)",
        "tags": ["mcp", "db", "postgres"],
    },
    {
        "id": "sqlite",
        "name": "SQLite MCP",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-sqlite", "/tmp/db.sqlite"],
        "env": {},
        "description": "Local SQLite database access",
        "tags": ["mcp", "db", "sqlite"],
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
# Data types
# ---------------------------------------------------------------------------

@dataclass
class Provider:
    id: str
    name: str
    base_url: str
    model: str
    label: str = ""
    region: str = ""
    tags: List[str] = field(default_factory=list)
    built_in: bool = False

    def env_block(self) -> Dict[str, str]:
        """The settings.json `env` block to inject when a profile uses this provider."""
        return {
            "ANTHROPIC_BASE_URL": self.base_url,
            "ANTHROPIC_MODEL": self.model,
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": self.model,
            "ANTHROPIC_DEFAULT_SONNET_MODEL": self.model,
            "ANTHROPIC_DEFAULT_OPUS_MODEL": self.model,
            "ANTHROPIC_AUTH_TOKEN": "sk-REPLACE_ME",
            "API_TIMEOUT_MS": "3000000",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        }


@dataclass
class McpServer:
    id: str
    name: str
    command: str
    args: List[str]
    env: Dict[str, str]
    description: str = ""
    tags: List[str] = field(default_factory=list)
    built_in: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "command": self.command,
            "args": list(self.args),
            "env": dict(self.env),
        }


# ---------------------------------------------------------------------------
# SQLite store
# ---------------------------------------------------------------------------

# One global lock guards the schema-bootstrap on first access. After the
# schema is in place, sqlite3's own per-connection mutex is enough.
_INIT_LOCK = threading.Lock()
_INITIALIZED: Dict[str, bool] = {}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS components (
    id          TEXT NOT NULL,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    config      TEXT NOT NULL,        -- JSON blob, type-specific
    label       TEXT NOT NULL DEFAULT '',
    region      TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',   -- JSON array
    built_in    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (type, id)
);
CREATE INDEX IF NOT EXISTS idx_components_type ON components(type);
CREATE INDEX IF NOT EXISTS idx_components_built_in ON components(built_in);
"""


def library_db_path() -> Path:
    """Path to the SQLite database file. Created lazily on first call."""
    return config.agent_box_home() / "library.db"


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    db_path = library_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _ensure_schema() -> None:
    """Create tables + seed built-in rows. Idempotent across processes.

    Uses an in-process flag plus a sqlite user_version to avoid racing
    with another agent-box process doing the same bootstrap.
    """
    db_key = str(library_db_path().resolve())
    if _INITIALIZED.get(db_key):
        return
    with _INIT_LOCK:
        if _INITIALIZED.get(db_key):
            return
        with _connect() as conn:
            conn.executescript(_SCHEMA)
            # Seed built-ins (idempotent).
            _seed_builtin_providers(conn)
            _seed_builtin_mcp_servers(conn)
        _INITIALIZED[db_key] = True


def _seed_builtin_providers(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    for row in _BUILTIN_PROVIDERS:
        config_json = json.dumps(
            {"base_url": row["base_url"], "model": row["model"]},
            ensure_ascii=False,
        )
        cur.execute(
            """
            INSERT OR IGNORE INTO components
                (id, type, name, config, label, region, tags, built_in)
            VALUES (?, 'provider', ?, ?, ?, ?, ?, 1)
            """,
            (
                row["id"],
                row["name"],
                config_json,
                row.get("label", ""),
                row.get("region", ""),
                json.dumps(row.get("tags", []), ensure_ascii=False),
            ),
        )


def _seed_builtin_mcp_servers(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    for row in _BUILTIN_MCP_SERVERS:
        config_json = json.dumps(
            {
                "command": row["command"],
                "args": row.get("args", []),
                "env": row.get("env", {}),
            },
            ensure_ascii=False,
        )
        cur.execute(
            """
            INSERT OR IGNORE INTO components
                (id, type, name, config, label, region, tags, built_in)
            VALUES (?, 'mcp_server', ?, ?, ?, '', ?, 1)
            """,
            (
                row["id"],
                row["name"],
                config_json,
                row.get("description", ""),
                json.dumps(row.get("tags", []), ensure_ascii=False),
            ),
        )


# ---------------------------------------------------------------------------
# Row → dataclass
# ---------------------------------------------------------------------------

def _row_to_provider(row: sqlite3.Row) -> Provider:
    cfg = json.loads(row["config"])
    return Provider(
        id=row["id"],
        name=row["name"],
        base_url=cfg.get("base_url", ""),
        model=cfg.get("model", ""),
        label=row["label"] or "",
        region=row["region"] or "",
        tags=json.loads(row["tags"] or "[]"),
        built_in=bool(row["built_in"]),
    )


def _row_to_mcp(row: sqlite3.Row) -> McpServer:
    cfg = json.loads(row["config"])
    return McpServer(
        id=row["id"],
        name=row["name"],
        command=cfg.get("command", ""),
        args=cfg.get("args", []),
        env=cfg.get("env", {}),
        description=row["label"] or "",
        tags=json.loads(row["tags"] or "[]"),
        built_in=bool(row["built_in"]),
    )


# ---------------------------------------------------------------------------
# Public read API
# ---------------------------------------------------------------------------

class LibraryError(Exception):
    """Raised for any library operation failure (id collisions, etc.)."""


def list_components(
    type: Optional[str] = None,
    *,
    region: Optional[str] = None,
    tag: Optional[str] = None,
    include_builtin: bool = True,
) -> List[Dict[str, Any]]:
    """List all components, optionally filtered by type / region / tag.

    Returns a list of plain dicts so CLI/JSON formatting is easy.
    """
    _ensure_schema()
    sql = "SELECT * FROM components WHERE 1=1"
    params: List[Any] = []
    if type:
        sql += " AND type = ?"
        params.append(type)
    if not include_builtin:
        sql += " AND built_in = 0"
    sql += " ORDER BY built_in DESC, type, id"

    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()

    out: List[Dict[str, Any]] = []
    for row in rows:
        if row["type"] == "provider":
            obj = _row_to_provider(row)
            label = obj.label
            region_val = obj.region
        else:
            obj = _row_to_mcp(row)
            label = obj.description
            region_val = ""
        if region and region_val != region:
            continue
        if tag and tag not in obj.tags:
            continue
        out.append(
            {
                "id": obj.id,
                "type": row["type"],
                "name": obj.name,
                "label": label,
                "region": region_val,
                "tags": obj.tags,
                "built_in": obj.built_in,
                "config": json.loads(row["config"]),
            }
        )
    return out


def show_component(type: str, id: str) -> Dict[str, Any]:
    """Return one component (type, id) as a dict; raises LibraryError if not found."""
    _ensure_schema()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM components WHERE type = ? AND id = ?",
            (type, id),
        ).fetchone()
    if not row:
        raise LibraryError(f"component not found: {type}/{id}")
    out = dict(row)
    out["tags"] = json.loads(out["tags"] or "[]")
    out["config"] = json.loads(out["config"])
    out["built_in"] = bool(out["built_in"])
    return out


def get_provider(id: str) -> Optional[Provider]:
    """Return the Provider for `id` (or None if not found / not a provider)."""
    _ensure_schema()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM components WHERE type = 'provider' AND id = ?",
            (id,),
        ).fetchone()
    if not row:
        return None
    return _row_to_provider(row)


# ---------------------------------------------------------------------------
# Write API
# ---------------------------------------------------------------------------

def add_component(
    type: str,
    id: str,
    name: str,
    config: Dict[str, Any],
    *,
    label: str = "",
    region: str = "",
    tags: Optional[List[str]] = None,
) -> None:
    """Insert a user-defined component. Refuses to overwrite a built-in row."""
    _ensure_schema()
    if type not in ("provider", "mcp_server"):
        raise LibraryError(
            f"unsupported component type {type!r} (use 'provider' or 'mcp_server')"
        )
    config_json = json.dumps(config, ensure_ascii=False)
    with _connect() as conn:
        existing = conn.execute(
            "SELECT built_in FROM components WHERE type = ? AND id = ?",
            (type, id),
        ).fetchone()
        if existing and existing["built_in"]:
            raise LibraryError(
                f"{type}/{id}: built-in component, refusing to overwrite. "
                f"Delete it first (will fail) or pick a different id."
            )
        if existing:
            conn.execute(
                """
                UPDATE components
                SET name = ?, config = ?, label = ?, region = ?, tags = ?, built_in = 0
                WHERE type = ? AND id = ?
                """,
                (
                    name,
                    config_json,
                    label,
                    region,
                    json.dumps(tags or [], ensure_ascii=False),
                    type,
                    id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO components
                    (id, type, name, config, label, region, tags, built_in)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    id,
                    type,
                    name,
                    config_json,
                    label,
                    region,
                    json.dumps(tags or [], ensure_ascii=False),
                ),
            )


def delete_component(type: str, id: str, *, force: bool = False) -> bool:
    """Delete a user-defined component. Refuses to touch built-ins.

    Returns True if a row was removed, False otherwise.
    """
    _ensure_schema()
    with _connect() as conn:
        row = conn.execute(
            "SELECT built_in, name FROM components WHERE type = ? AND id = ?",
            (type, id),
        ).fetchone()
        if not row:
            if force:
                return False
            raise LibraryError(f"component not found: {type}/{id}")
        if row["built_in"]:
            raise LibraryError(
                f"{type}/{id}: built-in component, refusing to delete. "
                f"Pick a different id for your custom override."
            )
        conn.execute(
            "DELETE FROM components WHERE type = ? AND id = ?",
            (type, id),
        )
    return True


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------

def builtin_count() -> Dict[str, int]:
    """Return {type: count} for built-in rows (useful for status output)."""
    _ensure_schema()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT type, COUNT(*) AS n FROM components WHERE built_in = 1 GROUP BY type"
        ).fetchall()
    return {row["type"]: row["n"] for row in rows}
