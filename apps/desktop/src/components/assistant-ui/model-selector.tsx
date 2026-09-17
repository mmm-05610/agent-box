// Copy-in adapted from vercel/ai-elements `Model Selector`
// (https://github.com/vercel/ai-elements,
//  packages/elements/src/model-selector.tsx @ 6a9d5b1822ffb10bba4bd97175f01e
//  dd7d8651cd). Licensed under the Apache License, Version 2.0.
//  Copyright 2023 Vercel, Inc. Licence text recorded in
//  docs/desktop-product-delivery/evidence/P08.md.
//
// Local adaptations, all shape-only: the app's own command/popover primitives
// replace the `@repo/shadcn-ui` imports; the menu anchors to the composer pill
// as a popover instead of a modal dialog; and the remote models.dev logo parts
// are dropped — an external image host is not product data. No runtime,
// transport or state from the upstream library is imported: behaviour stays in
// this repo's existing composer machinery.

import type { ComponentProps, ReactNode } from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type ModelSelectorProps = ComponentProps<typeof Popover>

export const ModelSelector = (props: ModelSelectorProps) => <Popover {...props} />

export type ModelSelectorTriggerProps = ComponentProps<typeof PopoverTrigger>

export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => <PopoverTrigger {...props} />

export type ModelSelectorContentProps = ComponentProps<typeof PopoverContent> & {
  title?: ReactNode
}

export const ModelSelectorContent = ({ className, children, title = 'Model Selector', ...props }: ModelSelectorContentProps) => (
  <PopoverContent
    aria-describedby={undefined}
    className={cn('w-72 p-0', className)}
    {...props}
  >
    <div className="sr-only">{title}</div>
    <Command className="**:data-[slot=command-input-wrapper]:h-auto">{children}</Command>
  </PopoverContent>
)

export type ModelSelectorInputProps = ComponentProps<typeof CommandInput>

export const ModelSelectorInput = ({ className, ...props }: ModelSelectorInputProps) => (
  <CommandInput className={cn('h-auto py-2', className)} {...props} />
)

export type ModelSelectorListProps = ComponentProps<typeof CommandList>

export const ModelSelectorList = (props: ModelSelectorListProps) => <CommandList {...props} />

export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>

export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => <CommandEmpty {...props} />

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>

export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => <CommandGroup {...props} />

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>

export const ModelSelectorItem = (props: ModelSelectorItemProps) => <CommandItem {...props} />

export type ModelSelectorSeparatorProps = ComponentProps<typeof CommandSeparator>

export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => <CommandSeparator {...props} />

export type ModelSelectorNameProps = ComponentProps<'span'>

export const ModelSelectorName = ({ className, ...props }: ModelSelectorNameProps) => (
  <span className={cn('flex-1 truncate text-left', className)} {...props} />
)
