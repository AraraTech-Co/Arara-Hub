'use client'

import { Sparkles } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * IA humanizada — BLOQUEADA até segunda ordem (decisão de 17/08/2026).
 *
 * O motor no servidor já sabe chamar a IA, mas ligar isso é decisão de
 * produto que ainda vai ser discutida: é cliente real do outro lado, e uma
 * resposta gerada sai no nome da Arara. Enquanto a discussão não acontece, o
 * interruptor fica visível e inerte — riscado, sem clique e sem chamada de
 * rede.
 *
 * Visível e não escondido de propósito: sumir com o botão faria a conversa
 * recomeçar do zero ("cadê a IA?"). Riscado, ele conta o estado — existe,
 * está previsto, e está travado.
 *
 * Para reativar: devolver o corpo antigo (git mostra em bot-toggle.tsx antes
 * deste commit) e conferir as duas dependências que faltavam —
 * `anthropic_api_key` no cofre e `api.anthropic.com` na allowlist de saída da
 * plataforma. Nenhuma das duas existe hoje, então nem por chamada direta à API
 * a IA responderia.
 */
export function BotToggle({ className }: { className?: string }) {
  return (
    <span
      aria-disabled
      title="IA humanizada — bloqueada até definição. Não pode ser ativada."
      className={cn(
        'flex cursor-not-allowed items-center gap-2 rounded-full border border-dashed border-border bg-muted/30 px-2.5 py-1 text-xs opacity-60',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground line-through decoration-muted-foreground/70">
        IA humanizada
      </span>
      <Switch checked={false} disabled aria-label="IA humanizada (bloqueada)" />
    </span>
  )
}
