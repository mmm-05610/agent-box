import { useState, useSyncExternalStore } from 'react'
import { ordered } from '../../shared/registry'
import { Boundary } from '../../shared/boundary'
import { SettingField } from './field'
import type { SettingsModel } from './model'
export function SettingsPage({ model }: { model: SettingsModel }) {
  const groups = useSyncExternalStore(model.groups.subscribe, model.groups.getSnapshot)
  const items = useSyncExternalStore(model.items.subscribe, model.items.getSnapshot)
  const [selected, select] = useState<string | null>(null)
  const sorted = ordered(groups), group = sorted.find(g => g.id === selected) ?? sorted[0]
  const orphan = items.filter(i => !groups.some(g => g.id === i.group))
  return <div className="settings"><style>{`
    .settings { display:grid; grid-template-columns:180px minmax(0,1fr); gap:32px; }
    .settings nav { display:flex; flex-direction:column; align-items:stretch; gap:8px; }
    .settings h2 { margin-top:0; font-size:18px; }
    .settings p { color:#64748b; font-size:14px; }
    .settings-field { padding:20px 0; border-bottom:1px solid #dbe2ea; }
    .settings-field label { display:block; font-weight:600; margin-bottom:8px; }
    .settings-field input:not([type=checkbox]),.settings-field select { padding:8px; border:1px solid #dbe2ea; border-radius:4px; width:min(100%,400px); }
    .settings-field-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:12px; font-size:13px; }
    .settings [role=alert] { color:#a33333; }
    @media(max-width:600px) { .settings { grid-template-columns:1fr; } }
  `}</style>
    <nav aria-label="设置分类">{sorted.map(g => <button key={g.id} aria-pressed={g.id === group?.id} onClick={() => select(g.id)}>{g.title}</button>)}</nav>
    <div>{group ? <><h2>{group.title}</h2>{group.description && <p>{group.description}</p>}
      {ordered(items.filter(i => i.group === group.id)).map(item => {
        if (item.kind === 'custom') { const View = item.component; return <Boundary key={item.id}><section aria-label={item.title}><h3>{item.title}</h3><View /></section></Boundary> }
        return <Boundary key={item.id}><SettingField field={item} /></Boundary>
      })}</> : <><h2>尚无设置项</h2><p>已启用的扩展可在这里提供自己的设置。</p></>}
      {orphan.length > 0 && <p role="alert">设置分组未注册：{orphan.map(i => i.group).join(', ')}</p>}
    </div>
  </div>
}
