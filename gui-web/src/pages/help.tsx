/**
 * Help Page — CLI reference, links, about
 */

import { Card } from '@/components/ui'
import { PageHeader } from '@/components/layout'

const CLI_COMMANDS = [
  { command: 'agent-box create <name> --type claude', description: 'Create a new profile' },
  { command: 'agent-box launch <name>', description: 'Launch a profile' },
  { command: 'agent-box list', description: 'List all profiles' },
  { command: 'agent-box delete <name>', description: 'Delete a profile' },
  { command: 'agent-box provider list --type claude', description: 'List providers' },
  { command: 'agent-box claude-md list --type claude', description: 'List Claude.md templates' },
]

const LINKS = [
  { label: 'GitHub repository', href: 'https://github.com/anthropics/agent-box' },
  { label: 'Documentation', href: 'https://github.com/anthropics/agent-box#readme' },
  { label: 'Report an issue', href: 'https://github.com/anthropics/agent-box/issues' },
]

export function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      {/* Header */}
      <PageHeader
        title="Help"
        stats={
          <>
            <span>6 CLI commands</span>
            <span className="mx-2 text-border">·</span>
            <span>3 links</span>
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
              Quick reference
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Common CLI commands
            </p>
            <div className="space-y-2.5">
              {CLI_COMMANDS.map(({ command, description }) => (
                <div
                  key={command}
                  className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <code className="font-mono text-xs text-foreground whitespace-nowrap">
                    {command}
                  </code>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {description}
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
              Links
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Useful resources
            </p>
            <div className="flex flex-col gap-2">
              {LINKS.map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-foreground underline-offset-4 hover:underline hover:text-accent transition-colors"
                >
                  <span>{label}</span>
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
              About
            </h2>
            <p className="text-xs text-muted-foreground">Agent Box · v0.5.0</p>
            <p className="mt-2 text-sm text-muted-foreground">
              AI agent configuration isolation manager.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}