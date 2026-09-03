/**
 * 传输层接口（设计 §4：现有 Transport 接口的新定义平移）。
 *
 * 这是 core 自持的定义，不 import `lib/transport`；
 * 具体实现（tauri / web / remote-desktop）后续落位 `core/transport/`。
 */

/** 取消订阅句柄 */
export type UnsubscribeFn = () => void

/**
 * 可订阅流（设计 §4.1）。
 * SessionRuntime 的 events / permissions 通道均为此形状；
 * 与 Transport.subscribe 不同，退订函数同步返回。
 */
export interface Subscribable<T> {
  subscribe(listener: (value: T) => void): UnsubscribeFn
}

/** 单次调用选项：覆盖传输默认请求超时（设计 §4） */
export interface CallOptions {
  timeoutMs?: number
}

/**
 * 后端命令与事件传输接口（设计 §4）。
 * 桌面模式由 Tauri invoke 实现，服务器模式由 fetch/WS 实现。
 * UI/store 永不直接使用它，只经 port 接口（§2 铁律 4）。
 */
export interface Transport {
  /** 调用后端命令（替代 Tauri invoke()） */
  call<T>(
    command: string,
    args?: Record<string, unknown>,
    options?: CallOptions
  ): Promise<T>
  /** 订阅后端事件（替代 Tauri listen()） */
  subscribe<T>(
    event: string,
    handler: (payload: T) => void
  ): Promise<UnsubscribeFn>
  /** 是否运行在桌面 Tauri 环境 */
  isDesktop(): boolean
  /**
   * 传输重连成功后的回调注册：断线窗口内的事件可能丢失，
   * 订阅方应重取快照（§7）。仅 WS 类传输提供；IPC 传输可缺省。
   */
  onReconnect?(callback: () => void): UnsubscribeFn
  /** 等待服务端广播接收器就绪，避免重连窗口内事件被静默丢弃（§4） */
  waitForReady?(): Promise<void>
  /** 释放传输持有的资源（可选） */
  destroy?(): void
}
