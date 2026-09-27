'use client'

import { Plus, Trash2, X } from 'lucide-react'
import type { Node } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { WAGraphNode } from '@/lib/wa-flow-graph'

/**
 * Painel lateral do editor de fluxo: edita o card selecionado.
 *
 * Fase 3: além de textos, dá para adicionar/remover opções de um menu e apagar
 * o card. Apagar o nó inicial é bloqueado — sem raiz o fluxo não roda.
 */
export function FlowCardEditor({
  node,
  isRoot,
  canEdit,
  onChange,
  onDelete,
  onClose,
}: {
  node: Node
  isRoot: boolean
  canEdit: boolean
  onChange: (patch: Partial<WAGraphNode['data']>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const d = node.data as WAGraphNode['data']
  const TIPO: Record<string, string> = {
    menu: 'Menu',
    handoff: 'Atendente',
    condition: 'Condição',
    assistant: 'Assistente',
    content: 'Mensagem',
    delay: 'Atraso',
    random: 'Randomizador',
    integration: 'Integração',
  }
  const tipo = TIPO[node.type ?? 'content'] ?? 'Mensagem'
  const options = d.options ?? []
  const branches = d.branches ?? []
  // Cards de lógica não falam com o cliente — nada de campo "mensagem" neles.
  const semMensagem =
    node.type === 'condition' ||
    node.type === 'delay' ||
    node.type === 'random' ||
    node.type === 'integration'

  function setBranch(i: number, patch: Partial<{ label: string; weight: number }>) {
    const next = [...branches]
    next[i] = { ...next[i], ...patch }
    onChange({ branches: next })
  }

  function addBranch() {
    const id = `b${Math.random().toString(36).slice(2, 8)}`
    onChange({ branches: [...branches, { id, label: `Saída ${branches.length + 1}`, weight: 1 }] })
  }

  function removeBranch(i: number) {
    onChange({ branches: branches.filter((_, idx) => idx !== i) })
  }

  function setOption(i: number, label: string) {
    const next = [...options]
    next[i] = { ...next[i], label }
    onChange({ options: next })
  }

  function addOption() {
    const id = `op${Math.random().toString(36).slice(2, 8)}`
    onChange({ options: [...options, { id, label: 'Nova opção' }] })
  }

  function removeOption(i: number) {
    onChange({ options: options.filter((_, idx) => idx !== i) })
  }

  return (
    <aside className="absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-80 overflow-auto rounded-xl border border-border bg-card shadow-lg">
      <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{d.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {tipo}
            {isRoot ? ' · início do fluxo' : ''} · <code className="text-[10px]">{node.id}</code>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-3 px-3 py-3">
        <div className="space-y-1">
          <label htmlFor="card-label" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Título do card
          </label>
          <Input id="card-label" value={d.label} disabled={!canEdit} onChange={(e) => onChange({ label: e.target.value })} />
        </div>

        {node.type === 'condition' && (
          <div className="space-y-1">
            <label htmlFor="card-check" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Condição avaliada
            </label>
            <select
              id="card-check"
              value={d.check ?? 'businessHours'}
              disabled={!canEdit}
              onChange={(e) => onChange({ check: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="businessHours">Está dentro do horário de atendimento?</option>
              <option value="hasTicket">A conversa já tem chamado aberto?</option>
            </select>
            <p className="pt-1 text-[11px] italic text-muted-foreground">
              Ligue as saídas <strong>Sim</strong> e <strong>Não</strong> a cards diferentes. Este
              card não envia mensagem — é só o desvio.
            </p>
          </div>
        )}

        {!semMensagem && (
          <div className="space-y-1">
            <label htmlFor="card-text" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {node.type === 'assistant' ? 'Mensagem antes de o assistente assumir' : 'Mensagem enviada ao cliente'}
            </label>
            <Textarea id="card-text" rows={5} value={d.text} disabled={!canEdit} onChange={(e) => onChange({ text: e.target.value })} />
            {node.type === 'assistant' && (
              <p className="pt-1 text-[11px] italic text-muted-foreground">
                A partir daqui quem conduz é o assistente (Claude). Se ele estiver desligado, a
                conversa vai para a fila da equipe.
              </p>
            )}
          </div>
        )}

        {node.type === 'delay' && (
          <div className="space-y-1">
            <label htmlFor="card-seconds" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Esperar (segundos)
            </label>
            <Input
              id="card-seconds"
              type="number"
              min={1}
              max={900}
              value={d.seconds ?? 5}
              disabled={!canEdit}
              onChange={(e) => onChange({ seconds: Math.min(Math.max(Number(e.target.value) || 1, 1), 900) })}
            />
            <p className="pt-1 text-[11px] italic text-muted-foreground">
              Máximo de 15 minutos. Enquanto espera, o fluxo ignora o que o cliente escrever — é o
              card seguinte que continua a conversa.
            </p>
          </div>
        )}

        {node.type === 'random' && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Saídas ({branches.length})
            </p>
            {branches.map((b, i) => (
              <div key={b.id} className="flex items-center gap-1.5">
                <Input
                  value={b.label}
                  disabled={!canEdit}
                  aria-label={`Nome da saída ${i + 1}`}
                  onChange={(e) => setBranch(i, { label: e.target.value })}
                />
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="w-16 shrink-0"
                  value={b.weight}
                  disabled={!canEdit}
                  aria-label={`Peso da saída ${i + 1}`}
                  onChange={(e) => setBranch(i, { weight: Math.min(Math.max(Number(e.target.value) || 1, 1), 100) })}
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeBranch(i)}
                    aria-label={`Remover saída ${i + 1}`}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <Button size="sm" variant="secondary" className="w-full" onClick={addBranch}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar saída
              </Button>
            )}
            <p className="pt-1 text-[11px] italic text-muted-foreground">
              O peso é relativo: com pesos 1 e 3, a segunda saída recebe 75% das conversas.
            </p>
          </div>
        )}

        {node.type === 'integration' && (
          <div className="space-y-1">
            <label htmlFor="card-url" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              URL do webhook
            </label>
            <Input
              id="card-url"
              value={d.url ?? ''}
              disabled={!canEdit}
              placeholder="https://exemplo.com/webhook"
              onChange={(e) => onChange({ url: e.target.value })}
            />
            <p className="pt-1 text-[11px] italic text-muted-foreground">
              Envia um POST com os dados da conversa e segue por <strong>Sucesso</strong> ou{' '}
              <strong>Erro</strong>. Só endereços https públicos são aceitos — o portal recusa URLs
              que apontem para dentro da rede.
            </p>
          </div>
        )}

        {node.type === 'handoff' && (
          <div className="space-y-1">
            <label htmlFor="card-area" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Área que assume
            </label>
            <select
              id="card-area"
              value={d.area ?? 'suporte'}
              disabled={!canEdit}
              onChange={(e) => onChange({ area: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="suporte">Suporte</option>
              <option value="administrativo">Administrativo / Financeiro</option>
              <option value="vendas">Vendas</option>
            </select>
          </div>
        )}

        {node.type === 'menu' && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Opções ({options.length})
            </p>
            {options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-right text-[11px] text-muted-foreground">{i + 1}.</span>
                <Input
                  value={o.label}
                  disabled={!canEdit}
                  aria-label={`Texto da opção ${i + 1}`}
                  onChange={(e) => setOption(i, e.target.value)}
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label={`Remover opção ${i + 1}`}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <Button size="sm" variant="secondary" className="w-full" onClick={addOption}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar opção
              </Button>
            )}
            <p className="pt-1 text-[11px] italic text-muted-foreground">
              Arraste da bolinha ao lado da opção até outro card para ligar o caminho.
            </p>
          </div>
        )}

        {canEdit && !isRoot && (
          <div className="border-t border-border pt-3">
            <Button size="sm" variant="destructive" className="w-full" onClick={onDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar este card
            </Button>
          </div>
        )}
        {isRoot && (
          <p className="border-t border-border pt-2 text-[11px] italic text-muted-foreground">
            Este é o card inicial — não pode ser apagado.
          </p>
        )}
      </div>
    </aside>
  )
}
