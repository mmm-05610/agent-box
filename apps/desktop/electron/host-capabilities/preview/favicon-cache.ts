/**
 * host-capabilities/preview/favicon-cache.ts
 *
 * Fetch a site's favicon once per host and remember it, including remembered
 * misses.
 *
 * Extracted from `main.ts` (E5b). The cache exists because the renderer asks for
 * a link's icon on every paint, and icons change on the order of months.
 *
 * Three properties are deliberate:
 *
 *  - **Keyed by registrable-ish host**, not by full URL, with `www.` folded away:
 *    the same site's pages share one icon, and a query string cannot multiply
 *    cache entries.
 *  - **Misses are cached too**, on a shorter TTL — otherwise a page full of dead
 *    links re-fetches on every repaint.
 *  - **In-flight requests coalesce**, so N renderers asking for one host produce
 *    one fetch.
 *
 * Persistence is debounced and `unref`'d so a pending write can never hold the
 * app open; failing to persist costs one refetch, never an error.
 */

import fs from 'node:fs'
import path from 'node:path'

import { app, net as electronNet } from 'electron'

import { type FaviconIo, resolveFavicon } from './favicon'
import { TITLE_BYTE_BUDGET, TITLE_USER_AGENT } from './fetch-policy'

const FAVICON_CACHE_LIMIT = 400

const FAVICON_TTL_MS = 30 * 24 * 60 * 60 * 1000

const FAVICON_MISS_TTL_MS = 12 * 60 * 60 * 1000

const FAVICON_TIMEOUT_MS = 6000

const FAVICON_MAX_BYTES = 256 * 1024

const FAVICON_WRITE_DEBOUNCE_MS = 3000

interface CacheEntry {
  at: number
  icon: string
}

export interface FaviconCache {
  /** The icon as a data URL, or '' when the host has none. Never rejects. */
  resolve(rawUrl: string): Promise<string>
}

export function createFaviconCache(cachePath = path.join(app.getPath('userData'), 'favicon-cache.json')): FaviconCache {
  let cache: Map<string, CacheEntry> | null = null
  let writeTimer: null | ReturnType<typeof setTimeout> = null

  const inflight = new Map<string, Promise<string>>()

  const cacheKey = (rawUrl: string): string => {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase()
    } catch {
      return ''
    }
  }

  const load = (): Map<string, CacheEntry> => {
    if (cache) {
      return cache
    }

    cache = new Map()

    try {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'))

      for (const [host, entry] of Object.entries(raw?.icons ?? {})) {
        const at = Number((entry as { at?: number })?.at)
        const icon = String((entry as { icon?: string })?.icon ?? '')

        if (Number.isFinite(at) && Date.now() - at < (icon ? FAVICON_TTL_MS : FAVICON_MISS_TTL_MS)) {
          cache.set(host, { at, icon })
        }
      }
    } catch {
      // No cache yet, or it's unreadable — resolving again is the whole cost.
    }

    return cache
  }

  const saveSoon = () => {
    if (writeTimer) {
      return
    }

    writeTimer = setTimeout(() => {
      writeTimer = null

      try {
        const icons = Object.fromEntries(load())

        fs.writeFileSync(cachePath, JSON.stringify({ icons }), 'utf8')
      } catch {
        // Cache is an optimization; failing to persist it costs one refetch.
      }
    }, FAVICON_WRITE_DEBOUNCE_MS)

    writeTimer.unref?.()
  }

  const fetchWithBudget = async (url: string, accept: string) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS)

    try {
      return await electronNet.fetch(url, {
        // Same browser-shaped identity the title fetcher uses: a plain Electron
        // UA gets a challenge page from anything behind a bot wall.
        headers: { Accept: accept, 'Accept-Language': 'en-US,en;q=0.7', 'User-Agent': TITLE_USER_AGENT },
        redirect: 'follow',
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  const io: FaviconIo = {
    fetchImage: async url => {
      const response = await fetchWithBudget(url, 'image/avif,image/webp,image/svg+xml,image/*;q=0.8,*/*;q=0.5')

      if (!response.ok) {
        return null
      }

      const buffer = await response.arrayBuffer()

      if (buffer.byteLength === 0 || buffer.byteLength > FAVICON_MAX_BYTES) {
        return null
      }

      return { bytes: new Uint8Array(buffer), mime: response.headers.get('content-type') ?? '' }
    },
    fetchText: async url => {
      const response = await fetchWithBudget(url, 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5')

      return response.ok ? (await response.text()).slice(0, TITLE_BYTE_BUDGET * 2) : ''
    }
  }

  return {
    resolve(rawUrl: string): Promise<string> {
      const key = cacheKey(String(rawUrl || '').trim())

      if (!key) {
        return Promise.resolve('')
      }

      const store = load()
      const hit = store.get(key)

      if (hit && Date.now() - hit.at < (hit.icon ? FAVICON_TTL_MS : FAVICON_MISS_TTL_MS)) {
        return Promise.resolve(hit.icon)
      }

      const existing = inflight.get(key)

      if (existing) {
        return existing
      }

      const pending = resolveFavicon(rawUrl, io)
        .catch(() => '')
        .then(icon => {
          if (store.size >= FAVICON_CACHE_LIMIT) {
            store.delete(store.keys().next().value as string)
          }

          store.set(key, { at: Date.now(), icon })
          saveSoon()
          inflight.delete(key)

          return icon
        })

      inflight.set(key, pending)

      return pending
    }
  }
}
