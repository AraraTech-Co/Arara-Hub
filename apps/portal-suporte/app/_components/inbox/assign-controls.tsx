'use client'

import { Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAssignment } from '@/hooks/use-assignment'
import { type WAInboxConversation } from '@/lib/api/whatsapp'

interface AssignControlsProps {
  conversation: WAInboxConversation
  /** Id do atendente logado (de /api/auth/me). */
  meId: string | null
}

/**
 * Controles de atribuição no header do thread-pane.
 * - Não atribuída → botão "Atender".
 * - Atribuída → responsável + "Reatribuir para mim".
 *
 * A lógica (incluindo o 409 de conversa já tomada) vive em `useAssignment`,
 * compartilhada com o painel de CRM.
 */
export function AssignControls({ conversation, meId }: AssignControlsProps) {
  // O SSE atualiza a conversa por id — não precisa de refetch manual aqui.
  const { busy, assign, reassign } = useAssignment(conversation.id)

  const assigned = conversation.assigned_to

  if (!assigned) {
    return (
      <Button type="button" size="sm" onClick={() => void assign()} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        <span className="ml-1.5">Atender</span>
      </Button>
    )
  }

  const isMine = meId != null && assigned.id === meId

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Responsável:{' '}
        <span className="font-medium text-foreground">
          {assigned.name ?? 'Sem nome'}
        </span>
      </span>
      {!isMine && meId && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void reassign(meId)}
          disabled={busy}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reatribuir para mim'}
        </Button>
      )}
    </div>
  )
}
