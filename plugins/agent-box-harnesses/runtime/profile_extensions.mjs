/**
 * AgentBox-owned Harness registration glue (Work Order 40 narrow glue).
 *
 * This file only registers profiles and declares parameters, environment, and
 * capabilities. It contains no branded execution branch, no ACP lifecycle, and
 * no native protocol translation: every profile is handed to the upstream-owned
 * factory (`createAcpRegistration`), which owns the mechanics.
 *
 * Upstream Harness Remote v3.0.2 registers `omp`, `pi`, `claude`, and `codex`.
 * Hermes Agent ships its own ACP server (`hermes acp`) but has no upstream
 * entry, so it is registered here — this is exactly the "registration,
 * parameters, environment, capability declaration" glue the reuse boundary
 * allows, and it deliberately avoids patching the upstream registry.
 */
import { HARNESS_PROFILES, harnessProfile } from "../third_party/harness_remote/bridge/src/harness-profiles.js"
import { readFileSync } from "node:fs"

const COMMON_ACP_CAPABILITIES = {
  sessions: true,
  prompt: true,
  abort: true,
  streaming: true,
  agents: false,
  diff: false,
  filesystemBrowser: true,
  questions: false,
  permissions: false,
  sessionRename: false,
  sessionDelete: false,
}

/**
 * Capability claims below are limited to what the bounded zero-credential
 * handshake actually advertised (promptCapabilities `image`;
 * sessionCapabilities `fork`/`list`/`resume`). Anything not observed stays
 * false, so an unverified ability is never reported as available.
 */
export const AGENTBOX_HARNESS_PROFILES = {
  hermes: {
    id: "hermes",
    label: "Hermes Agent",
    command: process.platform === "win32" ? "hermes.exe" : "hermes",
    args: ["acp"],
    adapterCommand: process.platform === "win32" ? "hermes.exe" : "hermes",
    // Approval policy is AgentBox-owned: the injected asynchronous permission
    // resolver decides, and an unanswered decision denies. `deny` is the
    // honest default for the prompt-less model-catalog connection too.
    permissionMode: "deny",
    modelVariantConfigIDs: [],
    capabilities: {
      ...COMMON_ACP_CAPABILITIES,
      models: false,
      todos: false,
      commands: false,
      actions: false,
      sessionRename: false,
      sessionDelete: false,
    },
    // Hermes keeps its own session store. No reviewed upstream history loader
    // exists for it, so the transcript is the live ACP stream only; native
    // journal replay is explicitly not claimed.
    historyLoader: undefined,
    journalPageWhileOwned: false,
    reloadOnHistoryRefresh: false,
  },
}

const REGISTERED = { ...HARNESS_PROFILES, ...AGENTBOX_HARNESS_PROFILES }

/**
 * Product model id -> the value that Harness's own model catalogue advertises.
 *
 * A product ProviderModel carries the model id the user confirmed
 * (`deepseek-flash`); Pi's and OpenCode's catalogues address that same model as
 * `provider/model`. The translation belongs here, in the Harness extension
 * layer, because the Server, Core, Worker and bwrap layers must never branch on
 * a Harness name: they pass one opaque string and this table is the only place
 * that knows how a given Harness spells it. A Harness with no entry passes its
 * model through untouched.
 *
 * Each Harness's own production template owns the same mapping, and the
 * per-family template tests fail if a pair disagrees.
 */
export const AGENTBOX_MODEL_ALIASES = {
  pi: { "deepseek-flash": "deepseek/deepseek-flash" },
  opencode: { "deepseek-flash": "deepseek/deepseek-flash" },
}

export function resolveNativeModel(profileID, model) {
  if (typeof model !== "string" || !model) return model
  return AGENTBOX_MODEL_ALIASES?.[profileID]?.[model] ?? model
}

export function resolveHarnessProfile(id) {
  const profile = REGISTERED[id]
  if (!profile) throw new Error(`HARNESS_PROFILE_UNREGISTERED: ${id}`)
  return profile
}

export function registeredHarnessIDs() {
  return Object.keys(REGISTERED).sort()
}

export function upstreamProfile(id) {
  return harnessProfile(id)
}

