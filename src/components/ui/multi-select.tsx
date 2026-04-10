'use client'

import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

interface MultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  emptyText?: string
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  emptyText = 'No options available',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter(s => s !== value))
    } else {
      onChange([...selected, value])
    }
  }

  function remove(value: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(selected.filter(s => s !== value))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        )}
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          selected.map(item => (
            <Badge key={item} variant="secondary" className="capitalize">
              {item}
              <span
                role="button"
                tabIndex={0}
                onClick={e => remove(item, e)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { remove(item, e as unknown as React.MouseEvent) } }}
                className="ml-1 inline-flex cursor-pointer rounded-full p-0.5 hover:bg-destructive/20"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            </Badge>
          ))
        )}
        <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {options.length === 0 ? (
          <p className="p-3 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="p-1">
              {options.map(option => {
                const isSelected = selected.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm capitalize transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'bg-accent/50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    {option}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
