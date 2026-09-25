import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import type { Commands, Region, UIContribution, View } from '@extensions/ordessa.contracts/contract.js'
import { ordered } from '../shared/registry'
import { Boundary } from '../shared/boundary'
import type { WorkbenchModel } from './model'
import { styles } from './styles'

const regions: Region[] = ['left', 'main', 'right', 'top', 'bottom']
const auxiliary = ['left', 'right', 'bottom', 'top'] as const
const labels: Record<Region, string> = { left: '左侧栏', right: '右侧栏', bottom: '底部面板', top: '顶部面板', main: '主区' }
type Hosts = Partial<Record<Region, HTMLDivElement | null>>
// A stable portal container moves between slots, preserving the component instance.
function ViewSurface({ view, region, hosts }: { view: View; region: Region; hosts: RefObject<Hosts> }) {
  const [node] = useState(() => { const el = document.createElement('div'); el.className = 'wb-surface'; return el })
  useLayoutEffect(() => { hosts.current[region]?.appendChild(node); return () => { node.remove() } }, [region, node, hosts])
  const Content = view.component
  return createPortal(<Boundary><Content /></Boundary>, node)
}
function RegionIcon({ region }: { region: Region }) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="1" />
    {region === 'left' ? <path d="M7 3v14" /> : region === 'right' ? <path d="M13 3v14" /> : region === 'bottom' ? <path d="M2 12h16" /> : <path d="M2 8h16" />}</svg>
}

