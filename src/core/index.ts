/**
 * core 顶层 barrel（设计 §2 / §3）。
 *
 * core 是与产品无关的地基：domain 领域类型 + ports 接口缝 +
 * registry 扩展点。features 只准 import core/** 与 components/**，
 * 且永不直接 import core/transport（§2 铁律）。
 */
export * from "./domain"
export * from "./ports"
export * from "./registry"
