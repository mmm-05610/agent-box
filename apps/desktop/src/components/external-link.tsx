import type { ComponentProps, ReactNode } from 'react'
import { useMemo } from 'react'

import { resolveBrandIcon } from '@/lib/brand-icon'
import {
  hostPathLabel,
  hudForcesNativeLinks,
  normalizeExternalUrl,
  openExternalLink,
  parseUrl,
  shortHostLabel,
  urlSlugTitleLabel,
  useLinkTitle,
  wantsNativeBrowser
} from '@/lib/external-link'
import { ArrowUpRight } from '@/lib/icons'
import { cn } from '@/lib/utils'

const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<>"'`]+[^\s<>"'`.,;:!?)]|[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}(?:\/[^\s<>"'`.,;:!?)]*)?/gi

// Explicit-scheme / www. URLs only — no bare-domain matching. Used where the
// surrounding text is full of filename-shaped tokens (e.g. `agent.log`,
// `errors.log` in a /debug report) that the bare-domain branch of URL_RE would
// otherwise mistake for domains and linkify.
const EXPLICIT_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+[^\s<>"'`.,;:!?)]/gi

/**
 * Where a link the user clicked should open.
 *
 * A web page opens in the in-app browser — that pane exists so reading a doc
 * doesn't cost a context switch out of Hermes, and it is the surface the agent
 * can see. ⌘/Ctrl-click (or middle-click) escapes to the real browser, which is
 * where you go for anything needing your logged-in session or a password.
 *
 * Everything that ISN'T a web page — `mailto:`, `file:`, a custom scheme — has
 * no business in the webview and always hands off to the OS. The HUD has no
 * browser pane, so it always takes the OS path.
 */
export function openLink(href: string, options: { native?: boolean } = {}): void {
  const target = normalizeExternalUrl(href)

  if (!target) {
    return
  }

  if (options.native || hudForcesNativeLinks() || !/^https?:$/i.test(parseUrl(target)?.protocol ?? '')) {
    openExternalLink(target)

    return
  }

  // Lazy: this module is no longer a leaf every surface imports, and the
  // preview store pulls the layout/session graph behind it. A static edge
  // would make one link helper drag that whole tree into anything that
  // renders a link. The tab lands a microtask later, which is invisible.
  void import('@/store/preview').then(({ openPreview }) =>
    openPreview({ kind: 'url', label: hostPathLabel(target), source: target, url: target }, 'explicit-link')
  )
}

interface ExternalLinkProps extends Omit<ComponentProps<'a'>, 'href' | 'target'> {
  href: string
  children?: ReactNode
  /** Skip the in-app pane. For links whose whole point is the session you are
   *  signed into over there — a cloud console, an account page. */
  native?: boolean
  showExternalIcon?: boolean
}

export function ExternalLinkIcon({ className }: { className?: string }) {
  return <ArrowUpRight aria-hidden className={cn('ml-1 inline size-[0.78em] align-[-0.08em] opacity-70', className)} />
}

// Brand mark for a known host, sized in `em` so it tracks the surrounding text
// at any font size. It paints in `currentColor` rather than the brand hex —
// several brand colors (GitHub's near-black, Unity's white) vanish against one
// theme or the other.
//
// `title=""` is load-bearing: Simple Icons always renders a <title> defaulting
// to the brand name, which lands in the anchor's textContent and accessible
// name — a PR link would read "GitHub#123".
export function LinkBrandIcon({ className, href }: { className?: string; href: string }) {
  const Icon = resolveBrandIcon(shortHostLabel(href))

  return Icon ? (
    <Icon aria-hidden className={cn('mr-1 inline size-[0.85em] align-[-0.12em] opacity-80', className)} title="" />
  ) : null
}

