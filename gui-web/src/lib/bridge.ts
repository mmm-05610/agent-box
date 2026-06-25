/**
 * PyWebView Bridge — JavaScript ↔ Python communication
 *
 * PyWebView exposes js_api as window.pywebview.api (not window.api).
 * The _pywebviewready event fires when the API is available.
 */

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * Get the PyWebView API object.
 * Returns null if not running in PyWebView.
 */
function getApi(): Record<string, (...args: string[]) => string> | null {
  // @ts-expect-error — pywebview is injected by PyWebView at runtime
  const pywebview = window.pywebview
  if (!pywebview?.api) {
    return null
  }
  return pywebview.api
}

/**
 * Call a PyWebView bridge function and parse the JSON response.
 * Falls back to empty data if bridge is not available (dev mode).
 */
async function call<T>(fn: (api: Record<string, (...args: string[]) => string>) => string, fallback: T): Promise<T> {
  try {
    const api = getApi()
    if (!api) {
      console.warn('PyWebView bridge not available, using fallback')
      return fallback
    }
    const result = fn(api)
    const parsed: ApiResponse<T> = JSON.parse(result)
    if (!parsed.ok) {
      throw new Error(parsed.error ?? 'Unknown error')
    }
    return parsed.data ?? fallback
  } catch (e) {
    console.error('Bridge call failed:', e)
    throw e
  }
}

/**
 * Check if PyWebView bridge is available.
 */
export function isBridgeAvailable(): boolean {
  return getApi() !== null
}

export { call }
