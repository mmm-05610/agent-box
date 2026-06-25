/**
 * PyWebView Bridge — JavaScript ↔ Python communication
 *
 * PyWebView exposes js_api as window.pywebview.api.
 * The _pywebviewready event fires when the API is available.
 * All bridge methods return Promises (async).
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
 * Wait for PyWebView API to be ready.
 * Returns the API object, or null if not running in PyWebView.
 */
async function getApi(): Promise<Record<string, ApiMethod> | null> {
  // Return cached if available
  if (cachedApi) return cachedApi

  // @ts-expect-error — pywebview is injected by PyWebView at runtime
  if (window.pywebview?.api) {
    // @ts-expect-error
    cachedApi = window.pywebview.api as Record<string, ApiMethod>
    return cachedApi
  }

  // Wait for _pywebviewready event (max 5 seconds)
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('PyWebView bridge not available after 5s, using fallback')
      resolve(null)
    }, 5000)

    // @ts-expect-error
    window.addEventListener('_pywebviewready', () => {
      clearTimeout(timeout)
      // @ts-expect-error
      cachedApi = window.pywebview.api as Record<string, ApiMethod>
      resolve(cachedApi)
    })
  })
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
      console.warn('PyWebView bridge not available, using fallback')
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
