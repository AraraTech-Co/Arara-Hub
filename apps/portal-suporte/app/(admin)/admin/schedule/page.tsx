'use client'

// =============================================================================
// Plantão — o mês inteiro, como um calendário.
//
// Antes eram cinco abas (Semanal, Diária, Mensal, Warroom, Noturna) sobre um
// único model sem schema, gravando dois esquemas diferentes. "Colocar o Fulano
// de plantão esta noite" custava 4 cliques e uma digitação, e as abas Diária,
// Mensal, Warroom e Noturna mostravam "Sem escala" MESMO COM DADOS GRAVADOS,
// porque a listagem mandava start/end como filtro de coluna (corrigido no
// backend, entrega 3a).
//
// Decisões do Leonardo (09/10/2026) que desenham esta tela:
//  - uma escala só: o Plantão, por data, com ordem de chamada;
//  - N1/N2/N3 é severidade do CHAMADO e saiu da escala;
//  - war room é estado de incidente, não turno, e saiu também;
//  - janela fixa seg–sex 18–22 e sáb–dom 8–22, configurada junto com o horário
//    de atendimento (entrega 2). Fora dela ninguém é acordado.
//
// Decisões do Leonardo (14/10/2026), que trouxeram o mês e a sequência:
//  - o mês inteiro na tela, como um calendário normal — a semana obrigava a
//    navegar para enxergar a escala;
//  - o giro é por dia e o FIM DE SEMANA entra como qualquer outro dia;
//  - a sequência fica numa lista visível, e há um botão que a deduz do que já
//    está lançado — as duas coisas, não uma só;
//  - preencher NUNCA altera dia já lançado, e mostra a prévia antes;
//  - o dia continua editável no diálogo: a troca pontual não depende de
//    regerar nada.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Loader2, Phone, PhoneOff, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { schedulesApi, type PlantaoDia, type QuemAvisarAgora } from '@/lib/api/schedules'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { cn } from '@/lib/utils'
import { DiaDoPlantaoDialog, type AgenteEscolhivel } from '@/components/schedule/dia-do-plantao-dialog'
import { SequenciaPlantaoPanel } from '@/components/schedule/sequencia-plantao-panel'
import {
  colunaDaSemana, decidirGravacao, deducaoUtilizavel, deduzirSequencia, diasDoMes, nomeCurto,
  planejarPreenchimento,
  type Deducao, type DiaGerado, type PlanoDePreenchimento, type SequenciaDePlantao,
} from '@/lib/plantao-sequencia'

const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** AAAA-MM-DD no fuso local — `toISOString()` daria o dia errado à noite. */
function isoLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function tituloDoMes(data: string): string {
  const [ano, mes] = data.split('-')
  return `${MESES[Number(mes) - 1]} de ${ano}`
}

/** Soma meses a um AAAA-MM-DD, sempre caindo no dia 1. */
function mesVizinho(data: string, passo: number): string {
  const d = new Date(data + 'T00:00:00Z')
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + passo, 1))
  return alvo.toISOString().slice(0, 10)
}

const SEM_SEQUENCIA: SequenciaDePlantao = { ordem: [], ancora: '' }

