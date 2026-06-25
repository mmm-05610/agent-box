/**
 * Mock Data — Sample data for development
 *
 * Replace with real PyWebView API calls in production.
 */

import type { ClaudeMd, Profile, Provider, Session } from './types'

export const MOCK_PROVIDERS: Provider[] = [
  {
    id: 'anthropic-default',
    name: 'Anthropic (Official)',
    category: 'anthropic',
    settings: {
      name: 'Anthropic (Official)',
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      },
    },
    createdAt: Date.now() - 86400000 * 7,
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    category: 'deepseek',
    settings: {
      name: 'DeepSeek Coder',
      env: {
        ANTHROPIC_API_KEY: 'sk-xxx',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/v1',
        ANTHROPIC_MODEL: 'deepseek-chat',
      },
    },
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'openrouter-backup',
    name: 'OpenRouter Backup',
    category: 'openrouter',
    settings: {
      name: 'OpenRouter Backup',
      env: {
        ANTHROPIC_API_KEY: 'sk-or-xxx',
        ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
      },
    },
    createdAt: Date.now() - 86400000,
  },
]

export const MOCK_CLAUDE_MDS: ClaudeMd[] = [
  {
    id: 'python-dev',
    name: 'Python Developer',
    description: 'Python development focused Claude.md',
    content: '# Python Developer\n\nFocus on Python best practices.\n',
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'frontend-dev',
    name: 'Frontend Developer',
    description: 'React/TypeScript development',
    content: '# Frontend Developer\n\nFocus on React and TypeScript.\n',
    createdAt: Date.now() - 86400000 * 2,
  },
]

export const MOCK_PROFILES: Profile[] = [
  {
    name: 'my-dev',
    agentType: 'claude',
    displayName: 'My Dev Profile',
    description: 'Main development profile',
    providerRef: 'deepseek-coder',
    createdAt: Date.now() - 86400000 * 10,
  },
  {
    name: 'prod-monitor',
    agentType: 'claude',
    displayName: 'Production Monitor',
    description: 'Monitoring and ops',
    providerRef: 'anthropic-default',
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    name: 'codex-experiments',
    agentType: 'codex',
    displayName: 'Codex Experiments',
    description: 'Testing Codex features',
    createdAt: Date.now() - 86400000 * 2,
  },
]

export const MOCK_SESSIONS: Session[] = [
  {
    id: 1,
    profile: 'my-dev',
    agentType: 'claude',
    cwd: '/home/user/project-a',
    mode: 'interactive',
    pid: 12345,
    launchedAt: Date.now() - 3600000,
  },
  {
    id: 2,
    profile: 'prod-monitor',
    agentType: 'claude',
    cwd: '/home/user/ops',
    mode: 'headless',
    pid: 12346,
    launchedAt: Date.now() - 86400000,
    exitedAt: Date.now() - 82800000,
    exitCode: 0,
  },
  {
    id: 3,
    profile: 'codex-experiments',
    agentType: 'codex',
    cwd: '/home/user/experiments',
    mode: 'interactive',
    launchedAt: Date.now() - 172800000,
    exitedAt: Date.now() - 169200000,
    exitCode: 1,
  },
]