/* ---------------------------------------------------------------------------
 * 原生能力词 → canonical 能力词
 * ---------------------------------------------------------------------------
 *
 * `capabilities`（上游 profile 表与 `COMMON_ACP_CAPABILITIES`）说的是 **ACP / Harness
 * 自己的原生词汇**：sessions/prompt/abort/streaming/agents/diff/filesystemBrowser/
 * questions/permissions/sessionRename/sessionDelete…。产品的 canonical 词汇是另一套、
 * 且只有 8 个 id。两者**不是同一个东西**，所以这里给出一张**显式**映射表；没有映射
 * 项的原生能力就是"对 canonical 没有贡献"，不会被偷偷折成某个 id。
 *
 * 每条映射都要说得出理由，理由写不出来就不映射（见 UNMAPPED_NATIVE_CAPABILITIES）：
 */

/**
 * 原生布尔 → canonical id。只有值为 `true` 才算声明；缺省/`false` 一律不产生 id。
 *
 * * `prompt`      → `start`：向一个 session 发出 prompt 是"开始一轮"的原生动作。
 * * `streaming`   → `stream`：原生增量输出就是消息流。
 * * `permissions` → `permissions`：唯一同名同级的一对。
 *
 * 刻意**不**映射的（每一条都是一次可能的静默升级，因此单独列出）：
 *
 * * `abort`            → **不是** `steer`。abort 是取消正在跑的一轮；steer 是往正在跑的
 *                        一轮里注入新输入。本插件里 abort 就是 cancel（sidecar 的
 *                        `abort` op → `AcpService.abort` / driver `abort`），没有任何
 *                        代码把 abort 当成 steer 语义，所以不映射。
 * * `filesystemBrowser` → **不是** `attach`。它是"浏览宿主文件系统"的浏览器能力，与
 *                        "把附件投递给一轮消息"不是一回事。`attach` 只能由**真实附件
 *                        能力**映射；本原生词汇表里没有这样的键，所以 `attach` 没有来源。
 * * `sessions`         → 不是 canonical id。它是"有 session 概念"这个前提，`start` 与
 *                        `native_continuation` 都依赖它，但"有 session"本身既不能证明
 *                        能开始一轮，也不能证明能重开同一个 native session。
 * * `models`/`todos`/`commands`/`actions`/`diff`/`questions`/`sessionRename`/
 *   `sessionDelete`    → canonical 8 个 id 里没有对应项；它们是产品别的层面的能力，
 *                        硬塞进 capability 集合会让产品把一个没验证的东西报成已支持。
 */
export const NATIVE_CAPABILITY_TO_CANONICAL = Object.freeze({
  prompt: Object.freeze(["start"]),
  streaming: Object.freeze(["stream"]),
  permissions: Object.freeze(["permissions"]),
})

/**
 * 出现在原生声明里、但**故意**不映射到任何 canonical id 的键，附一句话理由。
 * 这张表是给审计用的：它让"我们考虑过这个键并决定不映射"变成可读事实，
 * 而不是一个看不出来的遗漏。
 */
export const UNMAPPED_NATIVE_CAPABILITIES = Object.freeze({
  abort: "cancel 语义，不是 steer；插件没有任何把 abort 当 steer 的代码",
  filesystemBrowser: "宿主机文件浏览，不是附件投递；attach 只能来自真实附件能力",
  sessions: "session 概念的存在性前提，本身不构成任何 canonical 能力",
  models: "模型选择是 control，不是 canonical 能力",
  todos: "canonical 词汇表没有对应项",
  commands: "canonical 词汇表没有对应项",
  actions: "canonical 词汇表没有对应项",
  diff: "canonical 词汇表没有对应项",
  questions: "canonical 词汇表没有对应项",
  sessionRename: "重命名不是 canonical 能力",
  sessionDelete: "删除不是 canonical 能力",
})

let capabilityDeclarationsCache

/**
 * 读受校验投影 `capability_declarations.json`（与本文件同目录）。
 *
 * **惰性 + 失败关闭**：这份文件是 Python 侧 `harnesses.toml` 的投影，测试逐项断言相等。
 * 当它在这份进程里读不到（例如某个未把它加进 bundle 的打包路径），本函数不猜、不
 * 内联第二份表，而是让上限为空——`canonicalCapabilityClaims` 于是返回空集。空集是
 * **不会抬高能力**的那个答案：调用方拿不到任何未经静态声明背书的项。
 */
