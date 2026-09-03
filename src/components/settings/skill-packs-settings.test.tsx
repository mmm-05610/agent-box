import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect } from "react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Spy the refresh handler the body registers with the fixed toolbar. Hoisted
// so the (hoisted) vi.mock factory can capture it.
const { registeredRefresh } = vi.hoisted(() => ({ registeredRefresh: vi.fn() }))

// Stub the heavy body so this exercises only the page's own concern (shared
// header + fixed toolbar), not its async data-loading.
vi.mock("@/components/settings/custom-skills-settings", () => ({
  CustomSkillsBody: ({
    onRegisterRefresh,
  }: {
    onRegisterRefresh?: (fn: () => void) => void
  }) => {
    useEffect(() => {
      onRegisterRefresh?.(registeredRefresh)
    }, [onRegisterRefresh])
    return <div data-testid="custom-body" />
  },
}))

import { SkillPacksSettings } from "./skill-packs-settings"
import enMessages from "@/i18n/messages/en.json"

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SkillPacksSettings />
    </NextIntlClientProvider>
  )
}

describe("SkillPacksSettings", () => {
  beforeEach(() => {
    registeredRefresh.mockClear()
  })

  it("renders the shared header, the fixed toolbar, and the custom body", () => {
    renderPage()
    expect(screen.getByText("Skill Packs")).toBeInTheDocument()
    expect(
      screen.getByText(enMessages.SkillPacksSettings.description)
    ).toBeInTheDocument()
    expect(screen.getByTestId("custom-body")).toBeInTheDocument()
    // The fixed toolbar: only Refresh remains (the central-folder button went
    // with the curated expert/science/office packs).
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument()
  })

  it("drives the body's registered handler from the fixed Refresh button", async () => {
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(registeredRefresh).toHaveBeenCalledTimes(1)
  })
})
