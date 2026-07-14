import { useState } from 'react'
import type { TreeNode } from './buildTreeFromFlatList'
import { cn } from '@/lib/utils'

function fileIcon(filename: string): string {
  if (filename.endsWith('.json') || filename.endsWith('.jsonc')) return '📋'
  if (filename.endsWith('.md')) return '📘'
  if (filename.endsWith('.toml')) return '⚙'
  if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return '📄'
  return '📄'
}

function fmtSize(size?: number): string {
  if (size === undefined) return ''
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}K`
  return `${(size / (1024 * 1024)).toFixed(1)}M`
}

function Folder({ node, depth, onSelect, selected }: {
  node: TreeNode
  depth: number
  selected: string | null
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 1)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left text-xs font-mono px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded truncate"
        style={{ paddingLeft: depth * 12 + 8 }}
        title={node.path}
      >
        <span className="inline-block w-3">{open ? '▼' : '▶'}</span> {node.path.split('/').pop()}
      </button>
      {open && node.children && (
        <div>
          {node.children.map((child) =>
            child.type === 'dir' ? (
              <Folder key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
            ) : (
              <button
                key={child.path}
                type="button"
                onClick={() => onSelect(child.path)}
                className={cn(
                  'block w-full text-left text-xs font-mono px-2 py-0.5 rounded truncate',
                  selected === child.path
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                style={{ paddingLeft: (depth + 1) * 12 + 8 }}
                title={`${child.path} · ${fmtSize(child.size)}`}
              >
                {fileIcon(child.path)} {child.path.split('/').pop()}
                {child.size !== undefined && (
                  <span className="ml-2 text-[10px] opacity-60">{fmtSize(child.size)}</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function FileTree({ tree, rootLabel, selected, onSelect }: {
  tree: TreeNode[]
  rootLabel: string
  selected: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div className="text-xs">
      <div className="px-2 py-1 font-medium text-foreground/80">{rootLabel}</div>
      {tree.map((node) =>
        node.type === 'dir' ? (
          <Folder key={node.path} node={node} depth={0} selected={selected} onSelect={onSelect} />
        ) : (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelect(node.path)}
            className={cn(
              'block w-full text-left text-xs font-mono px-2 py-0.5 rounded truncate',
              selected === node.path
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={{ paddingLeft: 8 }}
            title={node.path}
          >
            {fileIcon(node.path)} {node.path.split('/').pop()}
          </button>
        ),
      )}
    </div>
  )
}
