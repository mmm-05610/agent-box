/**
 * PyWebView Bridge — JavaScript ↔ Python communication
 *
 * PyWebView exposes js_api as window.pywebview.api.
 * Polls for API availability since _pywebviewready may fire before React mounts.
 */

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

type ApiMethod = (...args: string[]) => Promise<string>

// Cache the API reference once it's available
let cachedApi: Record<string, ApiMethod> | null = null

/**
 * Poll for PyWebView API to be ready.
 * Returns the API object, or null if not running in PyWebView.
 */
async function getApi(): Promise<Record<string, ApiMethod> | null> {
  // Return cached if available
  if (cachedApi) return cachedApi

  // Poll every 100ms for up to 5 seconds
  for (let i = 0; i < 50; i++) {
    // @ts-expect-error
    const api = window.pywebview?.api
    if (api) {
      cachedApi = api as Record<string, ApiMethod>
      return cachedApi
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  console.warn('PyWebView bridge not available after 5s')
  return null
}

/**
 * Call a PyWebView bridge function and parse the JSON response.
 * Bridge methods are async and return JSON strings.
 */
async function call<T>(
  fn: (api: Record<string, ApiMethod>) => Promise<string>,
  fallback: T,
): Promise<T> {
  try {
    const api = await getApi()
    if (!api) {
      return fallback
    }
    const result = await fn(api)
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
  return cachedApi !== null
}

export { call }
