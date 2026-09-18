export const DESKTOP_PRODUCT_RUNTIME = 'agentbox' as const

export function shouldAutostartLegacyHermes(runtime: string): boolean {
  return runtime === 'legacy-hermes'
}

export interface DesktopProductRuntimeAutostartOptions {
  onError: (error: unknown) => void
  startLegacyHermes: () => Promise<void> | void
}

export async function autostartDesktopProductRuntime(
  runtime: string,
  { onError, startLegacyHermes }: DesktopProductRuntimeAutostartOptions
): Promise<void> {
  if (!shouldAutostartLegacyHermes(runtime)) {
    return
  }

  try {
    await startLegacyHermes()
  } catch (error) {
    onError(error)
  }
}
