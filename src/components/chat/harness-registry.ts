/**
 * harnesses 注册表 ⇄ ACP agent 列表的桥（F6 接线 1，设计 §6.1 / §9-1）。
 *
 * 数据流：`acpListAgents()` 的 `AcpAgentInfo[]` 在这里包装成
 * `HarnessDefinition` 注册进 `core/registry/harnesses`；agent 选择器
 * （agent-selector.tsx）改为遍历注册表渲染，UI 外观不变。
 *
 * 扩展剧本 1（加 harness）：`registerHarness(fake)` 之后
 * `harnessOptionsFromRegistry()` 的返回里自动出现该条目 —— 选择器
 * 数据源即注册表，不需要改任何 UI 代码。
 *
 * 本模块只做数据桥接（纯函数），不做 React 绑定；选择器经
 * `useAcpAgents()` 拿到列表后调用这里同步注册表。
 */
import type { HarnessCapabilities } from "@/core/domain/agent"
import type { SessionRuntime, SessionSpec } from "@/core/ports/session-runtime"
import { getHarness, listHarnesses, registerHarness } from "@/core/registry"
import type { HarnessDefinition } from "@/core/registry"
import { getAgentLabel } from "@/lib/custom-agents"
import type { AcpAgentInfo } from "@/lib/types"

/**
 * ACP harness 的能力开关。当前所有 ACP agent 经同一命令面连接
 * （resume / cancel / 计划审批 / 问询），附件走 ACP content blocks，
 * 所以给一套保守默认；harness 专有差异将来在 `custom` 里挂键。
 */
export function acpHarnessCapabilities(
  agent: AcpAgentInfo
): HarnessCapabilities {
  return {
    supportsResume: true,
    supportsCancel: true,
    supportsAttachments: true,
    supportsPlanApproval: true,
    supportsQuestions: true,
    custom: {
      registryId: agent.registry_id,
      isAcpAdapter: agent.is_acp_adapter,
    },
  }
}

/**
 * connect 工厂占位：ACP 通道还没有 SessionRuntime 实现（F2 落位后由
 * `features/session/runtime.ts` 替换）。注册表条目的元数据（id /
 * displayName / icon / capabilities）现在就被选择器消费，connect 在
 * 真正建连前不会被调用 —— 真被调到了给一个指向明确的错误。
 */
function unimplementedAcpConnect(spec: SessionSpec): SessionRuntime {
  throw new Error(
    `ACP harness "${spec.harnessId}" 的 SessionRuntime 尚未接线（等待 F2 运行时落位）`
  )
}

/** 把一个 ACP agent 包装成 harness 注册条目 */
export function harnessDefinitionFromAgent(
  agent: AcpAgentInfo,
  connect: HarnessDefinition["connect"] = unimplementedAcpConnect
): HarnessDefinition {
  const previous = getHarness(agent.agent_type)
  return {
    id: agent.agent_type,
    // displayName 走 getAgentLabel：内置用品牌名、custom 用用户命名
    displayName: getAgentLabel(agent.agent_type),
    // 图标标识 = agent type；消费方（AgentIcon）按它映射图标资源
    icon: agent.agent_type,
    description: agent.description || undefined,
    capabilities: acpHarnessCapabilities(agent),
    // 保留外部（扩展剧本）注册的 connect 工厂，不被同步覆盖
    connect: previous?.connect ?? connect,
  }
}

/**
 * 曾经由 ACP 列表同步进注册表的 id。让 ACP 部分成为自身 id 的权威源：
 * 一个曾出现在 ACP 列表、后来从列表消失的 harness（后端卸载 / 停用）
 * 不再作为“注册表扩展”回流进选择器 —— 只有从未经 ACP 同步过的条目
 * （扩展直接 registerHarness、测试假件）才算注册表独有。
 */
const acpSyncedIds = new Set<string>()

/** 把 ACP agent 列表同步进 harness 注册表（幂等，同 id 覆盖元数据） */
export function syncAcpAgentsToHarnesses(agents: AcpAgentInfo[]): void {
  for (const agent of agents) {
    registerHarness(harnessDefinitionFromAgent(agent))
    acpSyncedIds.add(agent.agent_type)
  }
}

/** 选择器数据源的单个选项：注册表条目 +（若有）ACP 可用性信息 */
export interface HarnessOption {
  harness: HarnessDefinition
  /**
   * 对应的 ACP agent。来自 `acpListAgents` 的条目带着可用性 /
   * 安装状态；扩展剧本直接 `registerHarness` 注册的 harness 没有
   * ACP 侧信息（`null`），按可用处理。
   */
  agent: AcpAgentInfo | null
}

/**
 * 选择器数据源 = harness 注册表（F6 后唯一事实来源）。
 *
 * 顺序规则（保持现有外观）：ACP 列表里的 agent 保持其自身顺序
 * （后端按 sort_order 排），注册表独有的 harness（扩展注册、测试
 * 假件）追加在末尾并按 displayName 稳定排序。禁用（enabled=false）
 * 的 agent 与现状一致不出现；曾同步过但已从 ACP 列表消失的 harness
 * 也不回流（见 `acpSyncedIds`）—— ACP 对自己的 id 是权威源。
 */
export function harnessOptionsFromRegistry(
  agents: AcpAgentInfo[]
): HarnessOption[] {
  syncAcpAgentsToHarnesses(agents)

  const enabled = agents.filter((agent) => agent.enabled)

  const known: HarnessOption[] = []
  for (const agent of enabled) {
    const harness = getHarness(agent.agent_type)
    if (harness) known.push({ harness, agent })
  }

  const extras: HarnessOption[] = listHarnesses()
    .filter((harness) => !acpSyncedIds.has(harness.id))
    .map((harness) => ({ harness, agent: null }))

  return [...known, ...extras]
}
