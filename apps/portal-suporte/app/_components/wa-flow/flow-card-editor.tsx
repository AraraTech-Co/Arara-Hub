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
    tag: 'Etiqueta',
    question: 'Pergunta',
    assistant: 'Assistente',
    content: 'Mensagem',
    delay: 'Atraso',
    random: 'Randomizador',
    integration: 'Integração',
  }
  const tipo = TIPO[node.type ?? 'content'] ?? 'Mensagem'
  const options = d.options ?? []
  const branches = d.branches ?? []
  // 0, ausente ou vazio = "na hora". Qualquer número >= 1 abre o campo de minutos.
  const avisaDepois = Number(d.avisarApos ?? 0) > 0
  // 0, ausente ou vazio = espera para sempre.
  const semResposta = Number(d.semRespostaMin ?? 0)
  // Cards de lógica não falam com o cliente — nada de campo "mensagem" neles.
  const semMensagem =
    node.type === 'condition' ||
    node.type === 'tag' ||
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
              {node.type === 'assistant'
                ? 'Mensagem antes de o assistente assumir'
                : node.type === 'question'
                  ? 'A pergunta feita ao cliente'
                  : 'Mensagem enviada ao cliente'}
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

        {node.type === 'content' && (
          <div className="space-y-1">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={d.umaVezPorJanela === true}
                disabled={!canEdit}
                onChange={(e) => onChange({ umaVezPorJanela: e.target.checked })}
              />
              <span>
                <strong>Avisar só uma vez por período fechado</strong>
                <span className="block pt-0.5 text-[11px] italic text-muted-foreground">
                  Para o aviso de fora do horário: quem manda cinco mensagens às 23h recebe um
                  aviso, não cinco. O contador zera quando o atendimento abre de novo.
                </span>
              </span>
            </label>
          </div>
        )}

        {node.type === 'question' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="card-validacao" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                A resposta tem de ser
              </label>
              <select
                id="card-validacao"
                value={d.validacao ?? 'qualquer'}
                disabled={!canEdit}
                onChange={(e) => onChange({ validacao: e.target.value as typeof d.validacao })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="qualquer">Qualquer texto</option>
                <option value="numero">Só números</option>
                <option value="email">Um e-mail</option>
                <option value="telefone">Um telefone</option>
                <option value="cnpj">Um CNPJ válido (com dígitos conferidos)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="card-tentativas" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Tentativas antes de desistir
              </label>
              <Input
                id="card-tentativas"
                type="number"
                min={1}
                max={5}
                value={d.tentativas ?? 2}
                disabled={!canEdit}
                onChange={(e) => onChange({ tentativas: Math.min(Math.max(Number(e.target.value) || 1, 1), 5) })}
                className="w-24"
              />
              <p className="pt-1 text-[11px] italic text-muted-foreground">
                Esgotadas, o fluxo segue pela saída amarela. Sem ela ligada, vai para uma pessoa —
                insistir para sempre é o que faz o cliente desistir.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="card-erro" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Quando a resposta não vale
              </label>
              <Textarea
                id="card-erro"
                rows={2}
                value={d.erro ?? ''}
                placeholder="Não consegui entender. Pode escrever de novo?"
                disabled={!canEdit}
                onChange={(e) => onChange({ erro: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="card-guardar" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Guardar a resposta em
              </label>
              <select
                id="card-guardar"
                value={d.guardarEm ?? ''}
                disabled={!canEdit}
                onChange={(e) => onChange({ guardarEm: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Não guardar</option>
                <option value="resposta_1">Resposta 1</option>
                <option value="resposta_2">Resposta 2</option>
                <option value="resposta_3">Resposta 3</option>
                <option value="documento">Documento (CNPJ/CPF)</option>
                <option value="email_informado">E-mail informado</option>
                <option value="telefone_informado">Telefone informado</option>
              </select>
              <p className="pt-1 text-[11px] italic text-muted-foreground">
                A lista é fixa de propósito: um card do editor não escreve em qualquer campo da
                conversa. Fica guardado o valor já limpo, sem pontuação.
              </p>
            </div>
          </div>
        )}

        {node.type === 'tag' && (
          <div className="space-y-2">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Etiquetas
              </label>
              <p className="text-[11px] italic text-muted-foreground">
                Uma por linha. A etiqueta que não existir no catálogo é criada na hora.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="card-tags-aplicar" className="text-[11px] text-muted-foreground">
                Marcar na conversa
              </label>
              <Textarea
                id="card-tags-aplicar"
                rows={3}
                value={(d.tagsAplicar ?? []).join('\n')}
                disabled={!canEdit}
                onChange={(e) => onChange({
                  tagsAplicar: e.target.value.split('\n').map((t) => t.trim()).filter(Boolean),
                })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="card-tags-remover" className="text-[11px] text-muted-foreground">
                Desmarcar da conversa
              </label>
              <Textarea
                id="card-tags-remover"
                rows={2}
                value={(d.tagsRemover ?? []).join('\n')}
                disabled={!canEdit}
                onChange={(e) => onChange({
                  tagsRemover: e.target.value.split('\n').map((t) => t.trim()).filter(Boolean),
                })}
              />
            </div>
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
              max={3}
              value={d.seconds ?? 3}
              disabled={!canEdit}
              onChange={(e) => onChange({ seconds: Math.min(Math.max(Number(e.target.value) || 1, 1), 3) })}
            />
            <p className="pt-1 text-[11px] italic text-muted-foreground">
              Até 3 segundos por card, e 6 segundos somados por mensagem recebida. O limite é
              baixo de propósito: enquanto o robô espera, ele está segurando a resposta ao
              WhatsApp, e demorar demais faz o provedor achar que falhamos e mandar a mensagem do
              cliente outra vez.
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
            {/* "Área que assume" saiu daqui em 15/10/2026, pelo mesmo motivo
                que Assistente, Randomizador e Integração saíram do editor: o
                campo era gravado e NINGUÉM o lia. Quem escolhia "Vendas"
                acreditava estar encaminhando a conversa para o setor, e ela ia
                para o rodízio de sempre — a tela prometia um comportamento que
                não existe.

                O dado dos fluxos que já têm `area` fica gravado e intocado: o
                editor espalha o `data` existente a cada alteração e salva o
                objeto inteiro, então o valor sobrevive a abrir, editar e
                salvar. O tipo segue aceitando `area?: string` por isso.

                Encaminhar de verdade é entrega nova, com risco de mudar quem
                atende, e foi deliberadamente deixada fora. */}

            {/* O tempo mora aqui, no card, e não numa configuração geral: é
                este ponto do fluxo que sabe se a espera pode ou não esperar. */}
            <div className="space-y-1 pt-2">
              <label
                htmlFor="card-avisar-plantao"
                className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Avisar o plantão
              </label>
              <select
                id="card-avisar-plantao"
                value={avisaDepois ? 'depois' : 'na-hora'}
                disabled={!canEdit}
                onChange={(e) => onChange({ avisarApos: e.target.value === 'depois' ? 10 : 0 })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="na-hora">na hora</option>
                <option value="depois">depois de ___ minutos sem ninguém assumir</option>
              </select>
              {avisaDepois && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    id="card-avisar-minutos"
                    type="number"
                    min={1}
                    max={240}
                    inputMode="numeric"
                    className="w-24"
                    aria-label="Minutos sem ninguém assumir antes de avisar o plantão"
                    value={String(d.avisarApos ?? 10)}
                    disabled={!canEdit}
                    onChange={(e) => {
                      // Campo vazio não vira 0 (que significa "na hora"): ficaria
                      // mudando o sentido do campo enquanto a pessoa digita.
                      const cru = e.target.value.trim()
                      if (cru === '') { onChange({ avisarApos: undefined }); return }
                      const n = Math.round(Number(cru))
                      if (!Number.isFinite(n)) return
                      onChange({ avisarApos: Math.min(240, Math.max(1, n)) })
                    }}
                  />
                  <span className="text-xs text-muted-foreground">minutos (1 a 240)</span>
                </div>
              )}
              <p className="pt-1 text-[11px] italic text-muted-foreground">
                {avisaDepois ? (
                  <>
                    O cliente recebe a mensagem deste card <strong>na hora</strong>; só o aviso à
                    equipe espera. Se alguém assumir a conversa antes do prazo, nada é enviado. O
                    relógio bate de minuto em minuto, então o prazo tem precisão de 1 minuto. Vale
                    para conversas que chegarem a este card a partir da publicação.
                  </>
                ) : (
                  <>
                    O plantonista é avisado assim que a conversa entra na fila sem ninguém para
                    assumir — dentro da janela de plantão.
                  </>
                )}
              </p>
            </div>
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

        {/* Espera pela resposta do cliente — menu e pergunta. Fica fora dos
            blocos por tipo porque o campo é o MESMO nos dois, e duplicar o
            JSX é como as telas passam a divergir. */}
        {(node.type === 'menu' || node.type === 'question') && (
          <div className="space-y-1 border-t border-border pt-3">
            <label
              htmlFor="card-sem-resposta"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Se o cliente não responder
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="card-sem-resposta"
                type="number"
                min={1}
                max={1440}
                inputMode="numeric"
                className="w-24"
                placeholder="nunca"
                aria-label="Minutos de espera pela resposta do cliente"
                value={semResposta > 0 ? String(semResposta) : ''}
                disabled={!canEdit}
                onChange={(e) => {
                  const cru = e.target.value.trim()
                  if (cru === '') { onChange({ semRespostaMin: undefined }); return }
                  const n = Math.round(Number(cru))
                  if (!Number.isFinite(n)) return
                  onChange({ semRespostaMin: Math.min(1440, Math.max(1, n)) })
                }}
              />
              <span className="text-xs text-muted-foreground">minutos (vazio = nunca)</span>
            </div>
            <p className="pt-1 text-[11px] italic text-muted-foreground">
              {semResposta > 0 ? (
                <>
                  Passados {semResposta} min sem o cliente escrever, o fluxo segue pela saída{' '}
                  <strong>sem resposta</strong> — ligue essa bolinha a um card de lembrete,
                  encerramento ou atendente, senão nada acontece. Acontece uma vez só por
                  parada. O relógio bate de minuto em minuto, então o prazo tem precisão de 1
                  minuto. Vale para conversas que pararem neste card a partir da publicação.
                </>
              ) : (
                <>
                  Em branco, a conversa espera a resposta do cliente para sempre — é o que o
                  portal faz hoje.
                </>
              )}
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
