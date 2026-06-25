/**
 * Help Page — CLI reference, links, and about info
 */

import { Card } from '@/components/ui'

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
    <div className="p-8 max-w-3xl">
      <h1 className="mb-6 text-xl font-bold text-foreground">Help</h1>

      <div className="flex flex-col gap-6">

        {/* Quick Reference */}
        <Card>
          <Card.Header>
            <Card.Title>Quick Reference</Card.Title>
            <Card.Description>Common CLI commands</Card.Description>
          </Card.Header>
          <Card.Content>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Command</th>
                  <th className="py-2 text-left font-medium text-muted-foreground">Description</th>
                </tr>
              </thead>
              <tbody>
                {CLI_COMMANDS.map(({ command, description }) => (
                  <tr key={command} className="border-b border-card-border last:border-0">
                    <td className="py-2 pr-4 font-mono text-foreground">{command}</td>
                    <td className="py-2 text-muted-foreground">{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card.Content>
        </Card>

        {/* Links */}
        <Card>
          <Card.Header>
            <Card.Title>Links</Card.Title>
            <Card.Description>Useful resources</Card.Description>
          </Card.Header>
          <Card.Content>
            <ul className="flex flex-col gap-2">
              {LINKS.map(({ label, href }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </Card.Content>
        </Card>

        {/* About */}
        <Card>
          <Card.Header>
            <Card.Title>About</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-semibold text-foreground">Agent Box</p>
              <p className="text-muted-foreground">v0.5.0</p>
              <p className="text-muted-foreground">AI agent configuration isolation manager</p>
            </div>
          </Card.Content>
        </Card>

      </div>
    </div>
  )
}
