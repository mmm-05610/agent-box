import { useMemo, useState, type ReactNode } from 'react'
import { Button, Input } from '@/components/ui'
import { EndpointSpeedTest } from '../../EndpointSpeedTest'
import { ZapIcon } from './icons'

export interface EndpointFieldProps {
  value: string
  onChange: (value: string) => void
  candidates?: string[]
  label?: string
  placeholder?: string
  hint?: ReactNode
  readOnly?: boolean
  toolsLabel?: string
}

export function EndpointField({ value, onChange, candidates = [], label = 'API 请求地址', placeholder = 'https://api.example.com', hint, readOnly, toolsLabel = '管理与测速' }: EndpointFieldProps) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const endpoints = useMemo(() => Array.from(new Set([value, ...candidates].filter(Boolean))), [value, candidates])
  return <div>
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Button type="button" variant="ghost" size="sm" onClick={() => setToolsOpen((open) => !open)} disabled={readOnly} className="h-7 gap-1 text-xs">
        <ZapIcon />{toolsOpen ? '收起测速' : toolsLabel}
      </Button>
    </div>
    <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="font-mono text-sm" disabled={readOnly} />
    {toolsOpen && <div className="mt-2">
      {endpoints.length > 0
        ? <EndpointSpeedTest endpoints={endpoints} selected={value} onSelect={onChange} />
        : <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">请先填写 API 请求地址，再使用管理与测速功能。</p>}
    </div>}
    {hint}
  </div>
}
