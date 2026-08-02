/**
 * Help Page — CLI reference, links, about
 */

import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui'
import { PageHeader } from '@/components/layout'

const CLI_COMMANDS = [
  { command: 'agent-box create <name> --type claude', descriptionKey: 'help.cmd.create' },
  { command: 'agent-box launch <name>', descriptionKey: 'help.cmd.launch' },
  { command: 'agent-box list', descriptionKey: 'help.cmd.list' },
  { command: 'agent-box delete <name>', descriptionKey: 'help.cmd.delete' },
  { command: 'agent-box provider list --type claude', descriptionKey: 'help.cmd.providers' },
  { command: 'agent-box claude-md list --type claude', descriptionKey: 'help.cmd.claudeMd' },
]

const LINKS = [
  { labelKey: 'help.link.github', href: 'https://github.com/anthropics/agent-box' },
  { labelKey: 'help.link.documentation', href: 'https://github.com/anthropics/agent-box#readme' },
  { labelKey: 'help.link.issue', href: 'https://github.com/anthropics/agent-box/issues' },
]

export function HelpPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      {/* Header */}
      <PageHeader
        title={t('help.title')}
        stats={
          <>
            <span>{t('help.stats.commands')}</span>
            <span className="mx-2 text-border">·</span>
            <span>{t('help.stats.links')}</span>
            <span className="mx-2 text-border">·</span>
            <span className="font-mono">agent-box v0.5.0</span>
            <span className="mx-2 text-border">·</span>
            <span>MIT</span>
          </>
        }
        className="mb-8"
      />

      <div className="flex flex-col gap-6">
        {/* Quick Reference */}
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              {t('help.quickReference')}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              {t('help.cliCommands')}
            </p>
            <div className="space-y-2.5">
              {CLI_COMMANDS.map(({ command, descriptionKey }) => (
                <div
                  key={command}
                  className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <code className="font-mono text-xs text-foreground whitespace-nowrap">
                    {command}
                  </code>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t(descriptionKey)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

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
            <p className="text-xs text-muted-foreground">Agent Box · v0.5.0</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('help.aboutTagline')}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}