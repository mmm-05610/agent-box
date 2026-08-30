import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useRoute } from '../app/router'

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const route = useRoute()
  const integration = route.startsWith('/integrations')
  return <div className="shell"><aside className="rail"><Link to="/works" className="brand"><span aria-hidden="true">◇</span><strong>{t('common.product')}</strong><small>{t('common.prototype')}</small></Link><nav aria-label={t('common.product')}><Link className={route.startsWith('/works') || route.startsWith('/executions') ? 'nav active' : 'nav'} to="/works">{t('common.works')}</Link><Link className={route.startsWith('/harnesses') || route.startsWith('/profiles') ? 'nav active' : 'nav'} to="/harnesses">{t('common.harnesses')}</Link><Link className={integration ? 'nav active' : 'nav'} to="/integrations">{t('common.integrations')}</Link>{integration && <div className="nav-nest"><Link to="/integrations/plugins">{t('integrations.plugins')}</Link><Link to="/integrations/resources">{t('integrations.resources')}</Link><Link to="/integrations">{t('integrations.diagnostics')}</Link></div>}<Link className={route === '/settings' ? 'nav active' : 'nav'} to="/settings">{t('common.settings')}</Link></nav><div className="rail-note"><span>{t('common.mock')}</span><code>local://prototype</code></div></aside><main>{children}</main></div>
}

export function State({ children, tone = 'quiet' }: { children: ReactNode; tone?: string }) { return <span className={`state ${tone}`}>{children}</span> }
export function Ref({ children }: { children: ReactNode }) { return <code className="ref">{children}</code> }
export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) { return <header className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</header> }
