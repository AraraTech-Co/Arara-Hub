'use client'

import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef } from 'react'
import { Bold, Italic, List, Code } from 'lucide-react'
import { cn } from '@/lib/utils'
import MentionList, { type MentionListRef } from './mention-list'

export interface AgentOption {
  id: string
  full_name: string | null
  email: string
}

interface RichMessageEditorProps {
  value: string
  onChange: (html: string) => void
  onMentionsChange?: (ids: string[]) => void
  agents?: AgentOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function RichMessageEditor({
  value,
  onChange,
  onMentionsChange,
  agents = [],
  placeholder = 'Digite sua mensagem…',
  disabled = false,
  className,
}: RichMessageEditorProps) {
  const agentsRef = useRef(agents)
  agentsRef.current = agents

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        orderedList: false,
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: ({ query }: { query: string }) =>
            agentsRef.current
              .filter(a => {
                const name = a.full_name ?? a.email
                return name.toLowerCase().includes(query.toLowerCase())
              })
              .slice(0, 8)
              .map(a => ({ id: a.id, label: a.full_name ?? a.email })),

          render: () => {
            let renderer: ReactRenderer<MentionListRef> | null = null
            let popup: HTMLDivElement | null = null

            const position = (clientRect: (() => DOMRect | null) | null | undefined) => {
              if (!popup || !clientRect) return
              const rect = clientRect()
              if (!rect) return
              popup.style.top  = `${rect.bottom + window.scrollY + 4}px`
              popup.style.left = `${rect.left + window.scrollX}px`
            }

            return {
              onStart(props: any) {
                popup = document.createElement('div')
                popup.className =
                  'absolute z-50 min-w-[180px] rounded-md border bg-popover shadow-md overflow-hidden py-1'
                document.body.appendChild(popup)
                position(props.clientRect)

                renderer = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                })
                popup.appendChild(renderer.element)
              },
              onUpdate(props: any) {
                renderer?.updateProps(props)
                position(props.clientRect)
              },
              onKeyDown(props: any) {
                return renderer?.ref?.onKeyDown(props) ?? false
              },
              onExit() {
                popup?.remove()
                popup = null
                renderer?.destroy()
                renderer = null
              },
            }
          },
        },
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate({ editor: e }) {
      onChange(e.getHTML())

      if (onMentionsChange) {
        const ids: string[] = []
        e.state.doc.descendants(node => {
          if (node.type.name === 'mention' && node.attrs.id) ids.push(node.attrs.id)
        })
        onMentionsChange([...new Set(ids)])
      }
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  if (!editor) return null

  return (
    <div className={cn('rounded-md border border-input bg-background', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-input px-2 py-1">
        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Código">
          <Code className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <span className="text-[10px] text-muted-foreground select-none">@ para mencionar</span>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className={cn(
          'tiptap-editor px-3 py-2 text-sm min-h-[100px] max-h-[300px] overflow-y-auto focus-visible:outline-none',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      />
    </div>
  )
}

function ToolbarBtn({
  children, active, onClick, title,
}: { children: React.ReactNode; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-1 transition-colors',
        active
          ? 'bg-muted text-foreground dark:bg-muted dark:text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}