export default function PlantaoPage() {
  const { toast } = useToast()
  const hoje = isoLocal(new Date())
  const [mesRef, setMesRef] = useState(() => hoje.slice(0, 8) + '01')
  const [dias, setDias] = useState<PlantaoDia[]>([])
  const [agora, setAgora] = useState<QuemAvisarAgora | null>(null)
  const [equipe, setEquipe] = useState<AgenteEscolhivel[]>([])
  const [carregando, setCarregando] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  // A sequência vive aqui, na tela: nada dela é gravado.
  const [plantao, setPlantao] = useState<SequenciaDePlantao>(SEM_SEQUENCIA)
  const [backup, setBackup] = useState<SequenciaDePlantao>(SEM_SEQUENCIA)
  const [deducaoPlantao, setDeducaoPlantao] = useState<Deducao | null>(null)
  const [deducaoBackup, setDeducaoBackup] = useState<Deducao | null>(null)
  const [plano, setPlano] = useState<PlanoDePreenchimento | null>(null)
  const [refazer, setRefazer] = useState(false)
  const [gravados, setGravados] = useState(0)

  const doMes = useMemo(() => diasDoMes(mesRef), [mesRef])
  const de = doMes[0] ?? mesRef
  const ate = doMes[doMes.length - 1] ?? mesRef

  // Número do pedido mais recente. Tem de viver numa REFERÊNCIA: comparar o mês
  // com uma cópia dele dentro do mesmo `useCallback` compara a variável com ela
  // mesma e nunca descarta nada. Sem isto, a busca do mês antigo respondia por
  // último e a tela mostrava o mês novo com os dias do velho.
  const pedidoAtual = useRef(0)

  const carregar = useCallback(async () => {
    const meuPedido = pedidoAtual.current + 1
    pedidoAtual.current = meuPedido
    const souOAtual = () => pedidoAtual.current === meuPedido
    setCarregando(true)
    try {
      const [lista, oncall, agentesRes] = await Promise.all([
        schedulesApi.listar(de, ate),
        schedulesApi.quemAvisarAgora(),
        araraApiFetch('/api/profiles/agents'),
      ])
      if (!souOAtual()) return
      setDias(lista.data ?? [])
      setAgora(oncall.data ?? null)
      setLoadError(false)
      const brutos = agentesRes instanceof Response && agentesRes.ok
        ? ((await agentesRes.json())?.data ?? [])
        : []
      // Reconferido depois DESTE await também: hoje `equipe` não depende do
      // mês, mas a guarda não pode valer só para o primeiro await do corpo.
      if (!souOAtual()) return
      setEquipe(
        (brutos as Record<string, unknown>[]).map((a) => ({
          id: String(a.id),
          nome: (a.full_name as string) ?? (a.name as string) ?? null,
          email: (a.email as string) ?? null,
          // A lista de agentes não diz se tem telefone; o plantão do dia diz.
          // Aqui começa otimista e é corrigido pelo que o servidor devolve.
          telefone_ok: Boolean(a.phone),
        })),
      )
    } catch {
      if (!souOAtual()) return
      setLoadError(true)
      toast({ title: 'Não foi possível carregar o plantão', variant: 'destructive' })
    } finally {
      // O spinner também é do pedido atual: a resposta velha não pode apagar o
      // "carregando" de uma busca que ainda está em curso.
      if (souOAtual()) setCarregando(false)
    }
  }, [de, ate, toast])

  useEffect(() => { void carregar() }, [carregar])
  // Trocar de mês descarta a prévia E os recados da dedução: os dois falam de
  // dias que já não estão na tela. Sem isto, o badge verde "confere com 5 dias
  // lançados" seguia aparecendo num mês vazio.
  useEffect(() => {
    setPlano(null)
    setRefazer(false)
    setDeducaoPlantao(null)
    setDeducaoBackup(null)
    // E os dias do mês anterior saem da tela. Enquanto a resposta nova não
    // chega, a tela não tem o que afirmar: antes o contador dizia "5 lançados"
    // num mês vazio, e deduzir ou prever nessa janela montava fila e prévia
    // sobre os dias do mês que a pessoa acabou de deixar.
    setDias([])
  }, [mesRef])

  const porData = useMemo(() => {
    const m = new Map<string, PlantaoDia>()
    for (const d of dias) m.set(d.date, d)
    return m
  }, [dias])

  // O telefone conferido pelo servidor é a verdade: a lista de agentes pode
  // não trazer o campo.
  const equipeComTelefone = useMemo(() => {
    const conhecido = new Map<string, boolean>()
    for (const d of dias) {
      for (const a of d.agentes) conhecido.set(a.id, a.telefone_ok)
      for (const b of d.backup) conhecido.set(b.id, b.telefone_ok)
    }
    return equipe.map((a) => ({ ...a, telefone_ok: conhecido.get(a.id) ?? a.telefone_ok }))
  }, [equipe, dias])

  const nomeDe = useCallback(
    (id: string) => nomeCurto(equipeComTelefone.find((a) => a.id === id)?.nome ?? null, id),
    [equipeComTelefone],
  )

  const lancadosDoMes = useMemo(
    () => dias.map((d) => ({ date: d.date, agent_ids: d.agent_ids, backup_ids: d.backup_ids })),
    [dias],
  )
  const ocupados = useMemo(
    () => lancadosDoMes.filter((d) => d.agent_ids.length > 0 || d.backup_ids.length > 0).length,
    [lancadosDoMes],
  )

  const erro = (err: unknown, title: string) =>
    toast({
      title,
      description: err instanceof Error ? err.message : 'Tente novamente.',
      variant: 'destructive',
    })

  async function salvarDia(data: string, ids: string[], backupIds: string[]) {
    setSalvando(true)
    try {
      await schedulesApi.salvarDia(data, ids, backupIds)
      setEditando(null)
      // A prévia foi calculada com este dia como estava: ela não vale mais.
      setPlano(null)
      setRefazer(false)
      // O recado da dedução falava dos dias de antes desta mudança.
      setDeducaoPlantao(null)
      setDeducaoBackup(null)
      await carregar()
      toast({
        title: 'Plantão salvo',
        description: `${data}: ${ids.length} de plantão` + (backupIds.length ? `, ${backupIds.length} de backup técnico.` : '.'),
      })
    } catch (err) {
      // A recusa do servidor diz o que está errado (pessoa repetida, agente
      // que não existe) — vale mostrar o texto dele.
      erro(err, 'Não salvou')
    } finally {
      setSalvando(false)
    }
  }

  async function limparDia(data: string) {
    setSalvando(true)
    try {
      await schedulesApi.limparDia(data)
      setEditando(null)
      setPlano(null)
      setRefazer(false)
      // O recado da dedução falava dos dias de antes desta mudança.
      setDeducaoPlantao(null)
      setDeducaoBackup(null)
      await carregar()
      toast({ title: 'Plantão removido', description: `${data} ficou sem plantão.` })
    } catch (err) {
      erro(err, 'Não removeu')
    } finally {
      setSalvando(false)
    }
  }

  /** Lê os dias lançados e propõe as duas filas. Não grava nada. */
  function deduzir() {
    const p = deduzirSequencia(lancadosDoMes, 'plantao')
    const b = deduzirSequencia(lancadosDoMes, 'backup')
    setDeducaoPlantao(p)
    setDeducaoBackup(b)
    // Só carrega a fila que REPRODUZ os dias de onde saiu. Fila com buraco ou
    // contrariada por um dia não serve de ponto de partida: tirar os vazios
    // encurta a fila, mantém a âncora e roda todas as posições, de modo que a
    // fila passa a contradizer justamente o dia que a deduziu. Nesse caso a
    // lista fica como está e o recado diz o que confira.
    if (deducaoUtilizavel(p)) setPlantao({ ordem: p.sequencia.ordem, ancora: p.sequencia.ancora })
    if (deducaoUtilizavel(b)) setBackup({ ordem: b.sequencia.ordem, ancora: b.sequencia.ancora })
    setPlano(null)
  }

  function prever(comRefazer: boolean) {
    const p = planejarPreenchimento({
      dias: doMes,
      plantao: { ...plantao, ancora: plantao.ancora || de },
      backup: backup.ordem.length ? { ...backup, ancora: backup.ancora || de } : undefined,
      lancados: lancadosDoMes,
      refazer: comRefazer,
    })
    setRefazer(comRefazer)
    setPlano(p)
  }

  /**
   * Grava dia a dia, com a rota que já existe. Na primeira falha PARA e diz em
   * que dia parou. Os dias gravados antes valem por si, e a prévia é
   * descartada: depois de uma gravação parcial ela não descreve mais o que
   * falta. Para continuar, monte a prévia de novo — ela vai nascer já
   * preservando o que entrou.
   */
  async function gravarPlano() {
    if (!plano || !plano.dias.length) return
    setSalvando(true)
    setGravados(0)
    let feitos = 0
    // RECONFERE antes de gravar. Entre a prévia e o clique a escala pode ter
    // mudado — por você no diálogo, ou por outra pessoa em outra aba. Gravar o
    // plano velho passaria por cima de uma troca combinada, com a tela dizendo
    // que nenhum dia lançado seria alterado.
    //
    // Em `try` próprio: falhar AQUI não é gravação parcial, e dizer "parou no
    // dia tal" com zero dias gravados assusta por nada. A prévia fica onde
    // está, para a pessoa tentar de novo sem remontar nada.
    try {
      const fresco = await schedulesApi.listar(de, ate)
      const decisao = decidirGravacao({
        plano,
        dias: doMes,
        plantao: { ...plantao, ancora: plantao.ancora || de },
        backup: backup.ordem.length ? { ...backup, ancora: backup.ancora || de } : undefined,
        lancados: (fresco.data ?? []).map((d) => ({
          date: d.date, agent_ids: d.agent_ids, backup_ids: d.backup_ids,
        })),
        refazer,
      })
      // O que está na tela passa a ser o que acabou de ser lido: a linha "sai"
      // de cada célula não pode falar de um estado anterior à conferência.
      setDias(fresco.data ?? [])
      if (decisao.acao === 'mudou') {
        setPlano(decisao.plano)
        toast({
          title: 'A escala mudou desde a prévia',
          description: 'Nada foi gravado. A prévia na tela já é a nova — confira e grave de novo.',
          variant: 'destructive',
        })
        setSalvando(false)
        return
      }
    } catch (err) {
      toast({
        title: 'Não deu para reconferir a escala',
        description: `Nada foi gravado. ${err instanceof Error ? err.message : 'Tente de novo.'}`,
        variant: 'destructive',
      })
      setSalvando(false)
      return
    }

    try {
      for (const d of plano.dias) {
        await schedulesApi.salvarDia(d.data, d.agentIds, d.backupIds)
        feitos += 1
        setGravados(feitos)
      }
      setPlano(null)
      // O lote muda o mês inteiro: o recado da dedução falava dos dias de
      // antes. `salvarDia` e `limparDia` já descartavam; faltava aqui.
      setDeducaoPlantao(null)
      setDeducaoBackup(null)
      await carregar()
      toast({
        title: `${feitos} ${feitos === 1 ? 'dia gravado' : 'dias gravados'}`,
        description: 'Entraram como estão na tela. Nada foi publicado em lugar nenhum.',
      })
    } catch (err) {
      setDeducaoPlantao(null)
      setDeducaoBackup(null)
      await carregar()
      toast({
        title: `Parou no dia ${plano.dias[feitos]?.data ?? '?'}`,
        description: `${feitos} ${feitos === 1 ? 'dia foi gravado' : 'dias foram gravados'} antes. ${err instanceof Error ? err.message : ''}`.trim(),
        variant: 'destructive',
      })
      setPlano(null)
    } finally {
      setSalvando(false)
      setGravados(0)
    }
  }

  const previstos = useMemo(() => {
    const m = new Map<string, DiaGerado>()
    for (const d of plano?.dias ?? []) m.set(d.data, d)
    return m
  }, [plano])

  if (carregando && !dias.length && !loadError) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:py-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plantão</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem é avisado quando um cliente escreve fora do horário de atendimento. A ordem dentro
            do dia é a ordem de chamada.
          </p>
        </div>

        {/* Estado de agora: é a função quemAvisar(agora) mostrada na tela. */}
        <Card className="p-4">
          {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!carregando && agora && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Clock className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="text-sm font-medium">
                {agora.agora.em_plantao
                  ? `Em plantão agora${agora.agora.faixa ? ` (${agora.agora.faixa[0]}–${agora.agora.faixa[1]})` : ''}`
                  : 'Fora da janela de plantão'}
              </span>
              {agora.avisar.length > 0 && (
                <span className="flex flex-wrap items-center gap-1.5 text-sm">
                  {agora.avisar.map((a, i) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <span className="text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                      {a.nome ?? a.id}
                      <Phone className="h-3 w-3 text-emerald-600" aria-label="telefone cadastrado" />
                    </span>
                  ))}
                </span>
              )}
              {/* O motivo só acrescenta quando diz algo que o rótulo ao lado
                  ainda não disse. Fora da janela, os dois diziam a mesma frase:
                  "Fora da janela de plantão — ninguém: fora da janela de
                  plantão". Dentro da janela sem ninguém, o motivo é a
                  informação que importa (sem plantão no dia, ou os escalados
                  sem telefone). */}
              {agora.avisar.length === 0 && agora.motivo && agora.agora.em_plantao && (
                <span className="text-sm text-muted-foreground">— ninguém: {agora.motivo}</span>
              )}
              {agora.avisar.length === 0 && !agora.agora.em_plantao && (
                <span className="text-sm text-muted-foreground">— ninguém é avisado agora</span>
              )}
              {/* O backup técnico aparece junto do plantonista: quem olha o topo
                  quer saber os DOIS de uma vez. Fora da janela nada disso
                  aparece, porque não há quem avisar agora. */}
              {agora.agora.em_plantao && agora.backup_do_dia.length > 0 && (
                <span className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">· Backup técnico:</span>
                  {agora.backup_do_dia.map((b) => b.nome ?? b.id).join(', ')}
                  <Phone className="h-3 w-3 text-emerald-600" aria-label="telefone cadastrado" />
                </span>
              )}
              {agora.agora.em_plantao && agora.backup_do_dia.length === 0 && (
                <span className="text-sm text-muted-foreground">· sem backup técnico</span>
              )}
              {agora.sem_telefone.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-md bg-sem-warning px-2 py-1 text-xs text-sem-warning-fg">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Escalado sem telefone, não recebe aviso:{' '}
                  {agora.sem_telefone.map((a) => a.nome ?? a.id).join(', ')}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {agora.agora.data} · {agora.agora.fuso}
              </span>
            </div>
          )}
        </Card>

        {loadError && (
          <p className="text-sm text-destructive">
            Não foi possível carregar os dias.{' '}
            <button className="underline" onClick={() => void carregar()}>Tentar novamente</button>
          </p>
        )}

        {/* O mês: navegação e o calendário. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button" variant="outline" size="sm" aria-label="Mês anterior" disabled={salvando}
            onClick={() => setMesRef((m) => mesVizinho(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{tituloDoMes(mesRef)}</span>
          <Button
            type="button" variant="outline" size="sm" aria-label="Mês seguinte" disabled={salvando}
            onClick={() => setMesRef((m) => mesVizinho(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {mesRef.slice(0, 7) !== hoje.slice(0, 7) && (
            <Button type="button" variant="ghost" size="sm" disabled={salvando} onClick={() => setMesRef(hoje.slice(0, 8) + '01')}>
              Voltar para este mês
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {ocupados} lançados · {doMes.length - ocupados} vazios
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {DIAS_CURTOS.map((d) => (
            <div key={d} className="pb-0.5 pl-1 text-[11px] text-muted-foreground">{d}</div>
          ))}
          {Array.from({ length: colunaDaSemana(de) ?? 0 }).map((_, i) => (
            <div key={`vazio-${i}`} aria-hidden className="min-h-[4.5rem]" />
          ))}
          {doMes.map((data) => {
            const dia = porData.get(data)
            const prev = previstos.get(data)
            const ehHoje = data === hoje
            const temGente = !!dia && (dia.agentes.length > 0 || dia.backup.length > 0)
            // Quando o dia vai ser substituído, a célula mostra o que VAI
            // entrar: mostrar o que está gravado escondia a troca do backup e
            // a saída de um segundo plantonista.
            const mostrarPrevia = !!prev && (!temGente || prev.substitui)
            return (
              <button
                key={data}
                type="button"
                onClick={() => setEditando(data)}
                aria-label={`Plantão de ${data}`}
                // Enquanto o lote grava, abrir um dia emitiria uma gravação
                // concorrente que o lote passaria por cima.
                disabled={salvando}
                className={cn(
                  'flex min-h-[4.5rem] flex-col gap-0.5 rounded-lg border p-1.5 text-left transition-colors hover:bg-muted/40',
                  ehHoje ? 'border-blue-600 ring-1 ring-blue-600/20' : 'border-border',
                  prev && !temGente && 'border-dashed',
                  prev && prev.substitui && 'border-sem-warning-bd bg-sem-warning/30',
                )}
              >
                <span className="flex items-baseline gap-1">
                  <span className="text-xs tabular-nums text-muted-foreground">{data.slice(8, 10)}</span>
                  {ehHoje && <span className="text-[10px] font-medium text-blue-600">hoje</span>}
                </span>

                {temGente && !mostrarPrevia ? (
                  <>
                    {dia!.agentes.map((a) => (
                      <span key={a.id} className="flex items-center gap-1 text-xs">
                        <span className="truncate">{nomeCurto(a.nome, a.id)}</span>
                        {!a.telefone_ok && <PhoneOff className="h-3 w-3 shrink-0 text-amber-600" aria-label="sem telefone — não recebe aviso" />}
                      </span>
                    ))}
                    {dia!.backup.length > 0 && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        B: {dia!.backup.map((b) => nomeCurto(b.nome, b.id)).join(', ')}
                      </span>
                    )}
                    {dia!.origem !== 'plantao' && (
                      <span className="mt-auto text-[10px] italic text-muted-foreground">
                        {dia!.origem === 'semanal' ? 'escala antiga' : 'diário antigo'}
                      </span>
                    )}
                  </>
                ) : mostrarPrevia && prev ? (
                  // Prévia: ainda não gravado. Cor apagada e borda tracejada
                  // dizem isso sem precisar de legenda.
                  <>
                    <span className="truncate text-xs text-muted-foreground">{nomeDe(prev.agentIds[0])}</span>
                    {prev.backupIds.length > 0 && (
                      <span className="truncate text-[11px] text-muted-foreground">B: {nomeDe(prev.backupIds[0])}</span>
                    )}
                    {prev.semBackupPossivel && (
                      <span className="text-[10px] italic text-muted-foreground">sem backup</span>
                    )}
                    {/* O que SAI, dito por extenso: sem isto a troca do backup
                        e a saída de um segundo plantonista eram invisíveis. */}
                    {prev.substitui && prev.substituindo && (
                      <span className="mt-auto text-[10px] text-sem-warning-fg">
                        sai {prev.substituindo.agentIds.map(nomeDe).join(', ') || '—'}
                        {prev.substituindo.backupIds.length > 0
                          ? ` · B: ${prev.substituindo.backupIds.map(nomeDe).join(', ')}`
                          : ''}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] italic text-muted-foreground">
                    <Plus className="h-3 w-3" /> vazio
                  </span>
                )}

              </button>
            )
          })}
        </div>

        <SequenciaPlantaoPanel
          plantao={plantao}
          backup={backup}
          agentes={equipeComTelefone}
          deducaoPlantao={deducaoPlantao}
          deducaoBackup={deducaoBackup}
          ocupados={ocupados}
          total={doMes.length}
          onPlantao={(ordem) => { setPlantao((s) => ({ ordem, ancora: s.ancora || de })); setPlano(null) }}
          onBackup={(ordem) => { setBackup((s) => ({ ordem, ancora: s.ancora || de })); setPlano(null) }}
          onDeduzir={deduzir}
          onPrever={() => prever(false)}
          trabalhando={salvando}
          // Mexer na fila com o lote em curso fazia a barra de progresso
          // desaparecer, enquanto o laço continuava gravando a fila antiga.
        />

        {plano && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="text-sm">
              <span className="font-medium">
                {plano.dias.length} {plano.dias.length === 1 ? 'dia a preencher' : 'dias a preencher'}
              </span>
              {refazer
                ? plano.dias.some((d) => d.substitui) && (
                  <span className="text-sem-warning-fg">
                    {' '}· {plano.dias.filter((d) => d.substitui).length} já lançados serão trocados
                  </span>
                )
                : <span className="text-muted-foreground"> · nenhum dia já lançado será alterado</span>}
              {plano.dias.some((d) => d.desvioBackup > 0) && (
                <span className="text-muted-foreground">
                  {' '}· em {plano.dias.filter((d) => d.desvioBackup > 0).length} dias o backup andou na fila para não ser a mesma pessoa
                </span>
              )}
              {plano.dias.some((d) => d.semBackupPossivel) && (
                <span className="text-muted-foreground">
                  {' '}· {plano.dias.filter((d) => d.semBackupPossivel).length} sem backup possível
                </span>
              )}
              {plano.semSequencia.length > 0 && (
                <span className="text-muted-foreground"> · {plano.semSequencia.length} sem sequência</span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!refazer && plano.preservados.length > 0 && (
                <Button type="button" variant="ghost" size="sm" disabled={salvando} onClick={() => prever(true)}>
                  Refazer também os {plano.preservados.length} já lançados
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" disabled={salvando} onClick={() => { setPlano(null); setRefazer(false) }}>
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={salvando || !plano.dias.length} onClick={() => void gravarPlano()}>
                {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {salvando && gravados > 0
                  ? `Gravando ${gravados} de ${plano.dias.length}…`
                  : `Gravar ${plano.dias.length === 1 ? 'o dia' : `os ${plano.dias.length} dias`}`}
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          A janela de plantão (seg–sex 18–22, sáb–dom 8–22) é configurada junto com o horário de
          atendimento, em SLA → Horário de atendimento. Fora dela, ninguém é avisado: a conversa
          entra na fila e o plantonista é chamado quando o turno dele começa.
        </p>
      </div>

      {editando && (
        <DiaDoPlantaoDialog
          data={editando}
          escolhidos={porData.get(editando)?.agent_ids ?? []}
          backupEscolhido={porData.get(editando)?.backup_ids ?? []}
          agentes={equipeComTelefone}
          salvando={salvando}
          onFechar={() => setEditando(null)}
          onSalvar={(ids, backupIds) => void salvarDia(editando, ids, backupIds)}
          onLimpar={() => void limparDia(editando)}
        />
      )}
    </div>
  )
}
