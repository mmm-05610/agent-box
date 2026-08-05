/**
 * SetupScreen — WSL install guide for bare Windows machines.
 *
 * Rendered by EnvironmentGate when the WSL backend the GUI needs is not
 * available, instead of the app's pages (which would all show RPC errors).
 */

import { useTranslation } from 'react-i18next'
import { Button, Card } from '@/components/ui'
import type { EnvironmentStatus } from '@/hooks/useEnvironment'

interface SetupScreenProps {
  status: EnvironmentStatus
  onRetry: () => void
}

const INSTALL_STEPS = [
  'setup.step.install',
  'setup.step.restart',
  'setup.step.init',
  'setup.step.retryCheck',
] as const

export function SetupScreen({ status, onRetry }: SetupScreenProps) {
  const { t } = useTranslation()
  const stateKey = status.wsl ? 'noDistro' : 'noWsl'

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-background px-8">
      <div className="w-full max-w-xl">
        <Card>
          <div className="p-8">
            <h1 className="text-lg font-semibold text-foreground">{t('setup.title')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t('setup.desc')}</p>

            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              {t(`setup.status.${stateKey}`)}
            </div>

            <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-foreground">
              {INSTALL_STEPS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>

            <pre className="mt-4 overflow-x-auto rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono text-xs text-foreground">
              wsl --install -d Ubuntu
            </pre>

            <div className="mt-6 flex items-center gap-3">
              <Button onClick={onRetry}>{t('setup.retry')}</Button>
              <span className="text-xs text-muted-foreground">{t('setup.retryHint')}</span>
            </div>

            {status.detail && (
              <details className="mt-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">{t('setup.detail')}</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono">
                  {status.detail}
                </pre>
              </details>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
