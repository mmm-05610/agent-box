import { useState, useSyncExternalStore } from 'react'
import type { AgentInteraction, AgentSessions, InteractionAnswer } from '@extensions/ordessa.agent-contracts/contract.js'

const styles = `
.agent-interactions { height:100%; padding:12px; background:#f8fafc; overflow:auto; font:12px system-ui,sans-serif; color:#27394e; box-sizing:border-box; }
.agent-interactions h2 { margin:0 0 12px; font-size:12px; font-weight:600; }
.agent-interactions p { line-height:1.5; }.agent-interactions .muted { color:#75869a; }
.agent-interaction { border:1px solid #d5dee8; border-left:3px solid #b77e3d; background:#fff; padding:10px; margin-bottom:10px; overflow-wrap:anywhere; }
.agent-interaction header { display:flex; align-items:center; justify-content:space-between; gap:6px; }
.agent-interaction header strong { font-size:12px; }.agent-interaction header small { font:10px ui-monospace,monospace; color:#6a7c8f; }
.agent-interaction button { border:1px solid #c9d5e0; border-radius:3px; background:#f2f6fa; color:#315f92; padding:5px 8px; margin:3px 4px 0 0; cursor:pointer; font:11px system-ui,sans-serif; }
.agent-interaction button:hover:not(:disabled) { background:#e3edf7; }.agent-interaction button:disabled { opacity:.5; cursor:default; }
.agent-interaction fieldset { border:0; padding:0; margin:8px 0; }.agent-interaction legend { font-weight:600; padding:0; }
.agent-interaction label { display:block; margin:5px 0; }.agent-interaction input,.agent-interaction textarea,.agent-interaction select { width:100%; box-sizing:border-box; padding:6px; border:1px solid #cbd6e1; border-radius:3px; font:12px system-ui,sans-serif; }
.agent-interaction textarea { min-height:78px; resize:vertical; }.agent-interaction :focus-visible { outline:2px solid #315f92; outline-offset:2px; }
.agent-interaction-error { color:#a24343; margin:5px 0; }
`
function InteractionCard({ item, service }: { item: AgentInteraction; service: AgentSessions }) {
  const [values, setValues] = useState<Record<string, string>>({}), [error, setError] = useState('')
  const pending = item.state === 'pending'
  const submit = (answer: InteractionAnswer) => { setError(''); void service.respond(item.id, answer).catch(error => setError(String(error))) }
  const fieldValue = (id: string) => values[id] ?? ''
  const change = (id: string, value: string) => setValues(current => ({ ...current, [id]: value }))
  return <article className="agent-interaction" data-interaction={item.id}>
    <header><strong>{item.title}</strong><small>{item.state}</small></header>
    {item.detail && <p>{item.detail}</p>}
    {item.fields?.map(field => <fieldset key={field.id} disabled={!pending}>
      <legend>{field.title}</legend>{field.detail && <p>{field.detail}</p>}
      {field.choices?.length ? <select aria-label={field.title} value={fieldValue(field.id)} onChange={event => change(field.id, event.target.value)}>
        <option value="">Choose…</option>{field.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select> : <label>{field.secret ? 'Secret response' : 'Response'}
        {item.kind === 'editor' ? <textarea value={fieldValue(field.id)} onChange={event => change(field.id, event.target.value)} />
          : <input type={field.secret ? 'password' : 'text'} value={fieldValue(field.id)} onChange={event => change(field.id, event.target.value)} />}
      </label>}
    </fieldset>)}
    {pending && item.fields?.length ? <div>
      <button disabled={item.fields.some(field => !fieldValue(field.id))} onClick={() => submit({ kind: 'answers', answers: Object.fromEntries(item.fields!.map(field => [field.id, [fieldValue(field.id)]])) })}>Send response</button>
      <button onClick={() => submit({ kind: 'cancel' })}>Cancel</button>
    </div> : null}
    {pending && !item.fields?.length && item.choices?.map(choice => <button key={choice.id} onClick={() => submit({ kind: 'choice', choiceId: choice.id })}>{choice.label}</button>)}
    {pending && !item.fields?.length && item.kind === 'confirm' && <div><button onClick={() => submit({ kind: 'confirm', confirmed: true })}>Confirm</button><button onClick={() => submit({ kind: 'confirm', confirmed: false })}>Decline</button></div>}
    {pending && !item.fields?.length && (item.kind === 'input' || item.kind === 'editor') && <label>Response
      {item.kind === 'editor' ? <textarea value={fieldValue(item.id)} onChange={event => change(item.id, event.target.value)} />
        : <input value={fieldValue(item.id)} onChange={event => change(item.id, event.target.value)} />}
      <button onClick={() => submit({ kind: 'text', value: fieldValue(item.id) })}>Send response</button>
      <button onClick={() => submit({ kind: 'cancel' })}>Cancel</button></label>}
    {error && <p role="alert" className="agent-interaction-error">{error}</p>}
  </article>
}
export function InteractionPanel({ service }: { service: AgentSessions }) {
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const items = (state.agent?.interactions ?? []).filter(item => item.sessionId === state.agent?.selectedSessionId)
  return <section className="agent-interactions"><style>{styles}</style><h2>Requests</h2>
    {!items.length ? <p className="muted">No requests need a response.</p> : items.map(item => <InteractionCard key={item.id} item={item} service={service} />)}
  </section>
}
