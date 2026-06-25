/**
 * PyWebView Bridge — JavaScript ↔ Python communication
 *
 * All Python functions are exposed via window.api and return JSON strings.
 * This module wraps them with proper TypeScript types and error handling.
 */

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * Call a PyWebView bridge function and parse the JSON response.
 * Falls back to empty data if bridge is not available (dev mode).
 */
async function call<T>(fn: () => string, fallback: T): Promise<T> {
  try {
    // @ts-expect-error — window.api is injected by PyWebView at runtime
    const api = window.api
    if (!api) {
      console.warn('PyWebView bridge not available, using fallback')
      return fallback
    }
    const result = fn()
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
  // @ts-expect-error
  return typeof window.api !== 'undefined'
}

export { call }
