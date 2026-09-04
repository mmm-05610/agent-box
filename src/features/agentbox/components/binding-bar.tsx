"use client"

/**
 * 绑定条（设计 §3）—— composer 常驻的紧凑单行 pill。
 *
 * 语义位置同 ZCode 截图里 agent 选择行：composer 上方一行，展示本轮
 * 确切绑定 `Codex · profile:work(v3) · model:gpt-5.4-mini · sandbox:none ·
 * continue:codex-abc123`。
 *
 * 纯展示 + 受控：五段值全部来自 props；任何一段的编辑经 onChange 回吐
 * 完整下一状态（onFieldChange 另附字段级回调）。组件自身不取数、不发请求
 * —— harness/profile 选项由调用方注入，未注入的段渲染为自由文本输入。
 * pill 内用原生 select/input（微件体量，不引 Radix）。
 */
import { cn } from "@/lib/utils"

/** 绑定条受控状态（字符串形态；"" = 未设置 / fresh） */
export interface BindingBarState {
  /** harness 类型（如 codex / claude-code） */
  harnessType: string
  /** profile 标签（如 work(v3)；发送侧负责换算成 profile_ref） */
  profileLabel: string
  /** model overlay 表达（如 gpt-5.4-mini；发送侧换算成 overlay 对象） */
  modelOverlay: string
  /** sandbox 维度（首版 none / bwrap） */
  sandbox: string
  /** 续接提示（fresh 或上游游标 id；"" = fresh） */
  continuationHint: string
}

export type BindingBarField = keyof BindingBarState

export interface BindingBarProps {
  value: BindingBarState
  /** 任一字段变更时回吐完整下一状态（受控组件的唯一写入口） */
  onChange?: (next: BindingBarState) => void
  /** 字段级回调，与 onChange 并行触发（键控订阅用） */
  onFieldChange?: (field: BindingBarField, value: string) => void
  disabled?: boolean
  /** 选项注入：提供（非空）时该段渲染为下拉，否则为自由文本输入 */
  harnessOptions?: readonly string[]
  profileOptions?: readonly string[]
  sandboxOptions?: readonly string[]
  className?: string
}

const FIELD_ORDER: readonly BindingBarField[] = [
  "harnessType",
  "profileLabel",
  "modelOverlay",
  "sandbox",
  "continuationHint",
]

const FIELD_LABELS: Record<BindingBarField, string> = {
  harnessType: "harness",
  profileLabel: "profile",
  modelOverlay: "model",
  sandbox: "sandbox",
  continuationHint: "continue",
}

/** aria-label（测试与读屏共用；保持稳定不进 i18n） */
export function bindingBarFieldLabel(field: BindingBarField): string {
  return `binding-${FIELD_LABELS[field]}`
}

const DEFAULT_SANDBOX_OPTIONS: readonly string[] = ["none", "bwrap"]

/** 受控下拉的选项集 = 当前值并入选项（值不在选项里时仍可表达） */
function mergedOptions(
  current: string,
  options: readonly string[] | undefined
): string[] {
  return current && !options?.includes(current)
    ? [current, ...(options ?? [])]
    : [...(options ?? [])]
}

export function BindingBar({
  value,
  onChange,
  onFieldChange,
  disabled = false,
  harnessOptions,
  profileOptions,
  sandboxOptions = DEFAULT_SANDBOX_OPTIONS,
  className,
}: BindingBarProps) {
  const emit = (field: BindingBarField, next: string) => {
    onFieldChange?.(field, next)
    onChange?.({ ...value, [field]: next })
  }

  const renderControl = (field: BindingBarField) => {
    const current = value[field]
    const label = bindingBarFieldLabel(field)
    const options =
      field === "sandbox"
        ? sandboxOptions
        : field === "harnessType"
          ? harnessOptions
          : field === "profileLabel"
            ? profileOptions
            : undefined

    if (options && options.length > 0) {
      return (
        <select
          aria-label={label}
          className="max-w-[10rem] cursor-pointer bg-transparent text-2xs outline-none"
          disabled={disabled}
          value={current}
          onChange={(e) => emit(field, e.target.value)}
        >
          <option value="">{FIELD_LABELS[field]}…</option>
          {mergedOptions(current, options).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }

    return (
      <input
        aria-label={label}
        className="w-28 min-w-0 bg-transparent text-2xs outline-none placeholder:text-muted-foreground/60"
        disabled={disabled}
        placeholder={FIELD_LABELS[field]}
        value={current}
        onChange={(e) => emit(field, e.target.value)}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto rounded-full border bg-muted/30 px-2 py-0.5",
        className
      )}
      data-testid="binding-bar"
    >
      {FIELD_ORDER.map((field, index) => (
        <span key={field} className="flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
              field === "harnessType"
                ? "bg-primary/10 font-medium text-foreground"
                : "text-foreground/90"
            )}
          >
            <span className="shrink-0 text-muted-foreground">
              {FIELD_LABELS[field]}
            </span>
            {renderControl(field)}
          </span>
        </span>
      ))}
    </div>
  )
}
