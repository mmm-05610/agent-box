import { useState } from 'react'
import type { AgentInteraction, AgentSessions, AgentSnapshot, Availability, InteractionAnswer } from '@extensions/ordessa.agent-contracts/contract.js'

/** A connector's negative verdict on its interaction channel must not be turned into a successful-looking response
 *  attempt (FC-0029: the connector marks the gap unavailable, this surface does not fake an answer). */
const canAnswer = (interactions: Availability) => interactions !== 'unsupported' && interactions !== 'unavailable'

function InteractionCard({ item, service, canRespond }: { item: AgentInteraction; service: AgentSessions; canRespond: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({}), [error, setError] = useState('')
  const pending = item.state === 'pending' && canRespond
  const submit = (answer: InteractionAnswer) => { setError(''); void service.respond(item.id, answer).catch(error => setError(String(error))) }
  const fieldValue = (id: string) => values[id] ?? ''
  const change = (id: string, value: string) => setValues(current => ({ ...current, [id]: value }))
  return <article className="agent-interaction" data-interaction={item.id}>
    <header><strong>{item.title}</strong><small>{item.state}</small></header>
    {item.detail && <p>{item.detail}</p>}
    {item.state === 'pending' && !canRespond && <p role="status" className="agent-interaction-muted">This agent cannot receive a response over the current connection.</p>}
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

/** Requests belonging to the session this conversation is showing, actionable here instead of in a side pane. */
export function SessionInteractions({ service, agent, sessionId }: { service: AgentSessions; agent: AgentSnapshot; sessionId: string }) {
  const items = agent.interactions.filter(item => item.sessionId === sessionId)
  if (!items.length) return null
  return <div className="agent-interactions-in-thread">{items.map(item =>
    <InteractionCard key={item.id} item={item} service={service} canRespond={canAnswer(agent.connection.capabilities.interactions)} />)}</div>
}
