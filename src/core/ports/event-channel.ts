/**
 * 类型化事件通道（设计 §4 / §7）。
 *
 * 承载会话流之外的产品级事实（如 conversation_status_changed，
 * §4.1 要求不混进会话流）；断线恢复统一走 onReconnect，
 * feature 在自己的 events.ts 里声明重取（§7）。
 */
import type { UnsubscribeFn } from "./transport"

/** 订阅-分发通道接口（设计 §4） */
export interface EventChannel {
  /** 订阅某个通道；payload 形状由通道名与订阅方约定 */
  subscribe<T>(channel: string, listener: (payload: T) => void): UnsubscribeFn
  /** 本地发布（web 模式下前端侧事件回放等）；不经后端 */
  publish<T>(channel: string, payload: T): void
  /**
   * 传输重连后触发（不覆盖初始连接）：断线窗口内的事件可能丢失，
   * 订阅方应在此重取自己的快照（设计 §7）。
   */
  onReconnect(listener: () => void): UnsubscribeFn
}
