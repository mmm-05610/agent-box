/**
 * Help Page — documentation links, about
 */

import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui'
import { PageHeader } from '@/components/layout'
import { useVersion } from '@/hooks'

const LINKS = [
  { labelKey: 'help.link.github', href: 'https://github.com/mmm-05610/agent-box' },
  { labelKey: 'help.link.documentation', href: 'https://github.com/mmm-05610/agent-box#readme' },
  { labelKey: 'help.link.issue', href: 'https://github.com/mmm-05610/agent-box/issues' },
]

export function HelpPage() {
  const { t } = useTranslation()
  const version = useVersion()
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      {/* Header */}
      <PageHeader
        title={t('help.title')}
        stats={
          <>
            <span>{t('help.stats.links')}</span>
            {version && (
              <>
                <span className="mx-2 text-border">·</span>
                <span className="font-mono">{`agent-box v${version}`}</span>
                <span className="mx-2 text-border">·</span>
              </>
            )}
            <span>MIT</span>
          </>
        }
        className="mb-8"
      />

      <div className="flex flex-col gap-6">
        {/* Links */}
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              {t('help.links')}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              {t('help.linksDesc')}
            </p>
            <div className="flex flex-col gap-2">
              {LINKS.map(({ labelKey, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-foreground underline-offset-4 hover:underline hover:text-accent transition-colors"
                >
                  <span>{t(labelKey)}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M7 17L17 7" />
                    <path d="M17 7H8" />
                    <path d="M17 7V16" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </Card>

        {/* About */}
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              {t('help.about')}
            </h2>
            <p className="text-xs text-muted-foreground">{version ? `Agent Box · v${version}` : 'Agent Box'}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('help.aboutTagline')}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}