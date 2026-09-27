'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '@/lib/utils'

export interface MentionItem {
  id: string
  label: string
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const MentionList = forwardRef<
  MentionListRef,
  { items: MentionItem[]; command: (item: MentionItem) => void }
>((props, ref) => {
  const [idx, setIdx] = useState(0)

  useEffect(() => setIdx(0), [props.items])

  const select = (i: number) => {
    const item = props.items[i]
    if (item) props.command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setIdx(i => (i + props.items.length - 1) % props.items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setIdx(i => (i + 1) % props.items.length)
        return true
      }
      if (event.key === 'Enter') {
        select(idx)
        return true
      }
      return false
    },
  }))

  if (!props.items.length) {
    return (
      <div className="py-2 px-3 text-sm text-muted-foreground">
        Nenhum agente encontrado
      </div>
    )
  }

  return (
    <div>
      {props.items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onClick={() => select(i)}
          className={cn(
            'block w-full text-left px-3 py-1.5 text-sm transition-colors',
            i === idx
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
})

MentionList.displayName = 'MentionList'
export default MentionList
