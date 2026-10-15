'use client'

// =============================================================================
// A sequência do mês: duas filas, e o botão que as deduz do que já está
// lançado.
//
// A equipe não decide dia a dia — segue um giro. Este painel é onde esse giro
// fica VISÍVEL antes de virar 30 dias gravados: o botão "usar o que já está
// lançado" lê os dias do mês e propõe a fila, e a pessoa confere e corrige. Sem
// esse passo, um palpite errado viraria um mês errado em um clique.
//
// Nada aqui grava: o painel só monta a prévia e devolve para a tela.
// =============================================================================

import { CalendarPlus, Plus, Search, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListaOrdenadaDeAgentes, type AgenteEscolhivel } from '@/components/schedule/lista-ordenada-de-agentes'
import type { Deducao, SequenciaDePlantao } from '@/lib/plantao-sequencia'

export function SequenciaPlantaoPanel({
  plantao, backup, agentes, deducaoPlantao, deducaoBackup, ocupados, total,
  onPlantao, onBackup, onDeduzir, onPrever, trabalhando,
}: {
  plantao: SequenciaDePlantao
  backup: SequenciaDePlantao
  agentes: AgenteEscolhivel[]
  /** O que a dedução entendeu dos dias lançados, ou null se ninguém pediu ainda. */
  deducaoPlantao: Deducao | null
  deducaoBackup: Deducao | null
  /** Quantos dias do mês já têm gente, e quantos dias o mês tem. */
  ocupados: number
  total: number
  onPlantao: (ordem: string[]) => void
  onBackup: (ordem: string[]) => void
  onDeduzir: () => void
  onPrever: () => void
  trabalhando?: boolean
}) {
  const [busca, setBusca] = useState('')
  const [papel, setPapel] = useState<'plantao' | 'backup'>('plantao')

  const alvo = busca.trim().toLowerCase()
  const disponiveis = agentes.filter((a) => {
    const fila = papel === 'plantao' ? plantao.ordem : backup.ordem
    if (fila.includes(a.id)) return false
    if (!alvo) return true
    return `${a.nome ?? ''} ${a.email ?? ''}`.toLowerCase().includes(alvo)
  })

  // Uma pessoa, uma contagem: quem está nas duas filas (o que é legítimo, o
  // gerador desvia a colisão) era contada duas vezes e a tela dizia "2 pessoas
  // sem telefone" para uma pessoa só.
  const semTelefone = [...new Set(plantao.ordem.concat(backup.ordem))]
    .map((id) => agentes.find((a) => a.id === id))
    .filter((a) => a && !a.telefone_ok)

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CalendarPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Sequência do mês</span>
        <Recado deducao={deducaoPlantao} papel="plantão" />
        <Recado deducao={deducaoBackup} papel="backup" />
        <span className="ml-auto text-xs text-muted-foreground">
          {ocupados} de {total} dias já lançados
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ListaOrdenadaDeAgentes
          titulo="Plantão"
          ajuda={`Giro de ${plantao.ordem.length || '—'}, a partir de ${plantao.ancora || '—'}.`}
          lista={plantao.ordem}
          agentes={agentes}
          onChange={onPlantao}
          travada={trabalhando}
          vazio="Sem sequência: acrescente as pessoas na ordem, ou use o que já está lançado."
        />
        <ListaOrdenadaDeAgentes
          titulo="Backup técnico"
          ajuda={`Gira separado do plantão${backup.ancora ? `, a partir de ${backup.ancora}` : ''}.`}
          lista={backup.ordem}
          agentes={agentes}
          onChange={onBackup}
          travada={trabalhando}
          vazio="Sem sequência de backup: os dias entram só com plantonista."
        />
      </div>

      {semTelefone.length > 0 && (
        <p className="rounded-md bg-sem-warning px-2.5 py-1.5 text-xs text-sem-warning-fg">
          {semTelefone.length === 1
            ? `${semTelefone[0]!.nome ?? semTelefone[0]!.id} está sem telefone: nos dias dessa pessoa ninguém é avisado.`
            : `${semTelefone.length} pessoas da sequência estão sem telefone: nos dias delas ninguém é avisado.`}
        </p>
      )}

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onDeduzir} disabled={trabalhando}>
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            Usar o que já está lançado
          </Button>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar por nome ou e-mail"
              aria-label="Procurar na equipe"
              className="h-8 pl-7"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            onClick={onPrever}
            disabled={trabalhando || plantao.ordem.length === 0}
          >
            Ver o que vai entrar
          </Button>
        </div>

        {/* Dois botões por pessoa: com uma lista só, clicar num nome seria
            ambíguo, porque há duas filas. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Acrescentar em</span>
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value as 'plantao' | 'backup')}
            aria-label="Fila que vai receber a pessoa"
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
          >
            <option value="plantao">Plantão</option>
            <option value="backup">Backup técnico</option>
          </select>
        </div>
        {disponiveis.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            {alvo ? 'Ninguém com esse nome.' : 'Todo mundo já está nesta fila.'}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {disponiveis.slice(0, 12).map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={trabalhando}
              onClick={() => (papel === 'plantao'
                ? onPlantao([...plantao.ordem, a.id])
                : onBackup([...backup.ordem, a.id]))}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              {a.nome ?? a.email ?? a.id}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** O que a dedução entendeu, dito em uma linha — inclusive quando não fechou. */
function Recado({ deducao, papel }: { deducao: Deducao | null; papel: string }) {
  if (!deducao) return null
  const { sequencia, confirmado, temVao, diasUsados, diasIgnorados, quebrouEm, buracos } = deducao

  if (!diasUsados) {
    return <Aviso tom="neutro">{`nenhum dia de ${papel} lançado para deduzir`}</Aviso>
  }
  // Quebra e buraco andam juntos (um buraco exige alguém ocupando duas
  // posições, e aí a quebra aparece). Nos dois casos a fila NÃO é carregada,
  // porque encurtá-la rodaria as posições e ela contradiria o dia que a
  // deduziu — a mensagem precisa dizer isso, senão a pessoa fica esperando uma
  // lista que não vem.
  if (quebrouEm || buracos.length) {
    return (
      <Aviso tom="atencao">
        {`o ${papel} não forma um giro${quebrouEm ? `: o dia ${quebrouEm} contraria a fila` : ''} — a lista não foi preenchida, monte a ordem`}
      </Aviso>
    )
  }
  if (temVao) {
    // O vão pode ser dia vazio OU dia que a dedução ignora (mais de uma pessoa
    // de plantão). Dizer "sem lançar" nos dois casos era falso no segundo.
    return (
      <Aviso tom="neutro">
        {`${papel}: fila de ${sequencia.ordem.length} proposta, mas há dia no meio que não entra na conta`}
        {diasIgnorados > 0
          ? ` (${diasIgnorados} com mais de uma pessoa)`
          : ' (dia sem lançar)'}
        {' — o giro não se confirma sozinho'}
      </Aviso>
    )
  }
  if (!confirmado) {
    return (
      <Aviso tom="neutro">
        {`${papel}: fila de ${sequencia.ordem.length} proposta a partir de ${diasUsados} ${diasUsados === 1 ? 'dia' : 'dias'}, sem repetição para confirmar`}
      </Aviso>
    )
  }
  return (
    <Aviso tom="bom">
      {`${papel}: giro de ${sequencia.ordem.length}, confere com ${diasUsados} dias lançados`}
      {diasIgnorados > 0 ? ` (${diasIgnorados} com mais de uma pessoa, ignorados)` : ''}
    </Aviso>
  )
}

function Aviso({ tom, children }: { tom: 'bom' | 'atencao' | 'neutro'; children: React.ReactNode }) {
  const cor = tom === 'bom'
    ? 'bg-sem-success text-sem-success-fg'
    : tom === 'atencao'
      ? 'bg-sem-warning text-sem-warning-fg'
      : 'bg-muted text-muted-foreground'
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cor}`}>{children}</span>
}
