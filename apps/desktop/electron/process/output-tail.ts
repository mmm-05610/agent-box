/**
 * process/output-tail.ts
 *
 * Ring-buffered tail of a child's combined stdout+stderr, attached at SPAWN
 * time — before any ownership claim, before any readiness wait — so an early
 * crash's real stderr (traceback, missing module, bad config) survives into the
 * error the caller reports instead of a bare exit code.
 *
 * This is the stdout/stderr pipe primitive: it owns the byte bound and the
 * attach/append/read shape, and knows nothing about what the child is running.
 * The noun used in `describe()` is a caller-supplied label, because only the
 * caller knows what kind of process this is.
 */

/** The two pipes this primitive attaches to, as a structural child shape. */
export interface TailableStream {
  off?: (event: 'data', listener: (chunk: unknown) => void) => unknown
  on: (event: 'data', listener: (chunk: unknown) => void) => unknown
}

export interface TailableChild {
  stderr?: TailableStream | null
  stdout?: TailableStream | null
}

export interface ProcessOutputTail {
  /** Append a chunk manually (for callers that own their own listener). */
  append(chunk: unknown): void
  /** Attach stdout/stderr data listeners to a just-spawned child. */
  attach(child: TailableChild): void
  /** Human-readable suffix for error messages, or '' when nothing buffered. */
  describe(): string
  /** The buffered tail (most recent `limit` characters), or ''. */
  text(): string
}

export const DEFAULT_OUTPUT_TAIL_LIMIT = 8192

/**
 * @param limit  Maximum characters retained (most recent wins).
 * @param label  Noun used in `describe()`, e.g. `'backend'` or `'work core'`.
 */
export function createOutputTail(limit: number = DEFAULT_OUTPUT_TAIL_LIMIT, label = 'process'): ProcessOutputTail {
  let buffer = ''

  const append = (chunk: unknown) => {
    buffer += String(chunk)

    if (buffer.length > limit) {
      buffer = buffer.slice(buffer.length - limit)
    }
  }

  return {
    append,
    attach(child) {
      child.stdout?.on('data', append)
      child.stderr?.on('data', append)
    },
    text() {
      return buffer
    },
    describe() {
      const text = buffer.trim()

      return text ? `\nRecent ${label} output:\n${text}` : ''
    }
  }
}
