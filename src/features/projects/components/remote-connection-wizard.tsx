"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  Check,
  Container,
  Laptop,
  Loader2,
  Terminal,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ProjectOrigin } from "@/core/domain"
import { REMOTE_PROJECTS_UNSUPPORTED } from "../port"

/** 远程连接方式（core/domain 的 ProjectOrigin 远端三种 kind）。 */
export type RemoteConnectionMethod = "ssh" | "wsl" | "docker"

/**
 * 向导四步（S2.3 / F5）：选择方式 → 填写配置 → 连接中 → 选择目录。
 * 后端尚无远程项目命令（REMOTE_PROJECTS_UNSUPPORTED），本组件是纯 UI 骨架：
 * 第 2 步的"连接"提交按钮 disabled 并提示"后端支持即将接入"；第 3/4 步的
 * 渲染分支已就位，等 ProjectsPort.create 支持远程 origin 后只需接上真数据。
 */
export type RemoteWizardStep = "method" | "config" | "connecting" | "directory"

const STEPS: readonly RemoteWizardStep[] = [
  "method",
  "config",
  "connecting",
  "directory",
]

/** 步骤指示器的文案键（字面量键保证 next-intl 的类型化 t() 接受）。 */
const STEP_LABEL_KEYS: Record<
  RemoteWizardStep,
  "steps.method" | "steps.config" | "steps.connecting" | "steps.directory"
> = {
  method: "steps.method",
  config: "steps.config",
  connecting: "steps.connecting",
  directory: "steps.directory",
}

const METHODS: ReadonlyArray<{
  id: RemoteConnectionMethod
  icon: typeof Terminal
  labelKey: "methodSsh" | "methodWsl" | "methodDocker"
  hintKey: "methodSshHint" | "methodWslHint" | "methodDockerHint"
}> = [
  {
    id: "ssh",
    icon: Terminal,
    labelKey: "methodSsh",
    hintKey: "methodSshHint",
  },
  { id: "wsl", icon: Laptop, labelKey: "methodWsl", hintKey: "methodWslHint" },
  {
    id: "docker",
    icon: Container,
    labelKey: "methodDocker",
    hintKey: "methodDockerHint",
  },
]

export interface RemoteConnectionWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * 起始步（默认 "method"）。真实流程停在第 2 步（提交 disabled）；测试与
   * 未来接线用它直接渲染第 3/4 步的骨架分支。
   */
  initialStep?: RemoteWizardStep
}

/**
 * 远程项目连接向导（UI 骨架）。提交的 origin 直接构造 core/domain 的
 * ProjectOrigin（ssh/wsl/docker + HostRef），即未来 ProjectsPort.create 的
 * 入参形状——后端接入后无需再改本组件的数据面。
 *
 * 表单状态全部住在 `WizardBody`：Radix Dialog 关闭即卸载内容（含 Body），
 * 重开自然回到初始步——不用 reset effect，也不会把上一次的输入带过来。
 */
export function RemoteConnectionWizard({
  open,
  onOpenChange,
  initialStep = "method",
}: RemoteConnectionWizardProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <WizardBody initialStep={initialStep} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  )
}

function WizardBody({
  initialStep,
  onOpenChange,
}: {
  initialStep: RemoteWizardStep
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("ProjectTree.wizard")
  const [step, setStep] = useState<RemoteWizardStep>(initialStep)
  const [method, setMethod] = useState<RemoteConnectionMethod | null>(null)
  const [hostId, setHostId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [remotePath, setRemotePath] = useState("")

  // 领域 origin（core/domain）：向导表单 → ProjectOrigin，即 create() 入参。
  const origin: ProjectOrigin | null =
    method != null && hostId.trim() !== ""
      ? {
          kind: method,
          host: { id: hostId.trim(), label: displayName.trim() || undefined },
          path: remotePath.trim() || "/",
        }
      : null

  const stepIndex = STEPS.indexOf(step)
  const hostPlaceholder =
    method === "ssh"
      ? t("hostPlaceholderSsh")
      : method === "wsl"
        ? t("hostPlaceholderWsl")
        : method === "docker"
          ? t("hostPlaceholderDocker")
          : ""

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      {/* 步指示器：四步固定展示，当前步高亮；不可回退的未来步骤仅作预告。 */}
      <ol className="flex items-center gap-1" aria-label={t("steps.method")}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              aria-current={s === step ? "step" : undefined}
              className={cn(
                "h-1 w-full rounded-full",
                i < stepIndex
                  ? "bg-primary/40"
                  : i === stepIndex
                    ? "bg-primary"
                    : "bg-muted"
              )}
            />
            <span
              className={cn(
                "truncate text-[0.6875rem] leading-none",
                i === stepIndex ? "text-foreground" : "text-muted-foreground/70"
              )}
            >
              {t(STEP_LABEL_KEYS[s])}
            </span>
          </li>
        ))}
      </ol>

      {step === "method" ? (
        <>
          <div
            className="grid grid-cols-1 gap-2"
            role="radiogroup"
            aria-label={t("title")}
          >
            {METHODS.map(({ id, icon: Icon, labelKey, hintKey }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={method === id}
                onClick={() => setMethod(id)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left outline-none",
                  "transition-colors duration-150",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  method === id
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:bg-sidebar-accent"
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    method === id ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {t(labelKey)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(hintKey)}
                  </span>
                </span>
                {method === id ? (
                  <Check
                    aria-hidden
                    className="ml-auto size-4 shrink-0 text-primary"
                  />
                ) : null}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={method == null} onClick={() => setStep("config")}>
              {t("next")}
            </Button>
          </DialogFooter>
        </>
      ) : null}

      {step === "config" ? (
        <>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("hostLabel")}</span>
              <Input
                value={hostId}
                onChange={(e) => setHostId(e.target.value)}
                placeholder={hostPlaceholder}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("displayLabel")}</span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("displayPlaceholder")}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("pathLabel")}</span>
              <Input
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                placeholder={t("pathPlaceholder")}
                className="font-mono"
              />
            </label>
          </div>
          <DialogFooter>
            {/* 提交 disabled + 提示：远程 origin 尚无后端命令
                  （REMOTE_PROJECTS_UNSUPPORTED），接线前不可点。 */}
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {t("backendComingSoon")}
            </span>
            <Button variant="outline" onClick={() => setStep("method")}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
            <Button disabled title={REMOTE_PROJECTS_UNSUPPORTED}>
              {t("connect")}
            </Button>
          </DialogFooter>
        </>
      ) : null}

      {step === "connecting" ? (
        <>
          {/* 连接中骨架：真实进度（主机探测/鉴权）由后端命令驱动，接线前
                仅展示静态文案与远端 origin 摘要。 */}
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2
              aria-hidden
              className="size-6 animate-spin text-muted-foreground"
            />
            <p className="text-sm font-medium">{t("connectingTitle")}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {origin ? `${origin.kind}://${origin.host.id}${origin.path}` : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("config")}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
          </DialogFooter>
        </>
      ) : null}

      {step === "directory" ? (
        <>
          {/* 选择目录骨架：远端目录列表来自未来的列目录命令，接线前渲染
                占位行；确认按钮同样 disabled。 */}
          <div className="flex min-h-0 flex-col gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                aria-hidden
                className="h-8 animate-pulse rounded-md bg-muted/60"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              {t("directoryHint")}
            </p>
          </div>
          <DialogFooter>
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {t("backendComingSoon")}
            </span>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button disabled title={REMOTE_PROJECTS_UNSUPPORTED}>
              {t("addProject")}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </>
  )
}