export function ExternalLink({
  children,
  className,
  href,
  native = false,
  onClick,
  showExternalIcon = false,
  ...rest
}: ExternalLinkProps) {
  const target = normalizeExternalUrl(href)

  // No menu wiring here: the app context-menu coordinator resolves a
  // right-click on any `a[href]` to the link menu (open in-app / open
  // external / copy URL / copy resolved URL).
  return (
    <a
      className={cn('ref', className)}
      href={target}
      // Middle-click never fires `click`; it's the other half of the
      // open-elsewhere convention, so it has to be caught on its own.
      onAuxClick={event => {
        if (event.button !== 1) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        openExternalLink(target)
      }}
      onClick={event => {
        event.stopPropagation()
        onClick?.(event)

        if (event.defaultPrevented) {
          return
        }

        event.preventDefault()
        openLink(target, { native: native || wantsNativeBrowser(event.nativeEvent) })
      }}
      rel="noopener noreferrer"
      target="_blank"
      {...rest}
    >
      {children ?? urlSlugTitleLabel(target)}
      {showExternalIcon && <ExternalLinkIcon />}
    </a>
  )
}

interface PrettyLinkProps extends Omit<ComponentProps<'a'>, 'href' | 'target'> {
  href: string
  label?: string
  fallbackLabel?: string
}

// Title resolution is a fallback, not an override. Both props carry authored
// text — chat markdown passes `fallbackLabel` — so either one skips the fetch.
export function PrettyLink({ className, fallbackLabel, href, label, ...rest }: PrettyLinkProps) {
  const target = useMemo(() => normalizeExternalUrl(href), [href])
  const authoredLabel = label?.trim() || fallbackLabel?.trim()
  const fetched = useLinkTitle(authoredLabel ? null : target)
  const display = authoredLabel || fetched || urlSlugTitleLabel(target)

  return (
    <ExternalLink className={cn('wrap-break-word', className)} href={target} title={target} {...rest}>
      <LinkBrandIcon href={target} />
      {display}
    </ExternalLink>
  )
}

interface LinkifiedTextProps {
  className?: string
  text: string
  pretty?: boolean
  explicitOnly?: boolean
}

export function LinkifiedText({ className, explicitOnly = false, pretty = true, text }: LinkifiedTextProps) {
  const nodes: ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(explicitOnly ? EXPLICIT_URL_RE : URL_RE)) {
    const raw = match[0]
    const url = normalizeExternalUrl(raw)
    const index = match.index ?? 0

    if (index > cursor) {
      nodes.push(text.slice(cursor, index))
    }

    nodes.push(
      pretty ? (
        <PrettyLink href={url} key={`${url}-${index}`} />
      ) : (
        <ExternalLink href={url} key={`${url}-${index}`}>
          {raw}
        </ExternalLink>
      )
    )

    cursor = index + raw.length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return <span className={className}>{nodes.length ? nodes : text}</span>
}

const MD_LINK_RE = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g

/**
 * Inline `[label](url)` and nothing else.
 *
 * For short authored strings — a catalog entry's setup steps — where the
 * label carries the meaning ("enable the Docs API") and the URL is a console
 * page whose own title is useless or, behind a login wall, actively wrong.
 * `LinkifiedText` can't serve this: it finds bare URLs and guesses a label.
 * Full markdown is the other extreme, a block renderer inside a card row.
 *
 * These open in the real browser. The destination is a console the user is
 * already signed into there, and the work is a form to fill in and a secret to
 * copy back — none of which the in-app pane is for.
 */
export function MarkdownLinkText({ className, text }: { className?: string; text: string }) {
  const nodes: ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(MD_LINK_RE)) {
    const [raw, label, href] = match
    const index = match.index ?? 0

    if (index > cursor) {
      nodes.push(text.slice(cursor, index))
    }

    nodes.push(
      <ExternalLink href={href} key={`${href}-${index}`} native title={href}>
        {label}
      </ExternalLink>
    )

    cursor = index + raw.length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return <span className={className}>{nodes.length ? nodes : text}</span>
}
