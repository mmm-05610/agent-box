import { useTranslation } from 'react-i18next'
import { Link } from '../app/router'
import { State, Ref } from './Chrome'
import { executionId, workId } from '../data/mock'

export function ExecutionHeader({ phase }: { phase: 'draft' | 'active' | 'terminal' | 'finalizing' }) {
  const { t } = useTranslation()
  const routes = [['overview', 'executions.overview'], ['binding', 'executions.binding'], ['activity', 'executions.activity'], ['outputs', 'executions.outputs'], ['evidence', 'executions.evidence']] as const
  const active = location.hash.split('/').pop() || 'overview'
  const state = phase === 'draft' ? t('common.draft') : phase === 'terminal' ? t('common.terminal') : phase === 'finalizing' ? t('executions.finalizing') : t('common.active')
  return <><header className="execution-header"><div><Link to={`/works/${workId}`} className="back">← {t('common.back')}</Link><p className="eyebrow">EXECUTION · <Ref>{executionId}</Ref></p><h1>{t('works.e2')}</h1><p>{t('works.openWork')}</p></div><div className="receipt"><State tone={phase}>{state}</State><dl><dt>{t('executions.provider')}</dt><dd>Codex ExecutionProvider <Ref>provider.codex.local</Ref></dd><dt>{t('executions.dispatch')}</dt><dd>{phase === 'draft' ? '—' : t('executions.accepted')}</dd></dl></div></header><nav className="subnav" aria-label={t('executions.overview')}>{routes.map(([key, label]) => <Link key={key} to={`/executions/${executionId}/${key}`} className={key === active ? 'selected' : ''}>{t(label)}</Link>)}</nav></>
}