export function WorkbenchShell({ model, commands }: { model: WorkbenchModel; commands: Commands }) {
  const views = useSyncExternalStore(model.views.subscribe, model.views.getSnapshot)
  const items = useSyncExternalStore(model.ui.subscribe, model.ui.getSnapshot)
  const selection = useSyncExternalStore(model.subscribe, model.getSelection)
  const layout = useSyncExternalStore(model.subscribe, model.getLayout)
  const available = useSyncExternalStore(commands.subscribe, commands.getSnapshot)
  const [error, setError] = useState(''), [dragged, setDragged] = useState<string | null>(null)
  const dragSession = useRef<string | null>(null)
  const full = views.find(v => v.id === selection['full-page'])
  const back = useRef<HTMLButtonElement>(null), workspace = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(null), hosts = useRef<Hosts>({})
  const panels = useRef<Partial<Record<Region, PanelImperativeHandle | null>>>({})
  const sizes = useRef<Partial<Record<Region, number>>>({ left: 22, right: 22, top: 18, bottom: 24 })
  const entries = (region: Region) => ordered(views.filter(v => model.regionOf(v) === region))
  const has = Object.fromEntries(regions.map(r => [r, entries(r).length > 0])) as Record<Region, boolean>
  useLayoutEffect(() => {
    for (const r of auxiliary) {
      const panel = panels.current[r]
      if (!panel) continue
      if (!has[r] || layout.collapsed[r]) panel.collapse()
      else if (panel.isCollapsed()) panel.resize(`${sizes.current[r]}%`)
    }
  }, [layout.collapsed, has.left, has.right, has.top, has.bottom])
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
    if (item.kind === 'component') { const Content = item.component; return <Boundary key={item.id}><Content /></Boundary> }
    const command = available.find(c => c.id === item.command), title = item.label ?? command?.title ?? item.command
    const Icon = item.icon
    return <button key={item.id} disabled={!command} aria-label={title} title={command ? title : `命令不可用：${item.command}`}
      onClick={() => { setError(''); void commands.execute(item.command).then(result => { if (!result.ok) setError(result.error) }) }}>
      {item.slot === 'navigation' && <span className="wb-nav-icon" aria-hidden="true">{Icon ? <Icon /> : title.slice(0, 1)}</span>}
      <span>{title}{!command && '（不可用）'}</span>
    </button>
  }
  const slot = (name: UIContribution['slot'], section?: 'primary' | 'utility') => ordered(items.filter(i => i.slot === name && (!section || (i.kind === 'command' && (i.section ?? 'primary') === section)))).map(contribution)
  const move = (id: string, region: Region) => { try { model.move(id, region) } catch (e) { setError(String(e)) } finally { setDragged(null) } }
  const region = (name: Region) => {
    const list = entries(name), active = list.find(v => v.id === selection[name])
    return <section className={`wb-region wb-${name}`} data-region={name} aria-label={labels[name]} inert={name !== 'main' && (!has[name] || !!layout.collapsed[name])}>
      <header>{name === 'left' && <><strong className="wb-brand">Ordessa</strong><nav className="wb-nav" aria-label="导航">{slot('navigation', 'primary')}</nav></>}
        <div role="group" aria-label={`${name}视图`}>{list.map(v => <button key={v.id} draggable aria-pressed={v.id === active?.id}
          onDragStart={e => {
            e.dataTransfer.setData('application/x-ordessa-view', v.id); e.dataTransfer.setData('text/plain', v.title); e.dataTransfer.effectAllowed = 'move'
            dragSession.current = v.id
            // Let Chromium capture its drag image before adding an overlay over the source.
            setTimeout(() => { if (dragSession.current === v.id) setDragged(v.id) }, 0)
          }}
          onDragEnd={() => { dragSession.current = null; setDragged(null) }} onClick={() => model.service.open(v.id)} title={`${v.title} · 拖动以移动`}>{v.title}</button>)}
          {!list.length && <span className="wb-region-label">{labels[name]}</span>}</div>
        <div className="wb-region-actions">{active && <>
          <select aria-label={`移动 ${active.title} 到`} value="" onChange={e => { if (e.target.value) move(active.id, e.target.value as Region) }}>
            <option value="">移动…</option>{regions.filter(r => r !== name).map(r => <option key={r} value={r}>{labels[r]}</option>)}
          </select>
          <button aria-label={`关闭${active.title}`} title="关闭视图" onClick={() => model.service.close(active.id)}>×</button>
        </>}{name !== 'main' && <button aria-label={`收起${labels[name]}`} title={`收起${labels[name]}`} onClick={() => model.collapse(name, true)}>−</button>}</div>
        {name === 'main' && <><div className="wb-actions">{slot('toolbar')}</div><div className="wb-layout-actions">
          {auxiliary.map(r => <button key={r} disabled={!has[r]} aria-label={`${layout.collapsed[r] ? '展开' : '收起'}${labels[r]}`} title={`${labels[r]}${has[r] ? '' : '（无视图）'}`} aria-pressed={has[r] && !layout.collapsed[r]} onClick={() => model.collapse(r, !layout.collapsed[r])}><RegionIcon region={r} /></button>)}
          <button title="恢复默认位置和尺寸" aria-label="重置布局" onClick={reset}>↺</button>
        </div></>}
      </header>
      <div className="wb-content" ref={node => { hosts.current[name] = node }} />
      {!active && name === 'main' && <div className="wb-empty"><span className="wb-empty-mark" aria-hidden="true">O</span><h1>工作区已就绪</h1><p>从左侧打开扩展，或选择一个视图。</p><small>拖动视图标题可移动位置 · 拖动分隔线可调整大小</small></div>}
    </section>
  }
  const panel = (name: Exclude<Region, 'main'>) => <Panel key={name} id={`wb-${name}`} panelRef={value => { panels.current[name] = value }}
    collapsible collapsedSize="0%" defaultSize={has[name] ? `${sizes.current[name]}%` : '0%'}
    minSize={has[name] ? (name === 'left' || name === 'right' ? '12%' : '10%') : '0%'} maxSize={has[name] ? '40%' : '0%'}>
    {region(name)}
  </Panel>
  const separator = (name: Exclude<Region, 'main'>) => <Separator key={`sep-${name}`} id={`resize-${name}`} aria-label={`调整${labels[name]}大小`}
    className={`wb-separator ${has[name] ? '' : 'wb-separator-empty'}`} disabled={!has[name]} onDoubleClick={() => panels.current[name]?.resize(name === 'top' ? '18%' : name === 'bottom' ? '24%' : '22%')} />
  const resized = (axis: readonly Exclude<Region, 'main'>[]) => (values: Record<string, number>, meta: { isUserInteraction: boolean }) => {
    if (!meta.isUserInteraction) return
    for (const name of axis) {
      const value = values[`wb-${name}`]
      if (value > 0) sizes.current[name] = value
      if (has[name]) model.collapse(name, value === 0)
    }
  }
  const reset = () => {
    sizes.current = { left: 22, right: 22, top: 18, bottom: 24 }
    model.resetLayout()
    for (const name of auxiliary) if (has[name]) panels.current[name]?.resize(`${sizes.current[name]}%`)
  }
  const Full = full?.component
  const activeViews = views.filter(v => v.presentation === 'region' && selection[model.regionOf(v)!] === v.id)
  return <div className="wb"><style>{styles}</style>
    <div ref={workspace} tabIndex={-1} hidden={!!full} inert={!!full} aria-hidden={!!full} data-testid="workspace">
      <div className="wb-body">
        <div className="wb-layout">
          <Group id="wb-vertical" orientation="vertical" className="wb-group" onLayoutChanged={resized(['top', 'bottom'])}>
            {panel('top')}{separator('top')}
            <Panel id="wb-center" minSize="20%">
              <Group id="wb-horizontal" className="wb-group" onLayoutChanged={resized(['left', 'right'])}>
                {panel('left')}{separator('left')}
                <Panel id="wb-main" minSize="20%">{region('main')}</Panel>
                {separator('right')}{panel('right')}
              </Group>
            </Panel>
            {separator('bottom')}{panel('bottom')}
          </Group>
          {dragged && <div className="wb-drop-targets" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}>
            {regions.map(r => <div key={r} className={`wb-drop-${r}`} data-drop-region={r} onDrop={e => { e.preventDefault(); if (e.dataTransfer.getData('application/x-ordessa-view') === dragged) move(dragged, r); else setDragged(null) }}>移至{labels[r]}</div>)}
          </div>}
        </div>
      </div>
      <footer className="wb-status"><span className="wb-status-dot" />{slot('navigation', 'utility')}{slot('statusbar')}<span className="wb-status-end">本地工作台</span></footer>
    </div>
    {activeViews.map(v => <ViewSurface key={v.id} view={v} region={model.regionOf(v)!} hosts={hosts} />)}
    {Full && <section className="wb-full" data-testid="full-page" aria-label={full.title}>
      <header className="wb-bar"><button ref={back} onClick={() => model.service.close(full.id)}>← 返回工作区</button><h1>{full.title}</h1></header>
      <div className="wb-full-content"><Boundary key={full.id}><Full /></Boundary></div>
    </section>}
    {error && <div role="alert" className="wb-error">{error}<button onClick={() => setError('')}>关闭提示</button></div>}
  </div>
}
