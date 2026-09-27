'use client'

import { useCallback, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api/client'
import { whatsappApi } from '@/lib/api/whatsapp'

// ─── useAssignment ────────────────────────────────────────────────────────────
// Atribuir / reatribuir / desatribuir estava replicado em três lugares
// (assign-controls, assign-menu e crm-context-panel), cada um com um tratamento
// de erro ligeiramente diferente — em especial o 409 de "já atribuída ou limite
// atingido", que só um deles tratava bem. Aqui fica a regra única.

interface UseAssignmentOptions {
  /** Chamado após uma ação bem-sucedida (ex.: refetch do painel de CRM).
   *  Na inbox não é preciso: o SSE atualiza a conversa por id. */
  onDone?: () => void | Promise<void>
}

export function useAssignment(conversationId: string | null, options?: UseAssignmentOptions) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const onDone = options?.onDone

  const run = useCallback(
    async (action: () => Promise<unknown>, errorTitle: string) => {
      if (!conversationId || busy) return
      setBusy(true)
      try {
        await action()
        await onDone?.()
      } catch (err) {
        // 409 é esperado: outra pessoa pegou a conversa antes, ou o atendente
        // bateu o limite de conversas simultâneas. Merece mensagem própria.
        const conflict = err instanceof ApiError && err.status === 409
        toast({
          title: conflict ? 'Não foi possível atender' : errorTitle,
          description:
            err instanceof Error
              ? err.message || 'Conversa já atribuída ou limite atingido.'
              : 'Tente novamente.',
          variant: 'destructive',
        })
      } finally {
        setBusy(false)
      }
    },
    [conversationId, busy, onDone, toast],
  )

  const assign = useCallback(
    () => run(() => whatsappApi.assignConversation(conversationId!), 'Erro ao atender'),
    [run, conversationId],
  )

  const reassign = useCallback(
    (agentId: string) =>
      run(() => whatsappApi.reassignConversation(conversationId!, agentId), 'Erro ao reatribuir'),
    [run, conversationId],
  )

  const unassign = useCallback(
    () => run(() => whatsappApi.unassignConversation(conversationId!), 'Erro ao remover atribuição'),
    [run, conversationId],
  )

  return { busy, assign, reassign, unassign }
}
