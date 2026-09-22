import { Component, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Host } from './runtime';

class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">此视图加载失败，其他视图仍可使用。</p> : this.props.children; }
}

export function Shell({ host }: { host: Host }) {
  const pages = useSyncExternalStore(host.pages.subscribe, host.pages.getSnapshot);
  const [selected, select] = useState<string | null>(null);
  const page = pages.find(p => p.id === selected);
  const View = page?.component;
  return <div className="desktop-host">
    <aside><strong>Ordessa <small>Desktop</small></strong>
      <nav aria-label="视图">{pages.map(p => <button key={p.id} onClick={() => select(p.id)} aria-pressed={page?.id === p.id}>{p.title}</button>)}</nav>
    </aside>
    <main>
      <header><span>{page?.title ?? '工作区'}</span>{page && <button onClick={() => select(null)}>关闭视图</button>}</header>
      {View ? <ViewBoundary key={page.id}><View /></ViewBoundary> : <section data-testid="empty"><h1>桌面已就绪</h1><p>{pages.length ? '从侧栏选择一个页面。' : '当前没有注册页面。'}</p></section>}
    </main>
  </div>;
}
