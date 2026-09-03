"use client"

import { useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CustomSkillsBody } from "@/components/settings/custom-skills-settings"

/**
 * "Skill Packs" settings page — the shared header + fixed toolbar over the
 * custom skills body (the one remaining pack; the curated experts / science /
 * office bundles are gone). The custom central store lives in the same shared
 * directory those packs used, so the "open central folder" action stays here.
 */
export function SkillPacksSettings() {
  const t = useTranslations("SkillPacksSettings")

  // The body publishes its reload handler here, so the fixed "Refresh" button
  // drives it without remounting it.
  const refreshRef = useRef<(() => void) | null>(null)
  const registerRefresh = useCallback((fn: () => void) => {
    refreshRef.current = fn
  }, [])

  return (
    <div className="h-full flex flex-col p-3 md:p-4">
      <div className="shrink-0 pb-4">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("description")}</p>
      </div>

      <div className="flex items-center justify-end gap-2 shrink-0 pb-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshRef.current?.()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("actions.refresh")}
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <CustomSkillsBody onRegisterRefresh={registerRefresh} />
      </div>
    </div>
  )
}