export function capabilityDeclarations() {
  if (capabilityDeclarationsCache !== undefined) return capabilityDeclarationsCache
  try {
    const text = readFileSync(new URL("./capability_declarations.json", import.meta.url), "utf8")
    const document = JSON.parse(text)
    const types = document?.harnessTypes
    if (document?.schemaVersion !== 1 || !types || typeof types !== "object"
        || Array.isArray(types)) {
      throw new Error("CAPABILITY_DECLARATION_SHAPE_INVALID")
    }
    const frozen = {}
    for (const [harnessType, ids] of Object.entries(types)) {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id)) {
        throw new Error("CAPABILITY_DECLARATION_SHAPE_INVALID")
      }
      frozen[harnessType] = Object.freeze([...ids])
    }
    capabilityDeclarationsCache = Object.freeze(frozen)
  } catch {
    capabilityDeclarationsCache = Object.freeze({})
  }
  return capabilityDeclarationsCache
}

/** 一个 profile 的静态声明上限（canonical id 的 Set）；没有声明时是空集。 */
export function declaredCapabilityCeiling(profileID) {
  return new Set(capabilityDeclarations()[profileID] ?? [])
}

function assertBooleanClaims(claims, where) {
  for (const [key, value] of Object.entries(claims)) {
    if (typeof value !== "boolean") {
      throw new Error(`CAPABILITY_CLAIM_NOT_BOOLEAN: ${where}.${key} = ${JSON.stringify(value)}`)
    }
  }
  return claims
}

/**
 * 该 profile 的 canonical 能力声明集合。
 *
 * 语义：把原生声明按 `NATIVE_CAPABILITY_TO_CANONICAL` 折成 canonical id，再**与静态
 * 声明上限取交集**。因此返回集合恒 ⊆ `capability_declarations.json`（= `harnesses.toml`）
 * 里该 harness 的声明——原生声明只能收窄产品能力，**永远不能抬高**它。任何不在静态
 * 声明里的项都不会出现在返回值里，即使原生声明把它报成 `true`。
 *
 * `nativeClaims` 省略时用该 profile 自己的原生表（`REGISTERED[profileID].capabilities`）。
 * 原生驱动（如 OpenCode 这种不走 ACP profile 的 Harness）必须把驱动播发的能力显式传进来。
 *
 * 因此返回值通常**小于**静态声明：`attach` 与 `native_continuation` 在原生能力表里没有
 * 能证明它们的键（见 `UNMAPPED_NATIVE_CAPABILITIES`），它们的证据只能来自真实链门的
 * 运行时观测，而不是 ACP 播发。要读完整静态声明请用 `declaredCapabilityCeiling` /
 * `capabilityDeclarations`。
 *
 * 失败关闭：
 * * profile 不在原生表里且没有显式 `nativeClaims` → `HARNESS_PROFILE_UNREGISTERED`；
 * * profile 没有静态声明 → `HARNESS_CAPABILITY_UNDECLARED`。已知两处 id 口径不同（是既有
 *   事实，不是本函数引入的）：上游 ACP profile id 是 `claude` 而注册表的 `harness_type`
 *   是 `claude-code`；`omp` 只有上游 profile、插件没有官方 TOML 条目。两者都**不**在这里
 *   编一张 alias 表来掩盖——那会造出第二份"谁等于谁"的事实来源；调用方要用哪个 id，
 *   由声明它的那一层决定。
 * * 任何非布尔的能力值 → `CAPABILITY_CLAIM_NOT_BOOLEAN`。
 *
 * 返回按字典序排序的数组。
 */
export function canonicalCapabilityClaims(profileID, nativeClaims) {
  const profile = REGISTERED[profileID]
  let native
  if (nativeClaims === undefined) {
    if (!profile) throw new Error(`HARNESS_PROFILE_UNREGISTERED: ${profileID}`)
    native = profile.capabilities ?? {}
  } else {
    if (nativeClaims === null || typeof nativeClaims !== "object" || Array.isArray(nativeClaims)) {
      throw new Error(`CAPABILITY_CLAIM_NOT_BOOLEAN: ${profileID} claims must be an object`)
    }
    native = nativeClaims
  }
  assertBooleanClaims(native, profileID)

  const declared = capabilityDeclarations()[profileID]
  if (!Array.isArray(declared)) {
    throw new Error(`HARNESS_CAPABILITY_UNDECLARED: ${profileID}`)
  }
  const allowed = new Set(declared)

  const claimed = new Set()
  for (const [key, value] of Object.entries(native)) {
    if (value !== true) continue
    for (const id of NATIVE_CAPABILITY_TO_CANONICAL[key] ?? []) claimed.add(id)
  }
  return [...claimed].filter((id) => allowed.has(id)).sort()
}
