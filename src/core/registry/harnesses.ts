/**
 * harness 注册表（设计 §6.1）。
 *
 * 扩展动作：新 agent = 实现 SessionRuntime + 在此注册，
 * agent 选择器自动出现，零 UI 改动。
 * 模块级单例，仅做 Map 存取，不做 React 绑定。
 */
import type { HarnessDescriptor } from "../domain/agent"
import type { SessionRuntime, SessionSpec } from "../ports/session-runtime"

/** harness 注册条目 = 描述符 + 连接工厂（设计 §6.1） */
export interface HarnessDefinition extends HarnessDescriptor {
  /** 建立 runtime 实例；归一化/attach 细节全部在实现内部 */
  connect(spec: SessionSpec): SessionRuntime
}

const harnesses = new Map<string, HarnessDefinition>()

/** 注册 harness；同 id 重复注册时后者覆盖 */
export function registerHarness(definition: HarnessDefinition): void {
  harnesses.set(definition.id, definition)
}

/** 按 id 取 harness；未注册返回 undefined（调用方回退默认 harness） */
export function getHarness(id: string): HarnessDefinition | undefined {
  return harnesses.get(id)
}

/** 全部已注册 harness（agent 选择器数据源，按显示名稳定排序） */
export function listHarnesses(): HarnessDefinition[] {
  return [...harnesses.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  )
}
