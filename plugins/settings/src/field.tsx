import { useEffect, useRef, useState } from 'react'
import type { Setting, SettingValue } from '@extensions/ordessa.contracts/contract.js'
export type Field = Exclude<Setting, { kind: 'custom' }>
export function validateValue(field: Field, value: SettingValue): string | undefined {
  if (field.kind === 'boolean' && typeof value !== 'boolean') return '需要开关值'
  if (field.kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return '请输入有效数字'
  if ((field.kind === 'text' || field.kind === 'enum') && typeof value !== 'string') return '需要文本值'
  if (field.kind === 'enum' && !field.options.some(o => o.value === value)) return '当前值不在可选项中'
  return field.binding.validate?.(value)
}
export function SettingField({ field }: { field: Field }) {
  const { binding } = field
  const [draft, setDraft] = useState<SettingValue>('')
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const generation = useRef(0), alive = useRef(false), saving = useRef(false), refresh = useRef<() => Promise<void>>(async () => {})
  const changedDuringSave = useRef(false)
  useEffect(() => {
    alive.current = true
    const read = async () => {
      const ticket = ++generation.current
      setPhase('loading'); setError(''); setMessage('')
      try {
        const value = await binding.read()
        const problem = validateValue(field, value)
        if (problem) throw Error(problem)
        if (alive.current && ticket === generation.current) { setDraft(value); setPhase('ready') }
      } catch (e) { if (alive.current && ticket === generation.current) { setError(String(e)); setPhase('error') } }
    }
    refresh.current = read
    let unsubscribe: (() => void) | undefined
    try {
      // Subscribe first; an event racing with a read creates a newer generation.
      unsubscribe = binding.subscribe?.(() => {
        if (saving.current) changedDuringSave.current = true
        else void read()
      })
      void read()
    } catch (e) { setError(String(e)); setPhase('error') }
    return () => { alive.current = false; ++generation.current; unsubscribe?.() }
  }, [field, binding])
  const save = async () => {
    if (!binding.write || saving.current || phase !== 'ready') return
    let problem: string | undefined
    try { problem = validateValue(field, draft) } catch (e) { problem = String(e) }
    if (problem) { setError(problem); return }
    saving.current = true; setPhase('saving'); setError(''); setMessage('')
    changedDuringSave.current = false
    const ticket = ++generation.current
    try {
      await binding.write(draft)
      // Acknowledgement is not enough: display the provider's authoritative read-back.
      changedDuringSave.current = false
      const confirmed = await binding.read()
      const invalid = validateValue(field, confirmed)
      if (invalid) throw Error(invalid)
      if (alive.current && ticket === generation.current) {
        if (changedDuringSave.current) {
          saving.current = false
          await refresh.current()
        } else { setDraft(confirmed); setPhase('ready'); setMessage('已保存并重新读取') }
      }
    } catch (e) {
      if (alive.current && ticket === generation.current) { setError(`保存或确认失败：${String(e)}。请重新读取确认。`); setPhase('error') }
    } finally { saving.current = false }
  }
  const id = `setting-${field.id}`, description = `${id}-description`
  const disabled = phase !== 'ready' || !binding.write
  return <div className="settings-field" data-setting={field.id}>
    <label htmlFor={id}>{field.title}</label>
    {field.description && <p id={description}>{field.description}</p>}
    {field.kind === 'enum' ? <select id={id} aria-describedby={description} disabled={disabled} value={String(draft)} onChange={e => { setDraft(e.target.value); setMessage('') }}>{field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> :
      field.kind === 'boolean' ? <input id={id} aria-describedby={description} type="checkbox" disabled={disabled} checked={draft === true} onChange={e => { setDraft(e.target.checked); setMessage('') }} /> :
        <input id={id} aria-describedby={description} type={field.kind === 'number' ? 'number' : 'text'} disabled={disabled} value={typeof draft === 'boolean' ? '' : Number.isNaN(draft) ? '' : draft} onChange={e => { setDraft(field.kind === 'number' ? e.target.valueAsNumber : e.target.value); setMessage('') }} />}
    <div className="settings-field-actions">
      {binding.write ? <button disabled={disabled} onClick={() => void save()}>保存</button> : <span>只读</span>}
      <button disabled={phase === 'saving'} onClick={() => void refresh.current()}>重新读取</button>
      <span role="status">{phase === 'loading' ? '读取中…' : phase === 'saving' ? '保存中…' : message}</span>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>
}
