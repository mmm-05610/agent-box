import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Commands, Region, UIContribution } from '@extensions/ordessa.contracts/contract.js'
import { ordered } from '../../shared/registry'
import { Boundary } from '../../shared/boundary'
import type { WorkbenchModel } from './model'
import { styles } from './styles'

export function WorkbenchShell({ model, commands }: { model: WorkbenchModel; commands: Commands }) {
  const views = useSyncExternalStore(model.views.subscribe, model.views.getSnapshot)
  const items = useSyncExternalStore(model.ui.subscribe, model.ui.getSnapshot)
  const selection = useSyncExternalStore(model.subscribe, model.getSelection)
  const available = useSyncExternalStore(commands.subscribe, commands.getSnapshot)
  const [error, setError] = useState('')
  const full = views.find(v => v.id === selection['full-page'])
  const back = useRef<HTMLButtonElement>(null), workspace = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!full) return
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    back.current?.focus()
    return () => {
      const target = restore.current
      queueMicrotask(() => {
        if (target?.isConnected && !target.closest('[inert]')) target.focus()
        else workspace.current?.focus()
      })
    }
  }, [full?.id])
  const contribution = (item: UIContribution) => {
    if (item.kind === 'component') { const View = item.component; return <Boundary key={item.id}><View /></Boundary> }
    const command = available.find(c => c.id === item.command)
    return <button key={item.id} disabled={!command} title={command ? command.title : `命令不可用：${item.command}`}
      onClick={() => { setError(''); void commands.execute(item.command).then(result => { if (!result.ok) setError(result.error) }) }}>
      {item.label ?? command?.title ?? item.command}{!command && '（不可用）'}
    </button>
  }
  const slot = (name: UIContribution['slot']) => ordered(items.filter(i => i.slot === name)).map(contribution)
  const region = (name: Region) => {
    const entries = ordered(views.filter(v => v.presentation === 'region' && v.region === name))
    const active = entries.find(v => v.id === selection[name]), View = active?.component
    if (!entries.length && name !== 'main') return null
    return <section className={`wb-region wb-${name}${active ? '' : ' wb-collapsed'}`} data-region={name} aria-label={name}>
      {entries.length > 0 && <header><div role="group" aria-label={`${name}视图`}>{entries.map(v => <button key={v.id} aria-pressed={v.id === active?.id} onClick={() => model.service.open(v.id)}>{v.title}</button>)}</div>
        {active && <button aria-label={`关闭${active.title}`} onClick={() => model.service.close(active.id)}>关闭</button>}</header>}
      {View ? <div className="wb-content"><Boundary key={active.id}><View /></Boundary></div> : name === 'main' ?
        <div className="wb-empty"><h1>工作区</h1><p>从导航或视图入口打开内容。</p></div> : null}
    </section>
  }
  const Full = full?.component
  return <div className="wb"><style>{styles}</style>
    <div ref={workspace} tabIndex={-1} hidden={!!full} inert={!!full} aria-hidden={!!full} data-testid="workspace">
      <header className="wb-bar"><strong>Ordessa <small>Desktop</small></strong><div className="wb-actions">{slot('toolbar')}</div></header>
      <nav className="wb-navigation" aria-label="导航">{slot('navigation')}</nav>
      {region('top')}
      <div className="wb-middle">{region('left')}{region('main')}{region('right')}</div>
      {region('bottom')}
      <footer className="wb-status">{slot('statusbar')}</footer>
    </div>
    {Full && <section className="wb-full" data-testid="full-page" aria-label={full.title}>
      <header className="wb-bar"><button ref={back} onClick={() => model.service.close(full.id)}>← 返回工作区</button><h1>{full.title}</h1></header>
      <div className="wb-full-content"><Boundary key={full.id}><Full /></Boundary></div>
    </section>}
    {error && <div role="alert" className="wb-error">{error}<button onClick={() => setError('')}>关闭提示</button></div>}
  </div>
}
