# Component Standards

## File Structure

```
src/components/
├── ui/              # Atomic components (Button, Card, Badge, Input...)
│   ├── button.tsx
│   ├── card.tsx
│   ├── badge.tsx
│   └── index.ts     # Re-exports all ui components
│
├── layout/          # Layout components (Shell, Sidebar, Header...)
│   ├── shell.tsx
│   ├── sidebar.tsx
│   └── index.ts
│
└── feedback/        # Feedback components (Toast, EmptyState, ErrorBoundary...)
    ├── toast.tsx
    ├── empty-state.tsx
    └── index.ts
```

## Component File Template

Every component file follows this structure:

```tsx
/**
 * ComponentName — Brief description
 *
 * @example
 *   <ComponentName variant="primary" size="md">
 *     Click me
 *   </ComponentName>
 */

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

interface ComponentNameProps {
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  /** Size preset */
  size?: 'sm' | 'md' | 'lg'
  /** Content */
  children: ReactNode
  /** Additional CSS classes */
  className?: string
}

// ── Component ──────────────────────────────────────────────────────────

export function ComponentName({
  variant = 'primary',
  size = 'md',
  children,
  className,
}: ComponentNameProps): JSX.Element {
  return (
    <div className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}>
      {children}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const baseStyles = 'inline-flex items-center justify-center ...'

const variantStyles = {
  primary: 'bg-primary text-primary-foreground ...',
  secondary: 'bg-secondary text-secondary-foreground ...',
  ghost: 'bg-transparent text-muted-foreground ...',
  destructive: 'bg-destructive text-destructive-foreground ...',
} as const

const sizeStyles = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-base',
  lg: 'h-10 px-6 text-lg',
} as const
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Component file | kebab-case | `button.tsx`, `empty-state.tsx` |
| Component function | PascalCase | `Button`, `EmptyState` |
| Props interface | `{Name}Props` | `ButtonProps` |
| CSS classes | Tailwind utilities | `bg-primary text-sm` |
| Custom CSS vars | kebab-case | `--background`, `--card-border` |
| Hooks | `use` prefix | `useToast`, `useTheme` |
| Utils | camelCase | `cn`, `formatDate` |

## Props Rules

1. **Required props first**, then optional with defaults
2. **Destructure** all props in the function signature
3. **Default values** via destructuring, not `defaultProps`
4. **children** is always `ReactNode` type
5. **className** is always optional, merged via `cn()`
6. **Event handlers** use `on{Action}` naming (onClick, onChange, onSave)
7. **Boolean props** use `is`/`has`/`can` prefix (isOpen, hasError, canDelete)

## Variant Pattern

Use `cva` (class-variance-authority) or manual variant maps:

```tsx
// Manual variant map (preferred for simplicity)
const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
  ghost: 'bg-transparent text-muted-foreground hover:bg-card-hover',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
} as const

// Usage
<button className={cn(variants[variant], className)}>
```

## Compound Components

For complex components with sub-parts (e.g., Card with Header/Content/Footer):

```tsx
// card.tsx
export function Card({ children, className }: CardProps) { ... }
Card.Header = CardHeader
Card.Content = CardContent
Card.Footer = CardFooter

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Content>Content</Card.Content>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

## Export Rules

1. **Named exports** for all components (no default exports)
2. **Barrel exports** via `index.ts` in each directory
3. **Types** exported alongside components
