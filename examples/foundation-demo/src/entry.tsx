import { useState } from 'react'
import type { PluginContext } from '@ordessa/extension-api'
import { CommandsToken, WorkbenchToken, SettingsToken, type Commands, type Workbench, type Settings, type Region, type SettingValue } from '@extensions/ordessa.contracts/contract.js'
function Counter() { const [value, set] = useState(0); return <button data-testid="demo-counter" onClick={() => set(value + 1)}>计数 {value}</button> }
export default function createPlugin() {
  return { id: 'example.foundation', autoStart: true, requires: [CommandsToken, WorkbenchToken, SettingsToken],
    activate(context: PluginContext, commands: Commands, workbench: Workbench, settings: Settings) {
      const wb = workbench.forScope(context.resources), cmd = commands.forScope(context.resources), prefs = settings.forScope(context.resources)
      for (const region of ['left', 'right', 'bottom', 'main', 'top'] as Region[]) {
        wb.addView({ id: `demo.${region}`, title: region, presentation: 'region', region, component: region === 'main' ? Counter : () => <p>{region} 区域内容</p> })
        workbench.open(`demo.${region}`)
      }
      cmd.add({ id: 'demo.open', title: '示例', execute: () => workbench.open('demo.main') })
      wb.addUI({ id: 'demo.navigation', kind: 'command', slot: 'navigation', command: 'demo.open' })
      wb.addUI({ id: 'demo.toolbar', kind: 'command', slot: 'toolbar', command: 'demo.open' })
      wb.addUI({ id: 'demo.status', kind: 'component', slot: 'statusbar', component: () => <span>演示数据，仅驻留内存</span> })
      prefs.addGroup({ id: 'demo', title: '演示设置', description: '仅用于验证扩展机制；重启后恢复初始值。' })
      const values: Record<string, SettingValue> = { text: '初始名称', boolean: true, number: 3, enum: 'a', readonly: '只读信息', fail: '拒绝写入' }
      const listeners = new Set<() => void>()
      const binding = (key: string) => ({ read: () => values[key], write: (value: SettingValue) => {
        if (key === 'fail') throw Error('演示保存失败')
        values[key] = value; listeners.forEach(f => f())
      }, subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } } })
      for (const kind of ['text', 'boolean', 'number'] as const) prefs.addItem({ id: `demo.${kind}`, group: 'demo', title: kind, kind, binding: binding(kind) })
      prefs.addItem({ id: 'demo.enum', group: 'demo', title: 'enum', kind: 'enum', options: [{ value: 'a', label: '选项 A' }, { value: 'b', label: '选项 B' }], binding: binding('enum') })
      prefs.addItem({ id: 'demo.readonly', group: 'demo', title: '只读', kind: 'text', binding: { read: () => values.readonly } })
      prefs.addItem({ id: 'demo.fail', group: 'demo', title: '失败验证', kind: 'text', binding: binding('fail') })
      prefs.addItem({ id: 'demo.custom', group: 'demo', title: '自定义区块', kind: 'custom', component: () => <button data-testid="external-update" onClick={() => { values.text = '外部更新'; listeners.forEach(f => f()) }}>模拟外部更新</button> })
    },
  }
}
